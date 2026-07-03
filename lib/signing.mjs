// Ed25519 signing for public MCP discovery manifests (.well-known/mcp.json), so an
// agent or registry can verify a manifest authentically comes from its publisher.
// Zero deps (Node built-in crypto). Detached signature + published public key.
//
// The manifest is signed as RAW BYTES (no canonicalization), so the serving origin
// must serve the exact bytes that were signed — re-sign after any manifest change.
//
// The PRIVATE key must live outside the published tree (conventionally .signing/,
// gitignored) and is NEVER committed. The PUBLIC key and detached signature sit next
// to the manifest so verifiers can fetch all three.

import {
	createPrivateKey,
	createPublicKey,
	generateKeyPairSync,
	sign as edSign,
	verify as edVerify,
} from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** Derive the default pub/sig paths from the manifest location. */
export function defaultPaths(manifestPath) {
	return {
		pubPath: `${dirname(manifestPath)}/mcp-ed25519.pub`,
		sigPath: `${manifestPath}.sig`,
	};
}

/**
 * Generate an Ed25519 keypair. Refuses to overwrite an existing private key.
 * Returns the written paths.
 */
export function generateKeypair({ keyPath, pubPath }) {
	if (existsSync(keyPath)) {
		throw new Error(`refusing to overwrite existing private key: ${keyPath}`);
	}
	const { publicKey, privateKey } = generateKeyPairSync("ed25519");
	mkdirSync(dirname(keyPath), { recursive: true });
	writeFileSync(keyPath, privateKey.export({ type: "pkcs8", format: "pem" }));
	chmodSync(keyPath, 0o600);
	mkdirSync(dirname(pubPath), { recursive: true });
	writeFileSync(pubPath, publicKey.export({ type: "spki", format: "pem" }));
	return { keyPath, pubPath };
}

/**
 * Sign the manifest's raw bytes; write a detached base64 signature. Writes the
 * public key next to it when missing. Returns the written paths.
 */
export function signManifest({ manifestPath, keyPath, sigPath, pubPath }) {
	const priv = createPrivateKey(readFileSync(keyPath));
	const signature = edSign(null, readFileSync(manifestPath), priv); // Ed25519: algorithm = null
	writeFileSync(sigPath, `${signature.toString("base64")}\n`);
	if (!existsSync(pubPath)) {
		writeFileSync(pubPath, createPublicKey(priv).export({ type: "spki", format: "pem" }));
	}
	return { sigPath, pubPath };
}

/** Verify the manifest's raw bytes against the detached signature. */
export function verifyManifest({ manifestPath, sigPath, pubPath }) {
	const pub = createPublicKey(readFileSync(pubPath));
	const signature = Buffer.from(readFileSync(sigPath, "utf8").trim(), "base64");
	return edVerify(null, readFileSync(manifestPath), pub, signature);
}
