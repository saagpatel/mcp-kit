import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { checkParity } from "../lib/parity.mjs";

function fixtures(serverVersion, pkgVersion, pkgEntryVersion = serverVersion) {
	const dir = mkdtempSync(join(tmpdir(), "mcp-kit-parity-"));
	const serverJsonPath = join(dir, "server.json");
	writeFileSync(
		serverJsonPath,
		JSON.stringify({
			name: "io.github.example/thing",
			version: serverVersion,
			packages: [{ registryType: "npm", identifier: "thing", version: pkgEntryVersion }],
		}),
	);
	const packageJsonPath = join(dir, "package.json");
	writeFileSync(packageJsonPath, JSON.stringify({ name: "thing", version: pkgVersion }));
	const pyprojectPath = join(dir, "pyproject.toml");
	writeFileSync(
		pyprojectPath,
		`[project]\nname = "thing"\nversion = "${pkgVersion}"\n\n[tool.other]\nversion = "9.9.9"\n`,
	);
	return { serverJsonPath, packageJsonPath, pyprojectPath };
}

test("parity OK when all versions match (npm)", () => {
	const f = fixtures("1.2.3", "1.2.3");
	const res = checkParity({ serverJsonPath: f.serverJsonPath, packagePath: f.packageJsonPath });
	assert.equal(res.ok, true);
	assert.equal(res.version, "1.2.3");
});

test("parity OK against pyproject.toml, ignoring non-project version lines", () => {
	const f = fixtures("1.2.3", "1.2.3");
	const res = checkParity({ serverJsonPath: f.serverJsonPath, packagePath: f.pyprojectPath });
	assert.equal(res.ok, true);
});

test("top-level server.json version drift is reported", () => {
	const f = fixtures("1.2.3", "1.3.0", "1.3.0");
	const res = checkParity({ serverJsonPath: f.serverJsonPath, packagePath: f.packageJsonPath });
	assert.equal(res.ok, false);
	assert.equal(res.problems.length, 1);
	assert.match(res.problems[0], /server\.json version "1\.2\.3"/);
});

test("packages[] entry drift is reported with its identifier", () => {
	const f = fixtures("1.3.0", "1.3.0", "1.2.3");
	const res = checkParity({ serverJsonPath: f.serverJsonPath, packagePath: f.packageJsonPath });
	assert.equal(res.ok, false);
	assert.match(res.problems[0], /packages\[0\] \(thing\)/);
});
