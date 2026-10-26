#!/usr/bin/env node

/**
 * Local packaging script.
 * Automatically packages the application for the current host OS and architecture.
 *
 * Supported commands:
 *   pnpm run package
 *   pnpm run package:local
 *   pnpm run build local
 *   pnpm run build:local
 *   npm run package
 *   npm run build local
 */

import { execSync } from "node:child_process"
import { readdirSync, statSync, existsSync, rmSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, "..")

const platform = process.platform // "darwin" | "win32" | "linux"
const arch = process.arch // "arm64" | "x64"
const isCI = Boolean(process.env.CI || process.env.GITHUB_ACTIONS)

const userArgs = process.argv.slice(2).filter((arg) => arg !== "local")
const isAllArch =
	userArgs.includes("--all") ||
	(isCI &&
		!userArgs.some((a) => a.startsWith("--arm64") || a.startsWith("--x64")))

console.log(
	`\n📦 [package] Packaging MyAgent for ${platform} ${isAllArch ? "(all architectures)" : `(${arch})`}${isCI ? " [CI Mode]" : ""}...\n`,
)

// 1. Clean up stale staging directories from previous interrupted builds if any
const intermediateDir = join(root, "release", `mac-${arch}`)
if (existsSync(intermediateDir)) {
	try {
		rmSync(intermediateDir, { recursive: true, force: true })
	} catch {
		// ignore
	}
}

// 2. Compile client, main and preload bundles
console.log(
	"➡️  Step 1/3: Compiling application bundles (electron-vite build)...",
)
execSync("npx electron-vite build", { cwd: root, stdio: "inherit" })

// 3. Copy native bindings for current arch
console.log(
	"\n➡️  Step 2/3: Copying native bindings (scripts/copy-native-bindings.js)...",
)
execSync("node scripts/copy-native-bindings.js", {
	cwd: root,
	stdio: "inherit",
})

// 4. Package with electron-builder targeting current platform and architecture
console.log(
	`\n➡️  Step 3/3: Packaging installer with electron-builder for ${platform} ${isAllArch ? "(all targets)" : `(${arch})`}...`,
)

const platformFlags = {
	darwin: "--mac",
	win32: "--win",
	linux: "--linux",
}
const platformFlag = platformFlags[platform] || "--mac"

const extraArgs = [platformFlag, "--publish", "never"]

if (
	!isAllArch &&
	!userArgs.some(
		(a) =>
			a.startsWith("--arm64") ||
			a.startsWith("--x64") ||
			a.startsWith("--universal"),
	)
) {
	extraArgs.push(`--${arch}`)
}

if (
	!isAllArch &&
	platform === "darwin" &&
	!userArgs.some((a) => a.includes("target"))
) {
	// Build .dmg installer by default on macOS for local development
	extraArgs.push("-c.mac.target=dmg")
} else if (
	!isAllArch &&
	platform === "win32" &&
	!userArgs.some((a) => a.includes("target"))
) {
	// Build NSIS installer by default on Windows for local development
	extraArgs.push("-c.win.target=nsis")
} else if (
	!isAllArch &&
	platform === "linux" &&
	!userArgs.some((a) => a.includes("target"))
) {
	// Build AppImage by default on Linux for local development
	extraArgs.push("-c.linux.target=AppImage")
}

extraArgs.push(...userArgs.filter((a) => a !== "--all"))

const builderCmd = `npx electron-builder ${extraArgs.join(" ")}`

// Set CSC_IDENTITY_AUTO_DISCOVERY=false for local builds to avoid codesign failure
// with personal/untrusted developer certificates in local keychain
const env = {
	...process.env,
	CSC_IDENTITY_AUTO_DISCOVERY:
		process.env.CSC_IDENTITY_AUTO_DISCOVERY || "false",
}

execSync(builderCmd, { cwd: root, stdio: "inherit", env })

console.log(`\n🎉 [build-local] Local package built successfully!\n`)

// List output artifacts
const releaseDir = join(root, "release")
if (existsSync(releaseDir)) {
	console.log(`Output artifacts in ${releaseDir}:`)
	const files = readdirSync(releaseDir).filter(
		(f) =>
			f.endsWith(".dmg") ||
			f.endsWith(".exe") ||
			f.endsWith(".AppImage") ||
			f.endsWith(".deb") ||
			f.endsWith(".zip"),
	)
	for (const f of files) {
		const stat = statSync(join(releaseDir, f))
		const sizeMB = (stat.size / 1024 / 1024).toFixed(1)
		console.log(`  - ${f} (${sizeMB} MB)`)
	}
}
console.log()
