import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const SMOKE = fileURLToPath(new URL("../bin/mcp-kit-smoke", import.meta.url));
function consumer(t, body) {
	const dir = mkdtempSync(join(tmpdir(), "mcp-kit-smoke-test-"));
	t.after(() => rmSync(dir, { recursive: true, force: true }));
	const bin = join(dir, "node_modules", ".bin");
	mkdirSync(bin, { recursive: true });
	if (body !== undefined) {
		const wrangler = join(bin, "wrangler");
		writeFileSync(wrangler, `#!/usr/bin/env bash\n${body}\n`);
		chmodSync(wrangler, 0o755);
	}
	return dir;
}
function run(dir, args, env = {}) {
	return new Promise((resolve, reject) => {
		const child = spawn("bash", [SMOKE, ...args], { cwd: dir, env: { ...process.env, TMPDIR: dir, SMOKE_TIMEOUT_SECS: "2", ...env }, stdio: ["ignore", "pipe", "pipe"] });
		let stdout = "", stderr = "";
		child.stdout.on("data", (data) => stdout += data);
		child.stderr.on("data", (data) => stderr += data);
		const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("smoke test exceeded deadline")); }, 5000);
		child.on("close", (code, signal) => { clearTimeout(timer); resolve({ code, signal, stdout, stderr }); });
	});
}
const port = (offset) => String(41000 + (process.pid + offset) % 20000);
const servingWrangler = () => `node -e 'const fs=require("node:fs"),http=require("node:http");if(process.env.PIDFILE)fs.writeFileSync(process.env.PIDFILE,String(process.pid));const s=http.createServer((q,r)=>r.end("ok"));s.listen(Number(process.argv[1]),"127.0.0.1")' -- "$3"`;
function assertDead(pid) { assert.throws(() => process.kill(Number(pid), 0), { code: "ESRCH" }); }

test("smoke reports missing local wrangler with an install hint", async (t) => {
	const dir = consumer(t);
	const result = await run(dir, ["--", "true"]);
	assert.equal(result.code, 127);
	assert.match(result.stderr, /install it in the consumer repo/);
	assert.deepEqual(readdirSync(dir).filter((name) => name.startsWith("mcp-kit-smoke.")), []);
});

test("smoke bounds hung readiness and removes its log", async (t) => {
	const dir = consumer(t, 'echo "$BASHPID" > "$PIDFILE"; sleep 20');
	const pidFile = join(dir, "pid");
	const result = await run(dir, ["--", "true"], { PORT: port(1), PIDFILE: pidFile });
	assert.equal(result.code, 124);
	assert.match(result.stderr, /timed out/);
	assertDead(readFileSync(pidFile, "utf8"));
	assert.deepEqual(readdirSync(dir).filter((name) => name.startsWith("mcp-kit-smoke.")), []);
});

test("smoke reports an early wrangler exit", async (t) => {
	const dir = consumer(t, "exit 9");
	const result = await run(dir, ["--", "true"], { PORT: port(2) });
	assert.equal(result.code, 1);
	assert.match(result.stderr, /exited early/);
	assert.deepEqual(readdirSync(dir).filter((name) => name.startsWith("mcp-kit-smoke.")), []);
});

test("smoke returns probe failure and tears down local wrangler", async (t) => {
	const dir = consumer(t, servingWrangler());
	const pidFile = join(dir, "wrangler.pid");
	const result = await run(dir, ["--", "bash", "-c", "exit 7"], { PORT: port(3), PIDFILE: pidFile });
	assert.equal(result.code, 7);
	assertDead(readFileSync(pidFile, "utf8"));
	assert.deepEqual(readdirSync(dir).filter((name) => name.startsWith("mcp-kit-smoke.")), []);
});

test("smoke handles SIGINT and leaves no supervisor or log", async (t) => {
	const dir = consumer(t, servingWrangler());
	const wranglerPidFile = join(dir, "wrangler.pid");
	const probePidFile = join(dir, "probe.pid");
	const child = spawn("bash", [SMOKE, "--", "bash", "-c", 'echo "$BASHPID" > "$PROBE_PIDFILE"; sleep 20'], { cwd: dir, env: { ...process.env, TMPDIR: dir, PORT: port(4), PIDFILE: wranglerPidFile, PROBE_PIDFILE: probePidFile, SMOKE_TIMEOUT_SECS: "10" }, stdio: "ignore" });
	for (let i = 0; i < 40 && !existsSync(probePidFile); i += 1) await delay(50);
	await delay(300);
	child.kill("SIGINT");
	const outcome = await new Promise((resolve) => child.on("close", (code) => resolve(code)));
	assert.equal(outcome, 130);
	assertDead(readFileSync(wranglerPidFile, "utf8"));
	assertDead(readFileSync(probePidFile, "utf8"));
	await delay(100);
	assert.deepEqual(readdirSync(dir).filter((name) => name.startsWith("mcp-kit-smoke.")), []);
});
