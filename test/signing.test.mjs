import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { generateKeypair, signManifest, verifyManifest } from "../lib/signing.mjs";

function setup() {
	const dir = mkdtempSync(join(tmpdir(), "mcp-kit-sign-"));
	const manifestPath = join(dir, "mcp.json");
	writeFileSync(manifestPath, JSON.stringify({ name: "test", version: "1.0.0" }));
	return {
		dir,
		manifestPath,
		keyPath: join(dir, ".signing", "test.key"),
		pubPath: join(dir, "mcp-ed25519.pub"),
		sigPath: join(dir, "mcp.json.sig"),
	};
}

test("gen-key -> sign -> verify roundtrip", () => {
	const p = setup();
	generateKeypair({ keyPath: p.keyPath, pubPath: p.pubPath });
	signManifest({ manifestPath: p.manifestPath, keyPath: p.keyPath, sigPath: p.sigPath, pubPath: p.pubPath });
	assert.equal(verifyManifest({ manifestPath: p.manifestPath, sigPath: p.sigPath, pubPath: p.pubPath }), true);
});

test("tampered manifest fails verification", () => {
	const p = setup();
	generateKeypair({ keyPath: p.keyPath, pubPath: p.pubPath });
	signManifest({ manifestPath: p.manifestPath, keyPath: p.keyPath, sigPath: p.sigPath, pubPath: p.pubPath });
	writeFileSync(p.manifestPath, JSON.stringify({ name: "test", version: "TAMPERED" }));
	assert.equal(verifyManifest({ manifestPath: p.manifestPath, sigPath: p.sigPath, pubPath: p.pubPath }), false);
});

test("gen-key refuses to overwrite an existing private key", () => {
	const p = setup();
	generateKeypair({ keyPath: p.keyPath, pubPath: p.pubPath });
	assert.throws(() => generateKeypair({ keyPath: p.keyPath, pubPath: p.pubPath }), /refusing to overwrite/);
});

test("CLI verify exits 1 on a tampered manifest", () => {
	const p = setup();
	generateKeypair({ keyPath: p.keyPath, pubPath: p.pubPath });
	signManifest({ manifestPath: p.manifestPath, keyPath: p.keyPath, sigPath: p.sigPath, pubPath: p.pubPath });
	writeFileSync(p.manifestPath, "{}");
	const res = spawnSync(
		process.execPath,
		[
			new URL("../bin/mcp-kit-sign.mjs", import.meta.url).pathname,
			"verify",
			`--manifest=${p.manifestPath}`,
			`--pub=${p.pubPath}`,
			`--sig=${p.sigPath}`,
		],
		{ encoding: "utf8" },
	);
	assert.equal(res.status, 1);
	assert.match(res.stdout, /INVALID/);
});
