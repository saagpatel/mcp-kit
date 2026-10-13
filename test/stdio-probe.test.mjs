import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { probeStdioServer } from "../lib/stdio-probe.mjs";

const FIXTURE = fileURLToPath(new URL("./fixtures/fake-stdio-server.mjs", import.meta.url));
const ADVERSARIAL = fileURLToPath(new URL("./fixtures/adversarial-stdio-server.mjs", import.meta.url));

function runAdversarial(t, mode, extraEnv = {}) {
	const dir = mkdtempSync(join(tmpdir(), "mcp-kit-stdio-"));
	t.after(() => rmSync(dir, { recursive: true, force: true }));
	const pidFile = join(dir, "pid");
	const promise = probeStdioServer(process.execPath, [ADVERSARIAL], {
		serverName: "fixture-server", tools: ["echo"], calls: [{ name: "echo" }], timeoutMs: 250,
		env: { PROBE_MODE: mode, PROBE_PID_FILE: pidFile, ...extraEnv },
	});
	return { promise, pidFile };
}

test("probeStdioServer runs initialize + tools/list + calls", async () => {
	const { serverInfo, tools, callResults } = await probeStdioServer(
		process.execPath,
		[FIXTURE],
		{
			serverName: "fixture-server",
			tools: ["get_thing", "list_things"],
			calls: [{ name: "get_thing", arguments: { id: "x" } }],
		},
	);
	assert.equal(serverInfo.name, "fixture-server");
	assert.equal(tools.length, 2);
	assert.equal(callResults.length, 1);
	const text = callResults[0]?.content?.[0]?.text;
	assert.match(text, /"get_thing"/);
});

test("probeStdioServer rejects a tool-set mismatch", async () => {
	await assert.rejects(
		probeStdioServer(process.execPath, [FIXTURE], {
			serverName: "fixture-server",
			tools: ["only_this"],
		}),
		/tools\/list mismatch/,
	);
});

test("probeStdioServer rejects a wrong server name", async () => {
	await assert.rejects(
		probeStdioServer(process.execPath, [FIXTURE], { serverName: "impostor" }),
		/expected "impostor"/,
	);
});

test("stdio correlates ids and rejects JSON-RPC errors", async (t) => {
	const wrong = runAdversarial(t, "wrong-id");
	await assert.rejects(wrong.promise, /response id mismatch/);
	const errored = runAdversarial(t, "error");
	await assert.rejects(errored.promise, /initialize JSON-RPC error/);
	const toolError = runAdversarial(t, "tool-error");
	await assert.rejects(toolError.promise, /tools\/call returned isError:true/);
});

test("stdio handles interleaved notifications and split UTF-8", async (t) => {
	const interleaved = runAdversarial(t, "interleaved");
	assert.equal((await interleaved.promise).serverInfo.name, "fixture-server");
	const split = runAdversarial(t, "split-utf8");
	const result = await split.promise;
	assert.match(result.callResults[0].content[0].text, /café/);
});

test("stdio rejects malformed frames and early child exit promptly", async (t) => {
	const malformed = runAdversarial(t, "malformed");
	await assert.rejects(malformed.promise, /malformed JSON/);
	const early = runAdversarial(t, "early-exit");
	await assert.rejects(early.promise, /exited early/);
	const started = Date.now();
	await assert.rejects(probeStdioServer("/definitely/missing/mcp-kit-server", [], { timeoutMs: 200 }), /failed to spawn/);
	assert.ok(Date.now() - started < 1500);
});

test("stdio escalates shutdown for child that ignores SIGTERM", async (t) => {
	const { promise, pidFile } = runAdversarial(t, "ignore-term");
	const started = Date.now();
	await promise;
	assert.ok(Date.now() - started < 2000);
	assert.equal(existsSync(pidFile), true);
	const pid = Number(readFileSync(pidFile, "utf8"));
	await delay(50);
	assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
});
