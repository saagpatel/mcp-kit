// Generic MCP stdio probe driver using newline-delimited JSON-RPC.
import { spawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import {
	validateInitializeResult,
	validateResponse,
	validateToolCallResult,
	validateToolsResult,
} from "./internal/protocol.mjs";

const MAX_FRAME_BYTES = 1024 * 1024;
const SHUTDOWN_GRACE_MS = 300;

/**
 * Probe a stdio MCP server end to end.
 * @param {string} command executable to spawn
 * @param {string[]} args executable arguments
 * @param {object} expect expected server/tool details and timeoutMs
 */
export async function probeStdioServer(command, args, expect = {}) {
	const {
		serverName, tools: expectedTools, requireReadOnly = true, calls = [], timeoutMs = 5000,
		protocolVersion = "2025-06-18", clientName = "mcp-kit-probe",
	} = expect;
	const proc = spawn(command, args, { stdio: ["pipe", "pipe", "inherit"], env: { ...process.env, ...(expect.env ?? {}) } });
	const pending = new Map();
	const decoder = new StringDecoder("utf8");
	let buffer = "";
	let terminalError;
	let exiting = false;
	let exitResolve;
	const exited = new Promise((resolve) => { exitResolve = resolve; });
	const failAll = (error) => {
		if (!terminalError) terminalError = error;
		for (const [id, request] of pending) {
			clearTimeout(request.timer);
			request.reject(terminalError);
			pending.delete(id);
		}
	};
	proc.once("error", (error) => failAll(new Error(`failed to spawn ${command}: ${error.message}`, { cause: error })));
	proc.once("exit", (code, signal) => {
		exitResolve({ code, signal });
		if (!exiting) failAll(new Error(`stdio server exited early (code ${code}, signal ${signal})`));
	});
	proc.stdin.on("error", (error) => failAll(new Error(`stdio server stdin write failed: ${error.message}`, { cause: error })));
	proc.stdout.on("data", (chunk) => {
		if (terminalError) return;
		buffer += decoder.write(chunk);
		if (Buffer.byteLength(buffer) > MAX_FRAME_BYTES && !buffer.includes("\n")) {
			failAll(new Error(`stdio server exceeded ${MAX_FRAME_BYTES} byte frame limit`));
			return;
		}
		let newline;
		while ((newline = buffer.indexOf("\n")) !== -1) {
			const line = buffer.slice(0, newline).trim();
			buffer = buffer.slice(newline + 1);
			if (!line) continue;
			if (Buffer.byteLength(line) > MAX_FRAME_BYTES) {
				failAll(new Error(`stdio server exceeded ${MAX_FRAME_BYTES} byte frame limit`));
				return;
			}
			let message;
			try { message = JSON.parse(line); }
			catch (error) {
				failAll(new Error(`stdio server returned malformed JSON: ${error.message}`, { cause: error }));
				return;
			}
			// Server notifications have no id and are deliberately not matched to calls.
			if (!message || !Object.hasOwn(message, "id")) continue;
			const request = pending.get(message.id);
			if (!request) {
				const active = pending.values().next().value;
				if (active) failAll(new Error(`${active.method} response id mismatch: expected ${JSON.stringify(active.id)}, got ${JSON.stringify(message.id)}`));
				continue;
			}
			pending.delete(message.id);
			clearTimeout(request.timer);
			try { request.resolve(validateResponse(message, request.id, request.method)); }
			catch (error) { request.reject(error); }
		}
		if (Buffer.byteLength(buffer) > MAX_FRAME_BYTES) failAll(new Error(`stdio server exceeded ${MAX_FRAME_BYTES} byte frame limit`));
	});
	proc.stdout.on("end", () => {
		buffer += decoder.end();
		if (buffer.trim()) failAll(new Error("stdio server closed with an incomplete JSON-RPC frame"));
	});
	const notify = (method) => {
		if (terminalError) throw terminalError;
		proc.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method })}\n`);
	};
	const request = (id, method, params) => {
		if (terminalError) return Promise.reject(terminalError);
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				pending.delete(id);
				reject(new Error(`${method} timed out after ${timeoutMs}ms waiting for stdio response`));
			}, timeoutMs);
			pending.set(id, { id, method, resolve, reject, timer });
			proc.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, ...(params === undefined ? {} : { params }) })}\n`, (error) => {
				if (error && pending.has(id)) {
					failAll(new Error(`${method} stdin write failed: ${error.message}`, { cause: error }));
				}
			});
		});
	};
	try {
		const init = await request(1, "initialize", {
			protocolVersion, capabilities: {}, clientInfo: { name: clientName, version: "1.0.0" },
		});
		const serverInfo = validateInitializeResult(init);
		if (serverName && serverInfo.name !== serverName) {
			throw new Error(`initialize returned server ${JSON.stringify(serverInfo.name)}, expected ${JSON.stringify(serverName)}`);
		}
		notify("notifications/initialized");
		const tools = validateToolsResult(await request(2, "tools/list"));
		const toolNames = tools.map((tool) => tool.name).sort();
		if (expectedTools && JSON.stringify(toolNames) !== JSON.stringify([...expectedTools].sort())) {
			throw new Error(`tools/list mismatch: expected ${JSON.stringify([...expectedTools].sort())}, got ${JSON.stringify(toolNames)}`);
		}
		if (requireReadOnly && !tools.every((tool) => tool.annotations?.readOnlyHint === true)) {
			throw new Error("not every tool is annotated readOnlyHint=true");
		}
		const callResults = [];
		for (let i = 0; i < calls.length; i += 1) {
			const method = "tools/call";
			const result = await request(3 + i, method, { name: calls[i].name, arguments: calls[i].arguments ?? {} });
			callResults.push(validateToolCallResult(result, method));
		}
		return { serverInfo, tools, callResults };
	} finally {
		exiting = true;
		try { proc.stdin.end(); } catch {}
		if (proc.exitCode === null && proc.signalCode === null) {
			proc.kill("SIGTERM");
			let graceTimer;
			const grace = new Promise((resolve) => { graceTimer = setTimeout(() => resolve(false), SHUTDOWN_GRACE_MS); });
			const exitedGracefully = await Promise.race([exited.then(() => true), grace]);
			clearTimeout(graceTimer);
			if (!exitedGracefully && proc.exitCode === null && proc.signalCode === null) proc.kill("SIGKILL");
		}
		if (proc.exitCode === null && proc.signalCode === null) await exited;
	}
}
