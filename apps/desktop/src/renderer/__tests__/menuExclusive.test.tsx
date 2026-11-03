import { describe, expect, it, vi, beforeEach } from "vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { claimMenu, openMenuIds, releaseMenu } from "../utils/menuRegistry"
import { renderToStaticMarkup } from "react-dom/server"
import { ContextMenu } from "../components/ContextMenu"

const here = dirname(fileURLToPath(import.meta.url))
const read = (rel: string) => readFileSync(resolve(here, "..", rel), "utf8")

describe("menuRegistry", () => {
	beforeEach(() => {
		for (const id of openMenuIds()) releaseMenu(id)
	})

	it("closes the previously open menu when another claims the slot", () => {
		const closeA = vi.fn()
		const closeB = vi.fn()
		claimMenu("row-a", closeA)
		expect(openMenuIds()).toEqual(["row-a"])

		claimMenu("row-b", closeB)
		expect(closeA).toHaveBeenCalledTimes(1)
		expect(closeB).not.toHaveBeenCalled()
		expect(openMenuIds()).toEqual(["row-b"])
	})

	it("keeps the newest menu when its close handler unmounts an older one", () => {
		// The real close handler is a setState that unmounts the menu, whose
		// cleanup releases its own id — this must not disturb the new menu.
		const closed: string[] = []
		claimMenu("row-a", () => {
			closed.push("row-a")
			releaseMenu("row-a")
		})
		claimMenu("row-b", () => closed.push("row-b"))

		expect(closed).toEqual(["row-a"])
		expect(openMenuIds()).toEqual(["row-b"])
	})

	it("re-claiming the same id does not close itself", () => {
		const closeA = vi.fn()
		claimMenu("row-a", closeA)
		claimMenu("row-a", closeA)
		expect(closeA).not.toHaveBeenCalled()
	})

	it("releases on unmount", () => {
		claimMenu("row-a", vi.fn())
		releaseMenu("row-a")
		expect(openMenuIds()).toEqual([])
	})
})

describe("menus join the single-menu registry", () => {
	it("ContextMenu claims on mount and releases on unmount", () => {
		const source = read("components/ContextMenu.tsx")
		expect(source).toContain("claimMenu(menuId")
		expect(source).toContain("releaseMenu(menuId)")
	})

	it("ContextMenu listens for outside clicks in the capture phase", () => {
		// Sidebar triggers stop mousedown from bubbling, so a bubbling listener
		// never fires — which is exactly how two menus stayed open at once.
		const source = read("components/ContextMenu.tsx")
		expect(source).toMatch(
			/window\.addEventListener\(\s*"mousedown",\s*handleClickOutside,\s*true,?\s*\)/,
		)
		expect(source).toMatch(
			/window\.removeEventListener\(\s*"mousedown",\s*handleClickOutside,\s*true,?\s*\)/,
		)
	})

	it("the hand-rolled popovers use the registry too", () => {
		const projects = read("components/ProjectList.tsx")
		expect(projects).toContain('claimMenu("project-header-menu"')
		expect(projects).toContain('claimMenu("project-add-menu"')

		const tree = read("components/FileTree.tsx")
		expect(tree).toContain("claimMenu(menuId")

		const openIn = read("components/OpenInDropdown.tsx")
		expect(openIn).toContain("claimMenu(menuId")
		expect(openIn).toMatch(
			/addEventListener\(\s*"mousedown",\s*handler,\s*true/,
		)
	})

	it("the sidebar action menu stays out of the stack", () => {
		// The row's ⋯ trigger is the classic case: it stops mousedown so the row
		// click survives, which is why the second menu used to stack.
		const row = read("components/RowActions.tsx")
		expect(row).toContain("e.stopPropagation()")
		const menu = read("components/ContextMenu.tsx")
		expect(menu).toContain("claimMenu")
	})

	it("ContextMenu still renders its items", () => {
		// The menu clamps itself to the viewport, so it needs a window even when
		// rendering to a string.
		vi.stubGlobal("window", { innerWidth: 1200, innerHeight: 800 })
		const html = renderToStaticMarkup(
			<ContextMenu
				x={10}
				y={10}
				onClose={() => {}}
				items={[
					{ label: "Rename", onClick: () => {} },
					{ label: "Delete", danger: true, onClick: () => {} },
				]}
			/>,
		)
		expect(html).toContain("Rename")
		expect(html).toContain("Delete")
	})
})
