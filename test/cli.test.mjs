import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = new URL("../", import.meta.url);
const cli = (name) => fileURLToPath(new URL(`bin/${name}`, root));
function run(name, args) {
	return spawnSync(name.endsWith("smoke") ? "bash" : process.execPath,
		name.endsWith("smoke") ? [cli(name), ...args] : [cli(name), ...args], { encoding: "utf8" });
}

test("sign rejects inherited command names, unknown flags, and extra positionals", () => {
	assert.equal(run("mcp-kit-sign.mjs", ["toString", "--manifest=/x"]).status, 2);
	assert.equal(run("mcp-kit-sign.mjs", ["verify", "--manifest=/x", "--mystery"]).status, 2);
	assert.equal(run("mcp-kit-sign.mjs", ["verify", "extra", "--manifest=/x"]).status, 2);
});

test("parity rejects inherited command names, unknown flags, and positionals", () => {
	assert.equal(run("mcp-kit-parity.mjs", ["toString"]).status, 2);
	assert.equal(run("mcp-kit-parity.mjs", ["--mystery"]).status, 2);
	assert.equal(run("mcp-kit-parity.mjs", ["unexpected"]).status, 2);
});

test("all three CLIs provide --help", () => {
	for (const name of ["mcp-kit-sign.mjs", "mcp-kit-parity.mjs", "mcp-kit-smoke"]) {
		const result = run(name, ["--help"]);
		assert.equal(result.status, 0, `${name}: ${result.stderr}`);
		assert.match(result.stdout, /Usage:/);
	}
});
