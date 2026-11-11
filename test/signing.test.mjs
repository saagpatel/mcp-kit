import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, linkSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { generateKeypair, signManifest, verifyManifest } from "../lib/signing.mjs";

function setup(t) {
	const dir = mkdtempSync(join(tmpdir(), "mcp-kit-sign-"));
	t.after(() => rmSync(dir, { recursive: true, force: true }));
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

test("gen-key -> sign -> verify roundtrip", (t) => {
	const p = setup(t);
	generateKeypair({ keyPath: p.keyPath, pubPath: p.pubPath });
	const trustedPubPath = join(p.dir, "trusted-publisher.pub");
	writeFileSync(trustedPubPath, readFileSync(p.pubPath));
	signManifest({ manifestPath: p.manifestPath, keyPath: p.keyPath, sigPath: p.sigPath, pubPath: p.pubPath });
	assert.equal(verifyManifest({ manifestPath: p.manifestPath, sigPath: p.sigPath, pubPath: p.pubPath, trustedPubPath }), true);
});

test("tampered manifest fails verification", (t) => {
	const p = setup(t);
	generateKeypair({ keyPath: p.keyPath, pubPath: p.pubPath });
	const trustedPubPath = join(p.dir, "trusted-publisher.pub");
	writeFileSync(trustedPubPath, readFileSync(p.pubPath));
	signManifest({ manifestPath: p.manifestPath, keyPath: p.keyPath, sigPath: p.sigPath, pubPath: p.pubPath });
	writeFileSync(p.manifestPath, JSON.stringify({ name: "test", version: "TAMPERED" }));
	assert.equal(verifyManifest({ manifestPath: p.manifestPath, sigPath: p.sigPath, pubPath: p.pubPath, trustedPubPath }), false);
});

test("verification requires an independently supplied publisher pin", (t) => {
	const p = setup(t);
	generateKeypair({ keyPath: p.keyPath, pubPath: p.pubPath });
	signManifest({ manifestPath: p.manifestPath, keyPath: p.keyPath, sigPath: p.sigPath, pubPath: p.pubPath });
	assert.throws(
		() => verifyManifest({ manifestPath: p.manifestPath, sigPath: p.sigPath, pubPath: p.pubPath }),
		/trustedPubPath is required/,
	);
});

test("a replacement manifest and colocated key cannot impersonate the pinned publisher", (t) => {
	const p = setup(t);
	generateKeypair({ keyPath: p.keyPath, pubPath: p.pubPath });
	const trustedPubPath = join(p.dir, "trusted-publisher.pub");
	writeFileSync(trustedPubPath, readFileSync(p.pubPath));
	const attackerKeyPath = join(p.dir, "attacker.key");
	const attackerPubPath = join(p.dir, "attacker.pub");
	generateKeypair({ keyPath: attackerKeyPath, pubPath: attackerPubPath });
	writeFileSync(p.manifestPath, JSON.stringify({ name: "attacker", version: "9.9.9" }));
	signManifest({ manifestPath: p.manifestPath, keyPath: attackerKeyPath, sigPath: p.sigPath, pubPath: attackerPubPath });
	writeFileSync(p.pubPath, readFileSync(attackerPubPath));
	assert.equal(verifyManifest({ manifestPath: p.manifestPath, sigPath: p.sigPath, pubPath: p.pubPath, trustedPubPath }), false);
});

test("gen-key refuses to overwrite an existing private key", (t) => {
	const p = setup(t);
	generateKeypair({ keyPath: p.keyPath, pubPath: p.pubPath });
	assert.throws(() => generateKeypair({ keyPath: p.keyPath, pubPath: p.pubPath }), /refusing to overwrite/);
});

test("verification refuses to treat the colocated public key as its own trust anchor", (t) => {
	const p = setup(t);
	generateKeypair({ keyPath: p.keyPath, pubPath: p.pubPath });
	signManifest({ manifestPath: p.manifestPath, keyPath: p.keyPath, sigPath: p.sigPath, pubPath: p.pubPath });
	assert.throws(
		() => verifyManifest({ manifestPath: p.manifestPath, sigPath: p.sigPath, pubPath: p.pubPath, trustedPubPath: p.pubPath }),
		/ must not alias /,
	);
});

test("verification refuses a hard-linked bundle key as an independent publisher pin", (t) => {
	const p = setup(t);
	generateKeypair({ keyPath: p.keyPath, pubPath: p.pubPath });
	const trustedPubPath = join(p.dir, "trusted-publisher.pub");
	linkSync(p.pubPath, trustedPubPath);
	const attackerKeyPath = join(p.dir, "attacker.key");
	const attackerPubPath = join(p.dir, "attacker.pub");
	generateKeypair({ keyPath: attackerKeyPath, pubPath: attackerPubPath });
	writeFileSync(p.manifestPath, JSON.stringify({ name: "attacker", version: "9.9.9" }));
	signManifest({ manifestPath: p.manifestPath, keyPath: attackerKeyPath, sigPath: p.sigPath, pubPath: attackerPubPath });
	writeFileSync(p.pubPath, readFileSync(attackerPubPath));
	assert.throws(
		() => verifyManifest({ manifestPath: p.manifestPath, sigPath: p.sigPath, pubPath: p.pubPath, trustedPubPath }),
		/must not alias/,
	);
});

test("CLI verify exits 1 on a tampered manifest", (t) => {
	const p = setup(t);
	generateKeypair({ keyPath: p.keyPath, pubPath: p.pubPath });
	signManifest({ manifestPath: p.manifestPath, keyPath: p.keyPath, sigPath: p.sigPath, pubPath: p.pubPath });
	writeFileSync(p.manifestPath, "{}");
	const trustedPubPath = join(p.dir, "trusted-publisher.pub");
	writeFileSync(trustedPubPath, readFileSync(p.pubPath));
	const res = spawnSync(
		process.execPath,
		[
			fileURLToPath(new URL("../bin/mcp-kit-sign.mjs", import.meta.url)),
			"verify",
			`--manifest=${p.manifestPath}`,
			`--pub=${p.pubPath}`,
			`--sig=${p.sigPath}`,
			`--trusted-pub=${trustedPubPath}`,
		],
		{ encoding: "utf8" },
	);
	assert.equal(res.status, 1);
	assert.match(res.stdout, /INVALID/);
});

test("CLI verify refuses a colocated key without an independent trust anchor", (t) => {
	const p = setup(t);
	generateKeypair({ keyPath: p.keyPath, pubPath: p.pubPath });
	signManifest({ manifestPath: p.manifestPath, keyPath: p.keyPath, sigPath: p.sigPath, pubPath: p.pubPath });
	const res = spawnSync(process.execPath, [
		fileURLToPath(new URL("../bin/mcp-kit-sign.mjs", import.meta.url)), "verify",
		`--manifest=${p.manifestPath}`, `--pub=${p.pubPath}`, `--sig=${p.sigPath}`,
	], { encoding: "utf8" });
	assert.equal(res.status, 2);
	assert.match(res.stderr, /requires --trusted-pub/);
});

test("concurrent gen-key has exactly one winner", async (t) => {
	const p = setup(t);
	const moduleUrl = new URL("../lib/signing.mjs", import.meta.url).href;
	const source = `import {generateKeypair} from ${JSON.stringify(moduleUrl)};try{generateKeypair({keyPath:process.env.KEY_PATH,pubPath:process.env.PUB_PATH});process.exit(0)}catch(e){console.error(e.message);process.exit(1)}`;
	const run = () => new Promise((resolve) => {
		const child = spawn(process.execPath, ["--input-type=module", "-e", source], { env: { ...process.env, KEY_PATH: p.keyPath, PUB_PATH: p.pubPath }, stdio: "ignore" });
		child.once("close", (code) => resolve(code));
	});
	const outcomes = await Promise.all([run(), run()]);
	assert.deepEqual(outcomes.sort(), [0, 1]);
});

test("mismatched public key is refused without changing existing bytes", (t) => {
	const p = setup(t);
	generateKeypair({ keyPath: p.keyPath, pubPath: p.pubPath });
	const otherKey = join(p.dir, "other.key");
	const otherPub = join(p.dir, "other.pub");
	generateKeypair({ keyPath: otherKey, pubPath: otherPub });
	writeFileSync(p.pubPath, readFileSync(otherPub));
	const before = readFileSync(p.pubPath);
	assert.throws(() => signManifest({ manifestPath: p.manifestPath, keyPath: p.keyPath, sigPath: p.sigPath, pubPath: p.pubPath }), /does not match/);
	assert.deepEqual(readFileSync(p.pubPath), before);
	assert.equal(existsSync(p.sigPath), false);
});

test("signing refuses aliased manifest, signature, and key paths", (t) => {
	const p = setup(t);
	assert.throws(() => signManifest({ manifestPath: p.manifestPath, keyPath: p.keyPath, sigPath: p.manifestPath, pubPath: p.pubPath }), /aliased manifest and signature/);
	assert.throws(() => signManifest({ manifestPath: p.manifestPath, keyPath: p.manifestPath, sigPath: p.sigPath, pubPath: p.pubPath }), /aliased manifest and privateKey/);
});

test("private key mode remains 0600 under permissive umask", (t) => {
	const p = setup(t);
	const prior = process.umask(0);
	try { generateKeypair({ keyPath: p.keyPath, pubPath: p.pubPath }); }
	finally { process.umask(prior); }
	assert.equal(statSync(p.keyPath).mode & 0o777, 0o600);
});
