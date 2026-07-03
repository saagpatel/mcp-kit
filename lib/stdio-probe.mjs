// Generic MCP stdio probe driver: spawn a stdio MCP server, speak
// newline-delimited JSON-RPC (MCP stdio framing — one message per line, not
// LSP Content-Length headers), run initialize + tools/list with the shared
// protocol assertions, then any domain-specific tool calls.

import { spawn } from "node:child_process";

function parseLines(buf) {
	const messages = [];
	let rest = buf;
	let nl = rest.indexOf("\n");
	while (nl >= 0) {
		const line = rest.slice(0, nl).trim();
		rest = rest.slice(nl + 1);
		if (line) messages.push(JSON.parse(line));
		nl = rest.indexOf("\n");
	}
	return { messages, rest };
}

/**
 * Probe a stdio MCP server end to end.
 *
 * @param command  executable to spawn (e.g. "node")
 * @param args     argv (e.g. ["dist/stdio.js"])
 * @param expect   { serverName, tools, requireReadOnly = true, calls = [], timeoutMs = 5000 }
 *                 calls: [{ name, arguments }] — run in order after tools/list
 * @returns        { serverInfo, tools, callResults } — callResults aligned with `calls`
 */
export async function probeStdioServer(command, args, expect = {}) {
	const {
		serverName,
		tools: expectedTools,
		requireReadOnly = true,
		calls = [],
		timeoutMs = 5000,
		protocolVersion = "2025-06-18",
		clientName = "mcp-kit-probe",
	} = expect;

	const proc = spawn(command, args, { stdio: ["pipe", "pipe", "inherit"] });
	const received = [];
	let buf = "";
	proc.stdout.on("data", (chunk) => {
		buf += chunk.toString("utf8");
		const { messages, rest } = parseLines(buf);
		buf = rest;
		received.push(...messages);
	});

	const send = (msg) => proc.stdin.write(`${JSON.stringify(msg)}\n`);
	const waitFor = (count) =>
		new Promise((resolve, reject) => {
			const start = Date.now();
			const tick = setInterval(() => {
				if (received.length >= count) {
					clearInterval(tick);
					resolve();
				} else if (Date.now() - start > timeoutMs) {
					clearInterval(tick);
					reject(new Error(`timed out waiting for ${count} response(s), got ${received.length}`));
				}
			}, 10);
		});

	try {
		send({
			jsonrpc: "2.0",
			id: 1,
			method: "initialize",
			params: {
				protocolVersion,
				capabilities: {},
				clientInfo: { name: clientName, version: "1.0.0" },
			},
		});
		await waitFor(1);
		const serverInfo = received[0]?.result?.serverInfo;
		if (serverName && serverInfo?.name !== serverName) {
			throw new Error(
				`initialize returned server ${JSON.stringify(serverInfo?.name)}, ` +
					`expected ${JSON.stringify(serverName)}`,
			);
		}
		send({ jsonrpc: "2.0", method: "notifications/initialized" });

		send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
		await waitFor(2);
		const tools = received[1]?.result?.tools || [];
		const toolNames = tools.map((tool) => tool.name).sort();
		if (expectedTools) {
			const expected = [...expectedTools].sort();
			if (JSON.stringify(toolNames) !== JSON.stringify(expected)) {
				throw new Error(
					`tools/list mismatch: expected ${JSON.stringify(expected)}, got ${JSON.stringify(toolNames)}`,
				);
			}
		}
		if (requireReadOnly && !tools.every((tool) => tool.annotations?.readOnlyHint === true)) {
			throw new Error("not every tool is annotated readOnlyHint=true");
		}

		const callResults = [];
		for (let i = 0; i < calls.length; i += 1) {
			const id = 3 + i;
			send({
				jsonrpc: "2.0",
				id,
				method: "tools/call",
				params: { name: calls[i].name, arguments: calls[i].arguments ?? {} },
			});
			await waitFor(3 + i);
			callResults.push(received[2 + i]?.result);
		}

		return { serverInfo, tools, callResults };
	} finally {
		proc.kill();
	}
}
