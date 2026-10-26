import { defineConfig, externalizeDepsPlugin } from "electron-vite"
import react from "@vitejs/plugin-react"
import { resolve } from "path"

export default defineConfig({
	main: {
		plugins: [
			externalizeDepsPlugin({
				include: ["@ast-grep/napi", "node-pty", "playwright-core"],
			}),
		],
		build: {
			outDir: "dist/main",
			rollupOptions: {
				input: "src/electron/main.ts",
				external: ["@ast-grep/napi", "node-pty", "playwright-core"],
				output: {
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
				input: "src/electron/preload.ts",
				output: {
					format: "cjs",
				},
			},
		},
	},
	renderer: {
		root: "src/renderer",
		plugins: [react()],
		build: {
			outDir: resolve(__dirname, "dist/renderer"),
			rollupOptions: {
				input: resolve(__dirname, "src/renderer/index.html"),
			},
		},
	},
})
