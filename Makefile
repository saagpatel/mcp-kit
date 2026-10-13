.PHONY: setup check

setup:
	npm ci

check:
	@missing=0; for tool in node bash npm; do if ! command -v "$$tool" >/dev/null 2>&1; then echo "missing required tool: $$tool" >&2; missing=1; fi; done; if [ "$$missing" -ne 0 ]; then echo "Setup: install Node.js $$(cat .node-version) (which includes npm), then run make setup." >&2; exit 1; fi
	@set -eu; for f in lib/*.mjs lib/internal/*.mjs bin/*.mjs test/*.mjs; do node --check "$$f"; done
	bash -n bin/mcp-kit-smoke
	npm test
	@set -eu; cache=$$(node -e 'process.stdout.write(require("node:fs").mkdtempSync(".make-check-cache-"))'); trap 'node -e '"'"'require("node:fs").rmSync(process.argv[1],{recursive:true,force:true})'"'"' "$$cache"' EXIT; npm_config_cache="$$cache" npm pack --dry-run --json | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{const p=require("./package.json"), j=JSON.parse(s)[0], files=new Set(j.files.map(f=>f.path));const required=[...Object.values(p.exports).map(x=>x.replace(/^\.\//,"")),...Object.values(p.bin)];const missing=required.filter(f=>!files.has(f));if(missing.length){console.error(`npm pack missing: ${missing.join(", ")}`);process.exit(1)}})'
