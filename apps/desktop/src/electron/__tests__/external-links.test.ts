import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import {
	parseExternalUrl,
	extractLibraryItemIdFromUrl,
} from "../external-links.js"

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

	it("extracts library item ID from various URL schemes and relative links", () => {
		expect(
			extractLibraryItemIdFromUrl(
				"library://1-2.习近平总书记重要讲话精神.docx",
			),
		).toBe("1-2.习近平总书记重要讲话精神.docx")
		expect(
			extractLibraryItemIdFromUrl(
				"http://localhost:5173/1-2.%E4%B9%A0%E8%BF%91%E5%B9%B3%E6%80%BB%E4%B9%A6%E8%AE%B0%E9%87%8D%E8%A6%81%E8%AE%B2%E8%AF%9D%E7%B2%BE%E7%A5%9E.docx",
			),
		).toBe("1-2.习近平总书记重要讲话精神.docx")
		expect(
			extractLibraryItemIdFromUrl("/my-library/reports/quarterly.xlsx"),
		).toBe("reports/quarterly.xlsx")
		expect(extractLibraryItemIdFromUrl("presentation.pptx")).toBe(
			"presentation.pptx",
		)
		expect(
			extractLibraryItemIdFromUrl("https://www.gov.cn/index.html"),
		).toBeNull()
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
