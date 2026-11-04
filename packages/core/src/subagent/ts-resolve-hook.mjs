// Resolve hook that lets plain Node load this package straight from TypeScript
// source inside a Worker thread.
//
// Two gaps have to be closed for that to work:
//
//   1. Relative imports are written ESM-style (`./foo.js`) for the bundler, but
//      on disk only `./foo.ts` exists until the package is built. A few omit the
//      extension entirely. Bare Node does not remap either shape.
//   2. Some dependencies (`vscode-jsonrpc/node`) are CommonJS packages whose
//      subpaths have no ESM `exports` entry. Node's ESM resolver rejects them
//      while `require.resolve` finds them fine.
//
// A built package resolves everything on the first try and never reaches either
// fallback, so this file is inert in production.

import { createRequire } from "node:module"
import { existsSync } from "node:fs"
import { fileURLToPath, pathToFileURL } from "node:url"

const require = createRequire(import.meta.url)

export async function resolve(specifier, context, nextResolve) {
	try {
		return await nextResolve(specifier, context)
	} catch (err) {
		const parentURL = context.parentURL
		if (!parentURL?.startsWith("file:")) throw err

		const isRelative = specifier.startsWith("./") || specifier.startsWith("../")

		if (isRelative) {
			const base = specifier.endsWith(".js") ? specifier.replace(/\.js$/, "") : specifier
			for (const suffix of [".ts", "/index.ts"]) {
				const url = new URL(base + suffix, parentURL)
				if (existsSync(fileURLToPath(url))) {
					return { url: url.href, shortCircuit: true }
				}
			}
		} else if (!specifier.includes(":")) {
			// CommonJS-style fallback for dependencies with no ESM entry for the subpath.
			try {
				const resolved = require.resolve(specifier, { paths: [fileURLToPath(new URL(".", parentURL))] })
				if (resolved) {
					return { url: pathToFileURL(resolved).href, shortCircuit: true }
				}
			} catch {
				// Fall through to the original error.
			}
		}

		throw err
	}
}
