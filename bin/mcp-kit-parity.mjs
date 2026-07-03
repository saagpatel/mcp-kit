#!/usr/bin/env node
// server.json <-> package manifest version parity check.
//
//   mcp-kit-parity [--server-json=server.json] [--package=package.json|pyproject.toml]
//
// Exits 0 on parity, 1 on mismatch, 2 on usage/read errors. Run it in CI so a
// release can't ship a stale registry entry.

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { checkParity } from "../lib/parity.mjs";

const args = process.argv.slice(2);
const flag = (name, def) => {
	const pre = `--${name}=`;
	return args.find((a) => a.startsWith(pre))?.slice(pre.length) ?? def;
};

const serverJsonPath = resolve(flag("server-json", "server.json"));
const packageFlag = flag("package");
const packagePath = resolve(
	packageFlag ?? (existsSync("package.json") ? "package.json" : "pyproject.toml"),
);

try {
	const { ok, version, problems } = checkParity({ serverJsonPath, packagePath });
	if (ok) {
		console.log(`version parity OK: ${version}`);
		process.exit(0);
	}
	for (const p of problems) console.error(`parity FAIL: ${p}`);
	process.exit(1);
} catch (err) {
	console.error(err?.message ?? String(err));
	process.exit(2);
}
