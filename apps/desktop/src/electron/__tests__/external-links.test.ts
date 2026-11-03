import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { parseExternalUrl } from "../external-links.js"

const here = dirname(fileURLToPath(import.meta.url))
const mainSource = readFileSync(resolve(here, "..", "main.ts"), "utf8")

describe("external links", () => {
	it("hands ordinary web links to the OS", () => {
		expect(parseExternalUrl("https://mcp.langsearch.com/mcp")).toBe(
			"https://mcp.langsearch.com/mcp",
		)
		expect(parseExternalUrl("https://langsearch.com/dashboard")).toContain(
			"langsearch.com/dashboard",
		)
		expect(parseExternalUrl("http://localhost:3000")).toBe(
			"http://localhost:3000/",
		)
		expect(parseExternalUrl("mailto:hi@example.com")).toBe(
			"mailto:hi@example.com",
		)
	})

	it("refuses anything that is not a web link", () => {
		expect(parseExternalUrl("javascript:alert(1)")).toBeNull()
		expect(parseExternalUrl("file:///etc/passwd")).toBeNull()
		expect(parseExternalUrl("about:blank")).toBeNull()
		expect(parseExternalUrl("not a url")).toBeNull()
		expect(parseExternalUrl("")).toBeNull()
	})

	it("main process opens links in the default browser, not in-app", () => {
		// Both entry points — a clicked link and a `target="_blank"` one — have to
		// go through the same helper.
		expect(mainSource).toContain("shell.openExternal(external)")
		expect(mainSource).toMatch(
			/on\("will-navigate"[\s\S]{0,160}openLink\(url\)/,
		)
		expect(mainSource).toMatch(
			/setWindowOpenHandler\(\(\{ url \}\) => \{\s*openLink\(url\)/,
		)
	})
})
