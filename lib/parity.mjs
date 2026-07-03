// Language-neutral version-parity check between an MCP registry server.json and
// the package manifest it publishes from. The registry is version-keyed, so a
// release whose server.json lags its package version silently serves a stale
// registry entry — every franchise repo re-implements (or forgets) this test.
//
// Supports package.json (npm) and pyproject.toml (PEP 621). The TOML read is a
// deliberate line-match, not a parser, to stay dependency-free: it requires a
// plain `version = "x.y.z"` line in [project], which every franchise repo has.

import { readFileSync } from "node:fs";
import { basename } from "node:path";

function manifestVersion(packagePath) {
	const raw = readFileSync(packagePath, "utf8");
	if (basename(packagePath) === "package.json") {
		const version = JSON.parse(raw).version;
		if (typeof version !== "string") throw new Error(`${packagePath}: no "version" field`);
		return version;
	}
	if (basename(packagePath) === "pyproject.toml") {
		const project = raw.split(/^\[/m).find((s) => s.startsWith("project]"));
		const m = (project ?? "").match(/^version\s*=\s*"([^"]+)"/m);
		if (!m) throw new Error(`${packagePath}: no [project] version = "..." line`);
		return m[1];
	}
	throw new Error(`unsupported manifest: ${packagePath} (need package.json or pyproject.toml)`);
}

/**
 * Check server.json <-> package manifest version parity.
 *
 * @returns { ok, version, problems } — problems is a list of human-readable
 *          mismatch descriptions; ok is true when it is empty.
 */
export function checkParity({ serverJsonPath, packagePath }) {
	const server = JSON.parse(readFileSync(serverJsonPath, "utf8"));
	const version = manifestVersion(packagePath);
	const problems = [];

	if (server.version !== version) {
		problems.push(
			`server.json version "${server.version}" != ${basename(packagePath)} version "${version}"`,
		);
	}
	for (const [i, pkg] of (server.packages ?? []).entries()) {
		if (pkg.version !== version) {
			problems.push(
				`server.json packages[${i}] (${pkg.identifier ?? "?"}) version ` +
					`"${pkg.version}" != ${basename(packagePath)} version "${version}"`,
			);
		}
	}
	return { ok: problems.length === 0, version, problems };
}
