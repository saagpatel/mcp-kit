import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export function missingPackageEntries(packageJson, packJson) {
	const parsed = typeof packJson === "string" ? JSON.parse(packJson) : packJson;
	const packed = Array.isArray(parsed) ? parsed[0] : Object.values(parsed)[0];
	if (!packed || !Array.isArray(packed.files)) {
		throw new TypeError("npm pack output did not contain a files array");
	}
	const files = new Set(packed.files.map((file) => file.path));
	const required = [
		...Object.values(packageJson.exports).map((entry) => entry.startsWith("./") ? entry.slice(2) : entry),
		...Object.values(packageJson.bin),
	];
	return required.filter((file) => !files.has(file));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	let input = "";
	process.stdin.setEncoding("utf8");
	process.stdin.on("data", (chunk) => { input += chunk; });
	process.stdin.on("end", async () => {
		try {
			const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
			const missing = missingPackageEntries(packageJson, input);
			if (missing.length) {
				console.error(`npm pack missing: ${missing.join(", ")}`);
				process.exitCode = 1;
			}
		} catch (error) {
			console.error(error?.message ?? String(error));
			process.exitCode = 1;
		}
	});
}
