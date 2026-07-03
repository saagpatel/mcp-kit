#!/usr/bin/env node
// Ed25519 manifest signing CLI.
//
//   mcp-kit-sign gen-key --manifest=PATH [--key=PATH] [--pub=PATH]
//   mcp-kit-sign sign    --manifest=PATH [--key=PATH] [--pub=PATH] [--sig=PATH]
//   mcp-kit-sign verify  --manifest=PATH [--pub=PATH] [--sig=PATH]
//
// --manifest is required (no machine-shaped defaults). --key defaults to
// .signing/mcp-ed25519.key under the CWD; pub/sig default to sitting next to
// the manifest. The private key is NEVER committed.

import { resolve } from "node:path";
import { defaultPaths, generateKeypair, signManifest, verifyManifest } from "../lib/signing.mjs";

const args = process.argv.slice(2);
const cmd = args.find((a) => !a.startsWith("--")) ?? "verify";
const flag = (name, def) => {
	const pre = `--${name}=`;
	return args.find((a) => a.startsWith(pre))?.slice(pre.length) ?? def;
};

const manifestFlag = flag("manifest");
if (!manifestFlag) {
	console.error("--manifest=PATH is required");
	process.exit(2);
}
const manifestPath = resolve(manifestFlag);
const derived = defaultPaths(manifestPath);
const keyPath = resolve(flag("key", ".signing/mcp-ed25519.key"));
const pubPath = resolve(flag("pub", derived.pubPath));
const sigPath = resolve(flag("sig", derived.sigPath));

const commands = {
	"gen-key": () => {
		generateKeypair({ keyPath, pubPath });
		console.log(`private key -> ${keyPath}  (chmod 600 — NEVER commit)`);
		console.log(`public key  -> ${pubPath}  (publish this next to the manifest)`);
	},
	sign: () => {
		signManifest({ manifestPath, keyPath, sigPath, pubPath });
		console.log(`signed ${manifestPath}`);
		console.log(`  -> ${sigPath}  (base64 Ed25519, detached)`);
		console.log(`  -> ${pubPath}  (public key)`);
	},
	verify: () => {
		const ok = verifyManifest({ manifestPath, sigPath, pubPath });
		console.log(ok ? "signature VALID" : "signature INVALID");
		process.exit(ok ? 0 : 1);
	},
};

const run = commands[cmd];
if (!run) {
	console.error(`unknown command "${cmd}" — use: gen-key | sign | verify`);
	process.exit(2);
}
try {
	run();
} catch (err) {
	console.error(err?.message ?? String(err));
	process.exit(1);
}
