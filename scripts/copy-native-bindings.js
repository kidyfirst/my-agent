/**
 * Copies platform-specific native bindings into @ast-grep/napi
 * so they can be resolved via local path (./file.node) in the packaged app.
 *
 * pnpm stores optional platform deps in .pnpm/ rather than hoisting them,
 * so electron-builder's extraResources can't find them. This script copies
 * the .node binary directly into the @ast-grep/napi directory before packaging.
 */
import { cpSync, existsSync, readdirSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, "..")
const pnpmDir = join(root, "node_modules", ".pnpm")
const napiDir = join(root, "node_modules", "@ast-grep", "napi")

const platform = process.platform
const arch = process.arch

const platformMap = {
	"darwin-arm64": "ast-grep-napi.darwin-arm64.node",
	"darwin-x64": "ast-grep-napi.darwin-x64.node",
	"linux-x64": "ast-grep-napi.linux-x64-gnu.node",
	"linux-arm64": "ast-grep-napi.linux-arm64-gnu.node",
	"win32-x64": "ast-grep-napi.win32-x64-msvc.node",
	"win32-arm64": "ast-grep-napi.win32-arm64-msvc.node",
	"win32-ia32": "ast-grep-napi.win32-ia32-msvc.node",
}

const key = `${platform}-${arch}`
const nodeFile = platformMap[key]

if (!nodeFile) {
	console.warn(`No native binding mapping for ${key}, skipping copy`)
	process.exit(0)
}

// 1. If it already exists in napiDir, we are done
const dest = join(napiDir, nodeFile)
if (existsSync(dest)) {
	console.log(`Native binding ${nodeFile} already exists in ${napiDir}`)
	process.exit(0)
}

// 2. Find the .node file in the pnpm store or node_modules
let copied = false
if (existsSync(pnpmDir)) {
	const entries = readdirSync(pnpmDir).filter(
		(e) => e.includes("ast-grep") && e.includes(platform),
	)

	for (const entry of entries) {
		const searchDir = join(pnpmDir, entry, "node_modules", "@ast-grep")
		if (!existsSync(searchDir)) continue

		for (const sub of readdirSync(searchDir)) {
			const nodeFilePath = join(searchDir, sub, nodeFile)
			if (existsSync(nodeFilePath)) {
				cpSync(nodeFilePath, dest)
				console.log(`Copied ${nodeFile} to ${napiDir}`)
				copied = true
				break
			}
		}
		if (copied) break
	}
}

// 3. Fallback: check direct subpackages in node_modules/@ast-grep
if (!copied) {
	const astGrepRoot = join(root, "node_modules", "@ast-grep")
	if (existsSync(astGrepRoot)) {
		for (const sub of readdirSync(astGrepRoot)) {
			const candidate = join(astGrepRoot, sub, nodeFile)
			if (existsSync(candidate)) {
				cpSync(candidate, dest)
				console.log(`Copied ${nodeFile} from ${candidate} to ${napiDir}`)
				copied = true
				break
			}
		}
	}
}

if (!copied) {
	console.warn(
		`Could not find ${nodeFile} in pnpm store or node_modules, proceeding with default bundle`,
	)
}
