# Purpose

Maintain a small, dependency-free Node.js ESM toolkit for MCP server tooling.
Keep implementation changes scoped and reviewable.

# Layout

- `lib/`: public ESM modules and internal protocol validators.
- `bin/`: sign, parity, and smoke command line tools.
- `test/`: Node built-in test runner suites and local fake processes.
- `Makefile`, `package.json`, and `package-lock.json`: setup and checks.

# Setup

Use the Node version in `.node-version` and the exact npm version in
`package.json`'s `packageManager`. Run `make setup` (`npm ci`). Keep production
and development dependencies at zero unless the project owner changes that rule.

# Checks

Run `make check`. It performs syntax checks, `bash -n`, `npm test`, and package
content validation. There is no build, lint, format, or type-check step.

# Boundaries

Keep signing keys private. Private-key creation must be exclusive and mode 0600;
signature replacement must be atomic and public-key mismatches must be rejected
before writes. Every spawned process needs bounded shutdown, escalation, and an
awaited exit. The HTTP probe supports stateless JSON only. Do not add dependencies,
publishing, deployment, full Streamable HTTP, or unrelated modules in routine work.

# Delivery

Preserve unrelated work. Report exact checks and limitations. Do not claim hosted
CI, Cloudflare behavior, or human acceptance from local tests.
