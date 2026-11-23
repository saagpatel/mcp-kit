# saagar-mcp-kit

Shared toolbelt for the baked-corpus MCP server franchise. One copy of the
scaffolding that every server previously carried as hand-forked scripts:
Ed25519 manifest signing, HTTP and stdio protocol probes, server.json version
parity, Worker CORS helpers, and a wrangler smoke harness.

Zero runtime dependencies. Node >= 22. To test a fresh clone, see **Testing**.
To use this checkout in a consumer project, install it as a **devDependency**
from that project (assuming the clone is at `../mcp-kit`). The npm registry's
0.1.0 release lacks the pinned verifier used below. Signing, probes, parity,
and smoke are development tools. Bundle the Worker helpers with your Worker.

```sh
npm install --save-dev ../mcp-kit
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

Run the CLI examples from the consumer project. Its npm scripts can use the bin
names directly. In a shell, run `export PATH="$PWD/node_modules/.bin:$PATH"` first.

### Signing

Start with your manifest at `.well-known/mcp.json`. For verification, provision
`publisher-pin.pub` through an independently authenticated channel.

```sh
mcp-kit-sign gen-key --manifest=.well-known/mcp.json   # one-time keypair
mcp-kit-sign sign    --manifest=.well-known/mcp.json   # detached .sig + pubkey
mcp-kit-sign verify  --manifest=.well-known/mcp.json --trusted-pub=publisher-pin.pub
```

The manifest is signed as raw bytes (no canonicalization): serve the exact
bytes that were signed, and re-sign after any manifest change. The private key
defaults to `.signing/mcp-ed25519.key` (gitignore `.signing/`; never commit it).
Verification requires `--trusted-pub` to point to a publisher key obtained and
pinned independently of the manifest/signature bundle. The bundled public key
(by default `mcp-ed25519.pub` beside the manifest, overridable with `--pub`)
is checked against that pin; by itself it establishes integrity only, not who
published the bundle. Keep the pin in an independently trusted configuration
or deliver it through a separately authenticated channel.

This is a breaking verifier change: existing library or CLI callers without an
independently provisioned pin will fail closed. Update each caller with its
publisher's separately authenticated pin before using the new verifier.
Callers that need a machine-readable assurance should use
`mcp-kit-sign verify-pinned` with the same flags as `verify`. Its JSON result
includes the policy and verification status from that invocation.

### Probing a stateless JSON HTTP (Worker) server

The HTTP probe supports stateless JSON request/response only. Streamable HTTP
SSE responses, session headers, and initialized notifications are outside its scope.
Supply your server's `endpoint` URL and search `query` in the probe script.

```js
// scripts/probe-mcp.mjs — the repo keeps only its domain expectations
import { probeHttpServer, rpc, parseToolPayload } from "saagar-mcp-kit/http-probe";

const summary = await probeHttpServer(endpoint, {
	serverName: "saagarpatel-portfolio",
	tools: ["get_document", "get_profile", "list_corpus", "search" /* ... */],
	timeoutMs: 5000, // optional; default 5000. Bounds each initialize / tools/list request.
});
// domain calls:
const search = await rpc(endpoint, 3, "tools/call", { name: "search", arguments: { query } }, {
	timeoutMs: 5000, // optional; default 5000. Aborts the request if the Worker hangs.
});
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

The check compares `server.json`'s top-level version and each `packages[].version`
with the package manifest version. Run this in CI for every
franchise repo — npm and PyPI alike.

### Smoke harness

```sh
mcp-kit-smoke -- node scripts/probe-mcp.mjs --endpoint "http://127.0.0.1:{port}/mcp"
```

Boots `wrangler dev` on a free port by default. Any HTTP status from `/mcp`
starts the probe. The harness substitutes `{port}` in its arguments, runs it,
and tears down.

## Adopting in a franchise repo

Three-step wiring (portfolio-mcp shown; operant-mcp is identical in shape):

1. `npm install --save-dev ../mcp-kit`
2. Replace scripts in `package.json`:
   ```json
   "sign": "mcp-kit-sign sign --manifest=../portfolio-index/.well-known/mcp.json",
   "smoke": "mcp-kit-smoke -- node scripts/probe-mcp.mjs --endpoint http://127.0.0.1:{port}/mcp",
   "parity": "mcp-kit-parity"
   ```
3. Rewrite `scripts/probe-mcp.mjs` to import the kit's driver and keep only the
   repo's expected-tools list, server name, and domain calls; delete
   `scripts/sign-manifest.mjs` and `scripts/smoke-mcp.sh`.

For parity alone, Python franchise repos can invoke the bin without adding an
npm dependency to their project:

```sh
npm exec --package=saagar-mcp-kit -- mcp-kit-parity --server-json=server.json --package=pyproject.toml
```

The TOML reader matches an unindented, double-quoted `version = "..."` line in
`[project]`. It compares the string literally and does not resolve dynamic versions.

## Roadmap (deliberately not in v0.1)

- `mcp-kit-embed` — bake signed well-known files into TS string constants
  (generalizing operant-mcp's `build-wellknown.mjs`).
- BM25 search module — only one franchise server uses it today; extraction
  waits for a second consumer.

## Testing

From the kit checkout, run these with the toolchain versions below.

```sh
make setup
make check
```

There is no build, lint, format, or type-check step. The smoke harness expects
Bash, Node.js, curl, and the consumer repository's local `./node_modules/.bin/wrangler`.
`PORT` can select a port. Readiness and probe execution share the
`SMOKE_TIMEOUT_SECS` timeout (default 120 seconds).

Node 18 support was removed; Node 22 is the minimum supported major version.

## Status

### Stack

Dependency-free Node.js ESM package. Node.js 22 and newer are supported; the
repository toolchain is pinned to Node.js 26.11.1 and npm 12.2.0.

### Known risks

The HTTP probe is intentionally stateless JSON and does not implement the full
Streamable HTTP session/SSE lifecycle. The smoke harness needs the consumer's
local Wrangler installation and has not been exercised against Cloudflare here.

### Next steps

Run `make check` locally and rely on the Node.js matrix and macOS CI jobs for
cross-platform coverage. Full Streamable HTTP support remains a separate design decision.

MIT.
