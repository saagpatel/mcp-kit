import assert from "node:assert/strict";
import test from "node:test";
import { missingPackageEntries } from "../scripts/check-package-content.mjs";

const packageJson = {
	name: "fixture-package",
	exports: { "./api": "./lib/api.mjs" },
	bin: { "fixture-cli": "bin/cli.mjs" },
};
const files = [{ path: "lib/api.mjs" }, { path: "bin/cli.mjs" }];

test("package content validator accepts npm array output", () => {
	assert.deepEqual(missingPackageEntries(packageJson, JSON.stringify([{ files }])), []);
});

test("package content validator accepts npm object output", () => {
	assert.deepEqual(missingPackageEntries(packageJson, JSON.stringify({ "fixture-package": { files } })), []);
});

test("package content validator reports a missing required entry", () => {
	const missingOutput = { "fixture-package": { files: [{ path: "lib/api.mjs" }] } };
	assert.deepEqual(
		missingPackageEntries(packageJson, JSON.stringify(missingOutput)),
		["bin/cli.mjs"],
	);
});

test("package content validator rejects an unknown npm output shape", () => {
	assert.throws(() => missingPackageEntries(packageJson, JSON.stringify({ unexpected: true })), /files array/);
});
