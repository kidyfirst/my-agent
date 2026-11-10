/**
 * My Agent - Changelog Dynamic Enhancer
 *
 * The timeline is pre-rendered in changelog.html with hand-written notes. This
 * script only fills the gaps: it fetches GitHub Releases so a version published
 * after the page was last edited still shows up. For tags that already have a
 * pre-rendered card the static one wins — release bodies come from
 * generate_release_notes and degrade to a bare "Full Changelog" link, while the
 * hand-written copy in git never does.
 */

;(function () {
	"use strict"

	const GITHUB_REPO = "kidyfirst/my-agent"

	function escapeHtml(str) {
		if (!str) return ""
		return str
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&#039;")
	}

	/** Escape first, then re-introduce the few inline constructs we support. */
	function inline(text) {
		return escapeHtml(text)
			.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
			.replace(/`([^`]+)`/g, "<code>$1</code>")
			.replace(
				/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
				'<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
			)
	}

	function markdownToHtml(md) {
		if (!md) return ""
		const lines = md.split("\n")
		let html = ""
		let inList = false

		for (let line of lines) {
			line = line.trim()
			if (!line) {
				if (inList) {
					html += "</ul>"
					inList = false
				}
				continue
			}

			if (line === "---" || line === "***") {
				// Horizontal rule used to separate the notes from the compare link.
				// The card already has its own spacing, a literal <hr> adds noise.
				if (inList) {
					html += "</ul>"
					inList = false
				}
				continue
			}

			if (line.startsWith("### ")) {
				if (inList) {
					html += "</ul>"
					inList = false
				}
				html += `<h4 class="release-category-title">${escapeHtml(line.slice(4))}</h4>`
			} else if (line.startsWith("## ")) {
				if (inList) {
					html += "</ul>"
					inList = false
				}
				html += `<h3 class="release-category-title" style="font-size:1.15rem;">${escapeHtml(line.slice(3))}</h3>`
			} else if (line.startsWith("- ") || line.startsWith("* ")) {
				if (!inList) {
					html += '<ul class="release-list">'
					inList = true
				}
				let text = inline(line.slice(2))
				html += `<li>${text}</li>`
			} else {
				if (inList) {
					html += "</ul>"
					inList = false
				}
				const text = inline(line)
				html += `<p style="color:var(--text-secondary);margin-bottom:8px;">${text}</p>`
			}
		}

		if (inList) {
			html += "</ul>"
		}

		return html
	}

	async function fetchReleases() {
		try {
			const response = await fetch(
				`https://api.github.com/repos/${GITHUB_REPO}/releases`,
				{
					headers: { Accept: "application/vnd.github.v3+json" },
				},
			)

			if (!response.ok) {
				throw new Error(`Status ${response.status}`)
			}

			const releases = await response.json()
			return Array.isArray(releases) && releases.length > 0 ? releases : null
		} catch (e) {
			console.warn(
				"Could not fetch releases from GitHub, using pre-rendered changelog:",
				e.message,
			)
			return null
		}
	}

	function renderReleaseItem(release, isLatest, index = 0) {
		const tagName = release.tag_name || "v0.1.0"
		const date = release.published_at
			? release.published_at.split("T")[0]
			: "2026-10-26"
		const bodyHtml = markdownToHtml(release.body)

		let assetsHtml = ""
		if (
			index < 5 &&
			Array.isArray(release.assets) &&
			release.assets.length > 0
		) {
			const nonMetaAssets = release.assets.filter(
				(a) => !a.name.endsWith(".yml") && !a.name.endsWith(".txt"),
			)
			assetsHtml = `
        <div class="release-assets-box">
          <div class="assets-title">📦 下载安装包 (Release Assets)</div>
          <div class="assets-chips">
            ${nonMetaAssets
							.map((asset) => {
								const sizeMb = (asset.size / (1024 * 1024)).toFixed(1)
								return `
                  <a href="${asset.browser_download_url}" class="asset-chip" download>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    <span>${asset.name}</span>
                    <span style="color:var(--text-muted);font-size:0.75rem;">(${sizeMb} MB)</span>
                  </a>
                `
							})
							.join("")}
          </div>
        </div>
      `
		}

		return `
      <div class="timeline-item">
        <div class="timeline-dot"></div>
        <div class="release-card">
          <div class="release-header">
            <span class="release-tag">${escapeHtml(tagName)}</span>
            <span class="release-date">${date}</span>
            ${isLatest ? '<span class="badge-latest">Latest</span>' : ""}
          </div>
          <div class="release-content">
            ${bodyHtml}
          </div>
          ${assetsHtml}
        </div>
      </div>
    `
	}

	/**
	 * Index the pre-rendered cards by tag, in document order, so the newest
	 * version can be recognised without a second source of truth.
	 */
	function readStaticCards(container) {
		const cards = new Map()
		container.querySelectorAll(".timeline-item").forEach((item) => {
			const tag = item.querySelector(".release-tag")
			if (!tag) return
			const key = tag.textContent.trim()
			if (key) cards.set(key, item)
		})
		return cards
	}

	/** Move the Latest badge to whichever card is actually newest. */
	function markLatest(card) {
		card.querySelectorAll(".badge-latest").forEach((badge) => badge.remove())
		const header = card.querySelector(".release-header")
		if (!header) return
		const badge = document.createElement("span")
		badge.className = "badge-latest"
		badge.textContent = "Latest"
		header.appendChild(badge)
	}

	async function init() {
		const container = document.getElementById("dynamic-timeline")
		if (!container) return

		const staticCards = readStaticCards(container)
		const releases = await fetchReleases()
		if (!releases || releases.length === 0) return

		const fragment = document.createDocumentFragment()
		releases.forEach((release, index) => {
			const existing = staticCards.get(release.tag_name)
			if (existing) {
				if (index === 0) markLatest(existing)
				else {
					const badge = existing.querySelector(".badge-latest")
					if (badge) badge.remove()
				}
				// Keep only the latest 5 releases with downloadable assets
				if (index >= 5) {
					const box = existing.querySelector(".release-assets-box")
					if (box) box.remove()
				}
				// Keep the hand-written notes and their measured asset sizes.
				fragment.appendChild(existing)
				return
			}
			const host = document.createElement("div")
			host.innerHTML = renderReleaseItem(release, index === 0, index)
			if (host.firstElementChild) fragment.appendChild(host.firstElementChild)
		})

		// A rate-limited response can be shorter than the page, or a version may
		// predate the first release in the window — never drop those cards.
		staticCards.forEach((item) => {
			if (!item.isConnected) fragment.appendChild(item)
		})

		container.replaceChildren(fragment)
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", init)
	} else {
		init()
	}
})()
