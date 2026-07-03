#!/usr/bin/env node
// Minimal newline-framed JSON-RPC MCP server fixture for stdio-probe tests.

import { createInterface } from "node:readline";

const TOOLS = [
	{ name: "get_thing", annotations: { readOnlyHint: true } },
	{ name: "list_things", annotations: { readOnlyHint: true } },
];

const rl = createInterface({ input: process.stdin });
rl.on("line", (line) => {
	if (!line.trim()) return;
	const msg = JSON.parse(line);
	if (msg.method === "notifications/initialized") return; // notification: no reply
	let result;
	if (msg.method === "initialize") {
		result = {
			protocolVersion: msg.params.protocolVersion,
			serverInfo: { name: "fixture-server", version: "0.0.1" },
			capabilities: { tools: {} },
		};
	} else if (msg.method === "tools/list") {
		result = { tools: TOOLS };
	} else if (msg.method === "tools/call") {
		result = { content: [{ type: "text", text: JSON.stringify({ echo: msg.params }) }] };
	} else {
		process.stdout.write(
			`${JSON.stringify({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: "nope" } })}\n`,
		);
		return;
	}
	process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: msg.id, result })}\n`);
});
