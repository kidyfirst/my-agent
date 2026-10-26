import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { execSync } from "child_process"

if (process.platform !== "darwin") {
	process.exit(0)
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, "..")

try {
	const pkgPath = join(root, "package.json")
	if (!existsSync(pkgPath)) process.exit(0)

	const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"))
	const appName = pkg.build?.productName || pkg.productName || "My Agent"
	const appId = pkg.build?.appId || "com.myagent.app"

	// Find all Electron.app Info.plist locations
	const plistPaths = new Set()

	const directPath = join(
		root,
		"node_modules",
		"electron",
		"dist",
		"Electron.app",
		"Contents",
		"Info.plist",
	)
	if (existsSync(directPath)) {
		plistPaths.add(directPath)
	}

	const pnpmDir = join(root, "node_modules", ".pnpm")
	if (existsSync(pnpmDir)) {
		try {
			const pnpmEntries = readdirSync(pnpmDir)
			for (const entry of pnpmEntries) {
				if (entry.startsWith("electron@")) {
					const pnpmPlist = join(
						pnpmDir,
						entry,
						"node_modules",
						"electron",
						"dist",
						"Electron.app",
						"Contents",
						"Info.plist",
					)
					if (existsSync(pnpmPlist)) {
						plistPaths.add(pnpmPlist)
					}
				}
			}
		} catch {}
	}

	for (const plistPath of plistPaths) {
		let content = readFileSync(plistPath, "utf-8")
		let changed = false

		if (
			content.includes("<key>CFBundleDisplayName</key>") &&
			!content.includes(`<string>${appName}</string>`)
		) {
			content = content.replace(
				/(<key>CFBundleDisplayName<\/key>\s*<string>)[^<]*(<\/string>)/,
				`$1${appName}$2`,
			)
			changed = true
		}

		if (
			content.includes("<key>CFBundleName</key>") &&
			!content.includes(`<string>${appName}</string>`)
		) {
			content = content.replace(
				/(<key>CFBundleName<\/key>\s*<string>)[^<]*(<\/string>)/,
				`$1${appName}$2`,
			)
			changed = true
		}

		// Note: Do NOT patch CFBundleIdentifier in development Electron.app.
		// Doing so breaks macOS MachPort rendezvous server check-in with:
		// "Check failed: kr == KERN_SUCCESS. bootstrap_check_in ... Permission denied"
		// Production packaging uses electron-builder to correctly set and sign the bundle id.

		if (changed) {
			writeFileSync(plistPath, content, "utf-8")
			const appBundle = dirname(dirname(plistPath))
			try {
				execSync(`touch "${appBundle}"`, { stdio: "ignore" })
				const lsregister =
					"/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
				if (existsSync(lsregister)) {
					execSync(`"${lsregister}" -f "${appBundle}"`, { stdio: "ignore" })
				}
			} catch {}
		}
	}
} catch (err) {
	// Best-effort script, do not fail install
	console.warn("[patch-electron-plist] Non-fatal error:", err)
}
