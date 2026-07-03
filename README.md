# saagar-mcp-kit

Shared toolbelt for the baked-corpus MCP server franchise. One copy of the
scaffolding that every server previously carried as hand-forked scripts:
Ed25519 manifest signing, HTTP and stdio protocol probes, server.json version
parity, Worker CORS helpers, and a wrangler smoke harness.

Zero runtime dependencies. Node >= 18. Install as a **devDependency** — nothing
here ships in a server's runtime bundle.

```sh
npm install --save-dev saagar-mcp-kit
```

## What's inside

| Surface | Import / bin | Replaces (per repo) |
|---|---|---|
| Ed25519 manifest signing | `mcp-kit-sign` CLI, `saagar-mcp-kit/signing` | `scripts/sign-manifest.mjs` |
| HTTP probe driver | `saagar-mcp-kit/http-probe` | the generic half of `scripts/probe-mcp.mjs` (HTTP flavor) |
| stdio probe driver | `saagar-mcp-kit/stdio-probe` | the generic half of `scripts/probe-mcp.mjs` (stdio flavor) |
| Worker CORS shell helpers | `saagar-mcp-kit/worker-shell` | the CORS block + 404/405/preflight responses in `src/index.ts` |
| Version parity check | `mcp-kit-parity` CLI, `saagar-mcp-kit/parity` | the per-repo server.json↔manifest parity test |
| wrangler smoke harness | `mcp-kit-smoke` CLI | `scripts/smoke-mcp.sh` |

Domain knowledge stays in each repo: expected tool lists, server names, and
domain tool-call assertions live in a thin per-repo probe script built on the
kit's drivers.

## Usage

### Signing

```sh
mcp-kit-sign gen-key --manifest=.well-known/mcp.json   # one-time keypair
mcp-kit-sign sign    --manifest=.well-known/mcp.json   # detached .sig + pubkey
mcp-kit-sign verify  --manifest=.well-known/mcp.json   # exit 0 valid / 1 invalid
```

The manifest is signed as raw bytes (no canonicalization): serve the exact
bytes that were signed, and re-sign after any manifest change. The private key
defaults to `.signing/mcp-ed25519.key` (gitignore `.signing/`; never commit it).

### Probing an HTTP (Worker) server

```js
// scripts/probe-mcp.mjs — the repo keeps only its domain expectations
import { probeHttpServer, rpc, parseToolPayload } from "saagar-mcp-kit/http-probe";

const summary = await probeHttpServer(endpoint, {
	serverName: "saagarpatel-portfolio",
	tools: ["get_document", "get_profile", "list_corpus", "search" /* ... */],
});
// domain calls:
const search = await rpc(endpoint, 3, "tools/call", { name: "search", arguments: { query } });
const payload = parseToolPayload(search.json.result, "search");
```

### Probing a stdio server

```js
import { probeStdioServer } from "saagar-mcp-kit/stdio-probe";

const { serverInfo, tools, callResults } = await probeStdioServer("node", ["dist/stdio.js"], {
	serverName: "operant-mcp",
	tools: ["compare_models", "get_case", "get_methodology", "get_results", "list_cases"],
	calls: [{ name: "get_results", arguments: {} }],
});
```

### Worker CORS shell

```ts
import {
	preflightResponse,
	notFoundResponse,
	methodNotAllowedResponse,
	withCors,
} from "saagar-mcp-kit/worker-shell";

if (request.method === "OPTIONS") return preflightResponse();
if (url.pathname !== "/mcp") return notFoundResponse("/mcp", { site });
if (request.method !== "POST") return methodNotAllowedResponse("/mcp");
// ...SDK transport wiring stays in the repo...
return withCors(await transport.handleRequest(request));
```

### Version parity (CI gate)

```sh
mcp-kit-parity                                # server.json vs package.json/pyproject.toml
mcp-kit-parity --server-json=server.json --package=pyproject.toml
```

The MCP registry is version-keyed: a release whose server.json lags its package
version silently serves a stale registry entry. Run this in CI for every
franchise repo — npm and PyPI alike.

### Smoke harness

```sh
mcp-kit-smoke -- node scripts/probe-mcp.mjs --endpoint "http://127.0.0.1:{port}/mcp"
```

Boots `wrangler dev` on a free port, waits until `/mcp` answers, substitutes
`{port}` into the probe command, runs it, and tears down.

## Adopting in a franchise repo

Three-step wiring (portfolio-mcp shown; operant-mcp is identical in shape):

1. `npm install --save-dev saagar-mcp-kit`
2. Replace scripts in `package.json`:
   ```json
   "sign": "mcp-kit-sign sign --manifest=../portfolio-index/.well-known/mcp.json",
   "smoke": "mcp-kit-smoke -- node scripts/probe-mcp.mjs --endpoint http://127.0.0.1:{port}/mcp",
   "parity": "mcp-kit-parity"
   ```
3. Rewrite `scripts/probe-mcp.mjs` to import the kit's driver and keep only the
   repo's expected-tools list, server name, and domain calls; delete
   `scripts/sign-manifest.mjs` and `scripts/smoke-mcp.sh`.

Python franchise repos (MCPAudit, mcp-trust, shadow-mcp, mcpforge) can adopt
`mcp-kit-parity` in CI without any npm dependency in the package itself:
`npx saagar-mcp-kit`'s bin or a pinned dev tool step.

## Roadmap (deliberately not in v0.1)

- `mcp-kit-embed` — bake signed well-known files into TS string constants
  (generalizing operant-mcp's `build-wellknown.mjs`).
- BM25 search module — only one franchise server uses it today; extraction
  waits for a second consumer.

## Testing

```sh
npm test   # node --test, no dependencies
```

MIT.
