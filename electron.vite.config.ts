import { defineConfig, externalizeDepsPlugin } from "electron-vite"
import react from "@vitejs/plugin-react"
import { resolve } from "path"

export default defineConfig({
	main: {
		resolve: {
			alias: {
				"@my-agent/core": resolve(__dirname, "packages/core/src/index.ts"),
				"@my-agent/a2a": resolve(__dirname, "packages/a2a/src/index.ts"),
				"@my-agent/cli": resolve(__dirname, "packages/cli/src/index.ts"),
			},
		},
		plugins: [
			externalizeDepsPlugin({
				include: ["@ast-grep/napi", "node-pty", "playwright-core"],
			}),
		],
		build: {
			outDir: "dist/main",
			rollupOptions: {
				input: {
					main: resolve(__dirname, "apps/desktop/src/electron/main.ts"),
					"subagent-worker": resolve(
						__dirname,
						"packages/core/src/subagent/worker-entry.ts",
					),
				},
				external: ["@ast-grep/napi", "node-pty", "playwright-core"],
				output: {
					entryFileNames: "[name].cjs",
					format: "cjs",
					banner: `(() => {
	const origEmitWarning = process.emitWarning;
	process.emitWarning = function(warning, ...args) {
		if (typeof warning === "string" && warning.includes("SQLite")) return;
		if (warning && typeof warning === "object" && warning.message && warning.message.includes("SQLite")) return;
		return origEmitWarning.apply(process, [warning, ...args]);
	};
})();`,
				},
			},
		},
	},
	preload: {
		plugins: [externalizeDepsPlugin()],
		build: {
			outDir: "dist/preload",
			rollupOptions: {
				input: "apps/desktop/src/electron/preload.ts",
				output: {
					format: "cjs",
				},
			},
		},
	},
	renderer: {
		root: "apps/desktop/src/renderer",
		resolve: {
			alias: {
				"@my-agent/core": resolve(__dirname, "packages/core/src/client.ts"),
				"@my-agent/a2a": resolve(__dirname, "packages/a2a/src/index.ts"),
				"@my-agent/cli": resolve(__dirname, "packages/cli/src/index.ts"),
			},
		},
		plugins: [react()],
		build: {
			outDir: resolve(__dirname, "dist/renderer"),
			rollupOptions: {
				input: resolve(__dirname, "apps/desktop/src/renderer/index.html"),
			},
		},
	},
})
