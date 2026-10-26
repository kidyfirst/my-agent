/**
 * MyAgent - Changelog Dynamic Enhancer
 * Fetches GitHub Releases history and augments the changelog timeline.
 * Gracefully falls back to pre-rendered HTML if offline or rate limited.
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
				let text = escapeHtml(line.slice(2))
				// Parse **bold**
				text = text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
				// Parse `code`
				text = text.replace(/`([^`]+)`/g, "<code>$1</code>")
				html += `<li>${text}</li>`
			} else {
				if (inList) {
					html += "</ul>"
					inList = false
				}
				let text = escapeHtml(line)
				text = text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
				text = text.replace(/`([^`]+)`/g, "<code>$1</code>")
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

	function renderReleaseItem(release, isLatest) {
		const tagName = release.tag_name || "v1.0.0"
		const date = release.published_at ? release.published_at.split("T")[0] : ""
		const bodyHtml = markdownToHtml(release.body)

		let assetsHtml = ""
		if (Array.isArray(release.assets) && release.assets.length > 0) {
			assetsHtml = `
        <div class="release-assets-box">
          <div class="assets-title">📦 下载安装包 (Release Assets)</div>
          <div class="assets-chips">
            ${release.assets
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

	async function init() {
		const container = document.getElementById("dynamic-timeline")
		if (!container) return

		const releases = await fetchReleases()
		if (releases && releases.length > 0) {
			// If we have live GitHub releases, render them smoothly
			let html = ""
			releases.forEach((rel, index) => {
				html += renderReleaseItem(rel, index === 0)
			})
			container.innerHTML = html
		}
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", init)
	} else {
		init()
	}
})()
