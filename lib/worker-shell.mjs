// Framework-free helpers for the Cloudflare Worker transport shell shared by
// baked-corpus MCP servers: the CORS contract and the three non-MCP response
// shapes. Uses only Web-standard Request/Response (Workers and Node >= 18),
// so the kit stays dependency-free. The SDK-coupled transport wiring
// (McpServer + WebStandardStreamableHTTPServerTransport) stays in each repo.

export const MCP_CORS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type, Mcp-Session-Id, MCP-Protocol-Version, Accept",
	"Access-Control-Expose-Headers": "Mcp-Session-Id",
};

/** 204 CORS preflight. */
export function preflightResponse() {
	return new Response(null, { status: 204, headers: MCP_CORS });
}

/** 404 for non-endpoint paths; `extra` merges into the JSON body (e.g. site). */
export function notFoundResponse(mcpEndpoint, extra = {}) {
	return Response.json(
		{ error: "Not found", mcp_endpoint: mcpEndpoint, ...extra },
		{ status: 404, headers: MCP_CORS },
	);
}

/** 405 for non-POST on the endpoint. */
export function methodNotAllowedResponse(mcpEndpoint, allowed = ["POST", "OPTIONS"]) {
	return Response.json(
		{ error: "Method not allowed", mcp_endpoint: mcpEndpoint, allowed_methods: allowed },
		{ status: 405, headers: { ...MCP_CORS, Allow: allowed.join(", ") } },
	);
}

/** Re-wrap a transport response with the CORS headers overlaid. */
export function withCors(res) {
	const headers = new Headers(res.headers);
	for (const [k, v] of Object.entries(MCP_CORS)) headers.set(k, v);
	return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}
