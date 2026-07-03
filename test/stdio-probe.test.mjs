import assert from "node:assert/strict";
import { test } from "node:test";
import { probeStdioServer } from "../lib/stdio-probe.mjs";

const FIXTURE = new URL("./fixtures/fake-stdio-server.mjs", import.meta.url).pathname;

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
