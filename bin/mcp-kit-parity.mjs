#!/usr/bin/env node
import { parseArgs } from "node:util";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { checkParity } from "../lib/parity.mjs";

const HELP = "Usage: mcp-kit-parity [--server-json=PATH] [--package=PATH]\n       mcp-kit-parity --help";
let parsed;
try {
	parsed = parseArgs({ args: process.argv.slice(2), options: {
		help: { type: "boolean" }, "server-json": { type: "string" }, package: { type: "string" },
	}, strict: true, allowPositionals: true });
} catch (error) { console.error(`${error.message}\n${HELP}`); process.exit(2); }
if (parsed.values.help) { console.log(HELP); process.exit(0); }
if (parsed.positionals.length) { console.error(`unexpected positional argument: ${parsed.positionals[0]}\n${HELP}`); process.exit(2); }
const serverJsonPath = resolve(parsed.values["server-json"] ?? "server.json");
const packagePath = resolve(parsed.values.package ?? (existsSync("package.json") ? "package.json" : "pyproject.toml"));
try {
	const { ok, version, problems } = checkParity({ serverJsonPath, packagePath });
	if (ok) console.log(`version parity OK: ${version}`);
	else { for (const problem of problems) console.error(`parity FAIL: ${problem}`); process.exitCode = 1; }
} catch (error) { console.error(error?.message ?? String(error)); process.exitCode = 2; }
