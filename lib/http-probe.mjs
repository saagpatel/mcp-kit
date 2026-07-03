// Generic MCP streamable-HTTP probe driver: JSON-RPC transport plus the
// protocol-level assertions every baked-corpus server shares (initialize
// answers with the right server name; tools/list matches the expected set;
// every tool is annotated read-only). Domain-specific tool calls stay in each
// server's own probe script, built on `rpc` / `parseToolPayload`.

/** POST one JSON-RPC message; throws on HTTP, parse, or JSON-RPC errors. */
export async function rpc(endpoint, id, method, params) {
	const res = await fetch(endpoint, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Accept: "application/json, text/event-stream",
		},
		body: JSON.stringify({
			jsonrpc: "2.0",
			id,
			method,
			...(params === undefined ? {} : { params }),
		}),
	});
	const text = await res.text();
	let json;
	try {
		json = JSON.parse(text);
	} catch (err) {
		throw new Error(`${method} returned non-JSON HTTP ${res.status}: ${text.slice(0, 300)}`, {
			cause: err,
		});
	}
	if (res.status !== 200) {
		throw new Error(`${method} returned HTTP ${res.status}: ${text.slice(0, 300)}`);
	}
	if (json.error) {
		throw new Error(`${method} JSON-RPC error: ${JSON.stringify(json.error)}`);
	}
	return {
		status: res.status,
		contentType: res.headers.get("content-type"),
		allowOrigin: res.headers.get("access-control-allow-origin"),
		json,
	};
}

/** Extract and parse the JSON text payload of a tools/call result. */
export function parseToolPayload(result, label) {
	const text = result?.content?.[0]?.text;
	if (typeof text !== "string") throw new Error(`${label} returned no text payload`);
	return JSON.parse(text);
}

function assertSame(actual, expected, label) {
	const a = JSON.stringify(actual);
	const e = JSON.stringify(expected);
	if (a !== e) throw new Error(`${label} mismatch: expected ${e}, got ${a}`);
}

/**
 * Run the shared protocol probe: initialize + tools/list with assertions.
 *
 * @param endpoint  streamable-HTTP MCP endpoint URL
 * @param expect    { serverName, tools, requireReadOnly = true, clientName, protocolVersion }
 * @returns         { endpoint, initialize, toolsList } summary for reporting
 */
export async function probeHttpServer(endpoint, expect) {
	const {
		serverName,
		tools: expectedTools,
		requireReadOnly = true,
		clientName = "mcp-kit-probe",
		protocolVersion = "2025-06-18",
	} = expect;

	const initialize = await rpc(endpoint, 1, "initialize", {
		protocolVersion,
		capabilities: {},
		clientInfo: { name: clientName, version: "1.0.0" },
	});
	if (serverName && initialize.json.result?.serverInfo?.name !== serverName) {
		throw new Error(
			`initialize returned server ${JSON.stringify(
				initialize.json.result?.serverInfo?.name,
			)}, expected ${JSON.stringify(serverName)}`,
		);
	}

	const toolsList = await rpc(endpoint, 2, "tools/list");
	const tools = toolsList.json.result?.tools || [];
	const toolNames = tools.map((tool) => tool.name).sort();
	if (expectedTools) assertSame(toolNames, [...expectedTools].sort(), "tools/list");
	if (requireReadOnly && !tools.every((tool) => tool.annotations?.readOnlyHint === true)) {
		throw new Error("not every tool is annotated readOnlyHint=true");
	}

	return {
		endpoint,
		initialize: {
			status: initialize.status,
			contentType: initialize.contentType,
			allowOrigin: initialize.allowOrigin,
			serverInfo: initialize.json.result.serverInfo,
			protocolVersion: initialize.json.result.protocolVersion,
		},
		toolsList: {
			status: toolsList.status,
			contentType: toolsList.contentType,
			allowOrigin: toolsList.allowOrigin,
			count: tools.length,
			tools: tools.map((tool) => ({
				name: tool.name,
				readOnly: tool.annotations?.readOnlyHint === true,
			})),
		},
	};
}
