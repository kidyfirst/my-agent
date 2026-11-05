#!/usr/bin/env node

/**
 * scripts/release-notes.js
 *
 * Extracts one version's section from CHANGELOG.md and writes it as the body of
 * the GitHub Release. Without this the release body comes from
 * `generate_release_notes`, which only ever emits a "Full Changelog" compare
 * link — and that same empty body is what docs/changelog.html renders for any
 * version the page does not have a hand-written card for.
 *
 * Usage: node scripts/release-notes.js [tag] [outfile]
 *   tag      e.g. v0.1.5 (defaults to the root package.json version)
 *   outfile  defaults to .release-notes.md
 *
 * Always writes the file, even when the version is missing from CHANGELOG.md —
 * a release without notes should still ship rather than fail the build.
 */

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, "..")

const pkg = JSON.parse(
	fs.readFileSync(path.join(rootDir, "package.json"), "utf8"),
)
const tag = (process.argv[2] || `v${pkg.version || "0.1.0"}`).trim()
const version = tag.replace(/^v/, "")
const outPath = path.resolve(rootDir, process.argv[3] || ".release-notes.md")

const changelogPath = path.join(rootDir, "CHANGELOG.md")
const changelog = fs.existsSync(changelogPath)
	? fs.readFileSync(changelogPath, "utf8")
	: ""

/**
 * A version block starts at "## [v1.2.3]" and runs to the next "## [" or the
 * trailing "---" separator. Headings inside the block are "###".
 */
function extractSection(markdown, wanted) {
	const lines = markdown.split("\n")
	const heading = new RegExp(`^##\\s*\\[?v?${wanted.replace(/\./g, "\\.")}\\]?`)
	const start = lines.findIndex((line) => heading.test(line.trim()))
	if (start === -1) return ""

	const body = []
	for (let i = start + 1; i < lines.length; i++) {
		const line = lines[i]
		if (/^##\s/.test(line)) break
		body.push(line)
	}

	return body
		.join("\n")
		.replace(/\n-{3,}\s*$/, "")
		.trim()
}

const notes = extractSection(changelog, version)
const footer = `**Full Changelog**: https://github.com/kidyfirst/my-agent/commits/${tag}`

const body = notes
	? `${notes}\n\n---\n${footer}\n`
	: `见 [CHANGELOG.md](https://github.com/kidyfirst/my-agent/blob/main/CHANGELOG.md)。\n\n---\n${footer}\n`

fs.writeFileSync(outPath, body)
console.log(
	`[release-notes] ${tag}: ${notes ? `${notes.split("\n").length} lines from CHANGELOG.md` : "no CHANGELOG section, wrote fallback"} -> ${path.relative(rootDir, outPath)}`,
)
