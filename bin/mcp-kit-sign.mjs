#!/usr/bin/env node
import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { defaultPaths, generateKeypair, signManifest, verifyManifest } from "../lib/signing.mjs";

const HELP = `Usage: mcp-kit-sign <gen-key|sign|verify> --manifest=PATH [--key=PATH] [--pub=PATH] [--sig=PATH]\n       mcp-kit-sign --help`;
const commands = new Map();
const usageError = (message) => { console.error(`${message}\n${HELP}`); process.exit(2); };
let parsed;
try {
	parsed = parseArgs({ args: process.argv.slice(2), options: {
		help: { type: "boolean" }, manifest: { type: "string" }, key: { type: "string" },
		pub: { type: "string" }, sig: { type: "string" },
	}, strict: true, allowPositionals: true });
} catch (error) { usageError(error.message); }
if (parsed.values.help) { console.log(HELP); process.exit(0); }
if (parsed.positionals.length !== 1) usageError("exactly one command is required");
const [cmd] = parsed.positionals;
if (!new Set(["gen-key", "sign", "verify"]).has(cmd)) usageError(`unknown command "${cmd}"`);
if (!parsed.values.manifest) usageError("--manifest=PATH is required");
const manifestPath = resolve(parsed.values.manifest);
const derived = defaultPaths(manifestPath);
const keyPath = resolve(parsed.values.key ?? ".signing/mcp-ed25519.key");
const pubPath = resolve(parsed.values.pub ?? derived.pubPath);
const sigPath = resolve(parsed.values.sig ?? derived.sigPath);
commands.set("gen-key", () => {
	generateKeypair({ keyPath, pubPath });
	console.log(`private key -> ${keyPath}  (mode 600 — NEVER commit)`);
	console.log(`public key  -> ${pubPath}  (publish this next to the manifest)`);
});
commands.set("sign", () => {
	signManifest({ manifestPath, keyPath, sigPath, pubPath });
	console.log(`signed ${manifestPath}\n  -> ${sigPath}  (base64 Ed25519, detached)\n  -> ${pubPath}  (public key)`);
});
commands.set("verify", () => {
	const ok = verifyManifest({ manifestPath, sigPath, pubPath });
	console.log(ok ? "signature VALID" : "signature INVALID");
	if (!ok) process.exitCode = 1;
});
try { commands.get(cmd)(); }
catch (error) { console.error(error?.message ?? String(error)); process.exitCode = 1; }
