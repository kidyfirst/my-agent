import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
	resolve: {
		alias: {
			"@my-agent/core": path.resolve(__dirname, "./packages/core/src/index.ts"),
			"@my-agent/a2a": path.resolve(__dirname, "./packages/a2a/src/index.ts"),
		},
	},
	test: {
		testTimeout: 30000,
	},
})
