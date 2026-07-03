import assert from "node:assert/strict";
import { test } from "node:test";
import {
	MCP_CORS,
	methodNotAllowedResponse,
	notFoundResponse,
	preflightResponse,
	withCors,
} from "../lib/worker-shell.mjs";

test("preflight is 204 with the CORS contract", () => {
	const res = preflightResponse();
	assert.equal(res.status, 204);
	assert.equal(res.headers.get("Access-Control-Allow-Origin"), "*");
	assert.equal(res.headers.get("Access-Control-Expose-Headers"), "Mcp-Session-Id");
});

test("notFound carries the endpoint hint and extras", async () => {
	const res = notFoundResponse("/mcp", { site: "https://example.dev" });
	assert.equal(res.status, 404);
	const body = await res.json();
	assert.equal(body.mcp_endpoint, "/mcp");
	assert.equal(body.site, "https://example.dev");
});

test("methodNotAllowed sets the Allow header", () => {
	const res = methodNotAllowedResponse("/mcp");
	assert.equal(res.status, 405);
	assert.equal(res.headers.get("Allow"), "POST, OPTIONS");
});

test("withCors overlays every CORS header onto an existing response", () => {
	const res = withCors(new Response("x", { status: 200, headers: { "x-existing": "kept" } }));
	assert.equal(res.headers.get("x-existing"), "kept");
	for (const [k, v] of Object.entries(MCP_CORS)) {
		assert.equal(res.headers.get(k), v);
	}
});
