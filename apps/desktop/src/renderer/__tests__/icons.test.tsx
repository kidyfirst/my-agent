import { describe, it, expect } from "vitest"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { BotIcon, CloseIcon, LightbulbIcon, FolderOpenIcon, FolderIcon, MoreVerticalIcon } from "../components/icons"

describe("Extracted SVG Icon Components", () => {
	it("BotIcon renders as svg with default strokeWidth=1.5 and viewBox=0 0 24 24", () => {
		const html = renderToStaticMarkup(<BotIcon />)
		expect(html).toContain("<svg")
		expect(html).toContain('viewBox="0 0 24 24"')
		expect(html).toContain('stroke-width="1.5"')
		expect(html).toContain('width="16"')
		expect(html).toContain('height="16"')
		expect(html).toContain('fill="none"')
		expect(html).toContain('stroke="currentColor"')
		expect(html).toContain("<rect")
		expect(html).toContain('rx="2.5"')
	})

	it("BotIcon accepts custom size and strokeWidth overrides", () => {
		const html = renderToStaticMarkup(
			<BotIcon size={20} strokeWidth={2} className="custom-icon" />,
		)
		expect(html).toContain('width="20"')
		expect(html).toContain('height="20"')
		expect(html).toContain('stroke-width="2"')
		expect(html).toContain('class="custom-icon"')
	})

	it("CloseIcon and LightbulbIcon render standard svg elements with defaults", () => {
		const closeHtml = renderToStaticMarkup(<CloseIcon size={14} />)
		expect(closeHtml).toContain("<svg")
		expect(closeHtml).toContain('width="14"')
		expect(closeHtml).toContain('viewBox="0 0 24 24"')
		expect(closeHtml).toContain('stroke-width="1.5"')
		expect(closeHtml).toContain("<line")

		const lightbulbHtml = renderToStaticMarkup(
			<LightbulbIcon size={12} strokeWidth={2} />,
		)
		expect(lightbulbHtml).toContain("<svg")
		expect(lightbulbHtml).toContain('width="12"')
		expect(lightbulbHtml).toContain('stroke-width="2"')
		expect(lightbulbHtml).toContain("<path")
	})

	it("FolderOpenIcon renders complete closed path with front flap", () => {
		const html = renderToStaticMarkup(<FolderOpenIcon size={14} />)
		expect(html).toContain("<svg")
		expect(html).toContain('width="14"')
		expect(html).toContain('viewBox="0 0 24 24"')
		// Verify complete path ending with closed polygon instead of truncated h15
		expect(html).toContain("1-1.9 1.3H4a2 2 0 0 1-2-2z")
	})

	it("MoreVerticalIcon renders solid filled dots consistently", () => {
		const html = renderToStaticMarkup(<MoreVerticalIcon size={14} />)
		expect(html).toContain("<svg")
		expect(html).toContain('width="14"')
		expect(html).toContain('fill="currentColor"')
		expect(html).toContain('stroke="none"')
		expect(html).toContain("<circle")
	})
})
