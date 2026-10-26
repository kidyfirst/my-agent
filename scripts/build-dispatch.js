#!/usr/bin/env node

import { execSync } from "node:child_process"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, "..")

const args = process.argv.slice(2)
const isLocal = args.some((arg) => arg.toLowerCase() === "local")

if (isLocal) {
	// User invoked: `pnpm run build local` or `npm run build local`
	execSync("node scripts/build-local.js", { cwd: root, stdio: "inherit" })
} else {
	// Standard build: `pnpm run build` or `npm run build`
	execSync("npx electron-vite build", { cwd: root, stdio: "inherit" })
}
