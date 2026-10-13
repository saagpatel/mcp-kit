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
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync, unlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";

function pathIdentity(path) {
	const absolute = resolve(path);
	try { return realpathSync(absolute); }
	catch {
		try { return resolve(realpathSync(dirname(absolute)), absolute.slice(dirname(absolute).length + 1)); }
		catch { return absolute; }
	}
}

function refuseAliases(paths) {
	const entries = Object.entries(paths).filter(([, path]) => path);
	for (let i = 0; i < entries.length; i += 1) {
		for (let j = i + 1; j < entries.length; j += 1) {
			if (pathIdentity(entries[i][1]) === pathIdentity(entries[j][1])) {
				throw new Error(`refusing aliased ${entries[i][0]} and ${entries[j][0]} paths`);
			}
		}
	}
}

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
	refuseAliases({ privateKey: keyPath, publicKey: pubPath });
	const { publicKey, privateKey } = generateKeyPairSync("ed25519");
	mkdirSync(dirname(keyPath), { recursive: true });
	try {
		writeFileSync(keyPath, privateKey.export({ type: "pkcs8", format: "pem" }), { flag: "wx", mode: 0o600 });
	} catch (error) {
		if (error.code === "EEXIST") throw new Error(`refusing to overwrite existing private key: ${keyPath}`);
		throw error;
	}
	mkdirSync(dirname(pubPath), { recursive: true });
	writeFileSync(pubPath, publicKey.export({ type: "spki", format: "pem" }));
	return { keyPath, pubPath };
}

/**
 * Sign the manifest's raw bytes; write a detached base64 signature. Writes the
 * public key next to it when missing. Returns the written paths.
 */
export function signManifest({ manifestPath, keyPath, sigPath, pubPath }) {
	refuseAliases({ manifest: manifestPath, signature: sigPath, privateKey: keyPath, publicKey: pubPath });
	const priv = createPrivateKey(readFileSync(keyPath));
	const derivedPublic = createPublicKey(priv);
	if (existsSync(pubPath)) {
		const existingPublic = createPublicKey(readFileSync(pubPath));
		if (!existingPublic.export({ type: "spki", format: "der" }).equals(derivedPublic.export({ type: "spki", format: "der" }))) {
			throw new Error(`existing public key does not match private key: ${pubPath}`);
		}
	}
	const signature = edSign(null, readFileSync(manifestPath), priv); // Ed25519: algorithm = null
	if (!existsSync(pubPath)) writeFileSync(pubPath, derivedPublic.export({ type: "spki", format: "pem" }), { flag: "wx" });
	mkdirSync(dirname(sigPath), { recursive: true });
	const tempPath = resolve(dirname(sigPath), `.${Date.now()}-${process.pid}-${Math.random().toString(16).slice(2)}.sig.tmp`);
	try {
		writeFileSync(tempPath, `${signature.toString("base64")}\n`, { flag: "wx", mode: 0o600 });
		renameSync(tempPath, sigPath);
	} finally {
		if (existsSync(tempPath)) unlinkSync(tempPath);
	}
	return { sigPath, pubPath };
}

/** Verify the manifest's raw bytes against the detached signature. */
export function verifyManifest({ manifestPath, sigPath, pubPath }) {
	const pub = createPublicKey(readFileSync(pubPath));
	const signature = Buffer.from(readFileSync(sigPath, "utf8").trim(), "base64");
	return edVerify(null, readFileSync(manifestPath), pub, signature);
}
