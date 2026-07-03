import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { parseToolPayload, probeHttpServer, rpc } from "../lib/http-probe.mjs";

const TOOLS = [
	{ name: "get_thing", annotations: { readOnlyHint: true } },
	{ name: "list_things", annotations: { readOnlyHint: true } },
];

function fixtureServer({ readOnly = true } = {}) {
	return createServer((req, res) => {
		let body = "";
		req.on("data", (c) => {
			body += c;
		});
		req.on("end", () => {
			const msg = JSON.parse(body);
			let result;
			if (msg.method === "initialize") {
				result = {
					protocolVersion: msg.params.protocolVersion,
					serverInfo: { name: "fixture-server", version: "0.0.1" },
				};
			} else if (msg.method === "tools/list") {
				result = {
					tools: TOOLS.map((t) => ({
						...t,
						annotations: { readOnlyHint: readOnly },
					})),
				};
			} else if (msg.method === "tools/call") {
				result = { content: [{ type: "text", text: JSON.stringify({ echo: msg.params.name }) }] };
			}
			res.setHeader("content-type", "application/json");
			res.setHeader("access-control-allow-origin", "*");
			res.end(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result }));
		});
	});
}

async function withServer(server, fn) {
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	const endpoint = `http://127.0.0.1:${server.address().port}/mcp`;
	try {
		return await fn(endpoint);
	} finally {
		server.close();
	}
}

test("probeHttpServer passes against a conforming server", async () => {
	await withServer(fixtureServer(), async (endpoint) => {
		const summary = await probeHttpServer(endpoint, {
			serverName: "fixture-server",
			tools: ["list_things", "get_thing"],
		});
		assert.equal(summary.toolsList.count, 2);
		assert.equal(summary.initialize.serverInfo.name, "fixture-server");
		assert.equal(summary.toolsList.allowOrigin, "*");
	});
});

test("probeHttpServer rejects a wrong server name", async () => {
	await withServer(fixtureServer(), async (endpoint) => {
		await assert.rejects(
			probeHttpServer(endpoint, { serverName: "other-server" }),
			/expected "other-server"/,
		);
	});
});

test("probeHttpServer rejects a tool-set mismatch", async () => {
	await withServer(fixtureServer(), async (endpoint) => {
		await assert.rejects(
			probeHttpServer(endpoint, { serverName: "fixture-server", tools: ["get_thing"] }),
			/tools\/list mismatch/,
		);
	});
});

test("probeHttpServer rejects missing readOnlyHint", async () => {
	await withServer(fixtureServer({ readOnly: false }), async (endpoint) => {
		await assert.rejects(
			probeHttpServer(endpoint, { serverName: "fixture-server" }),
			/readOnlyHint/,
		);
	});
});

test("rpc + parseToolPayload drive a domain tool call", async () => {
	await withServer(fixtureServer(), async (endpoint) => {
		const call = await rpc(endpoint, 3, "tools/call", { name: "get_thing", arguments: {} });
		const payload = parseToolPayload(call.json.result, "get_thing");
		assert.deepEqual(payload, { echo: "get_thing" });
	});
});
