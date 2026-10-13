import { createInterface } from "node:readline";
import { writeFileSync } from "node:fs";

const mode = process.env.PROBE_MODE;
if (process.env.PROBE_PID_FILE) writeFileSync(process.env.PROBE_PID_FILE, String(process.pid));
if (mode === "early-exit") process.exit(7);
if (mode === "ignore-term") {
	process.on("SIGTERM", () => {});
	setInterval(() => {}, 1000);
}
const input = createInterface({ input: process.stdin });
input.on("line", (line) => {
	const msg = JSON.parse(line);
	if (msg.method === "notifications/initialized") return;
	if (mode === "malformed") { process.stdout.write("{broken\n"); return; }
	if (mode === "error") {
		process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: msg.id, error: { code: -32000, message: "denied" } })}\n`);
		return;
	}
	const id = mode === "wrong-id" ? `${msg.id}-wrong` : msg.id;
	const result = msg.method === "initialize"
		? { serverInfo: { name: "fixture-server", version: "1" }, protocolVersion: "2025-06-18" }
		: msg.method === "tools/list" ? { tools: [{ name: "echo", annotations: { readOnlyHint: true } }] }
			: mode === "tool-error" ? { isError: true, content: [{ type: "text", text: "failed" }] }
				: { content: [{ type: "text", text: "café" }] };
	const response = `${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`;
	if (mode === "interleaved") process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/progress", params: { progress: 1 } })}\n`);
	if (mode === "split-utf8") {
		const bytes = Buffer.from(response);
		const split = bytes.indexOf(Buffer.from("é")) + 1;
		process.stdout.write(bytes.subarray(0, split));
		setTimeout(() => process.stdout.write(bytes.subarray(split)), 5);
	} else process.stdout.write(response);
});
