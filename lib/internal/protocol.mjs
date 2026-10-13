/** Validate a response envelope and correlate it with its request. */
export function validateResponse(message, id, method) {
	if (!message || typeof message !== "object" || Array.isArray(message)) {
		throw new Error(`${method} returned an invalid JSON-RPC response`);
	}
	if (message.jsonrpc !== "2.0") throw new Error(`${method} returned an invalid JSON-RPC version`);
	if (message.id !== id) {
		throw new Error(`${method} response id mismatch: expected ${JSON.stringify(id)}, got ${JSON.stringify(message.id)}`);
	}
	if (message.error !== undefined) {
		throw new Error(`${method} JSON-RPC error: ${JSON.stringify(message.error)}`);
	}
	return message.result;
}

export function validateInitializeResult(result, method = "initialize") {
	if (!result || typeof result.serverInfo !== "object" || result.serverInfo === null) {
		throw new Error(`${method} result.serverInfo is required`);
	}
	return result.serverInfo;
}

export function validateToolsResult(result, method = "tools/list") {
	if (!result || !Array.isArray(result.tools)) {
		throw new Error(`${method} result.tools must be an array`);
	}
	return result.tools;
}

export function validateToolCallResult(result, method) {
	if (result?.isError === true) throw new Error(`${method} returned isError:true`);
	return result;
}
