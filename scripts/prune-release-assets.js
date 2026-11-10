#!/usr/bin/env node

/**
 * scripts/prune-release-assets.js
 *
 * Keeps assets for the latest N releases (default: 5) and removes all downloadable
 * binary assets from earlier releases to conserve storage while keeping their release notes.
 *
 * Usage:
 *   node scripts/prune-release-assets.js [keepCount]
 */

import { execSync } from "node:child_process"

const GITHUB_REPO = "kidyfirst/my-agent"
const keepCount = parseInt(process.argv[2] || "5", 10)

function getGitHubToken() {
	if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN
	try {
		const out = execSync(
			"printf 'protocol=https\\nhost=github.com\\n' | git credential fill",
			{
				encoding: "utf8",
				stdio: ["pipe", "pipe", "ignore"],
			},
		)
		const match = out.match(/password=([^\r\n]+)/)
		if (match) return match[1].trim()
	} catch {
		// Ignore
	}
	return ""
}

const token = getGitHubToken()
if (!token) {
	console.error(
		"[prune-assets] Error: No GitHub token found in env (GITHUB_TOKEN) or git credentials.",
	)
	process.exit(1)
}

const headers = {
	Accept: "application/vnd.github.v3+json",
	Authorization: `token ${token}`,
	"User-Agent": "my-agent-prune-script",
}

async function fetchReleases() {
	const res = await fetch(
		`https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=100`,
		{ headers },
	)
	if (!res.ok) {
		throw new Error(`Failed to fetch releases: ${res.status} ${res.statusText}`)
	}
	return res.json()
}

async function deleteAsset(assetId, assetName, tagName) {
	const res = await fetch(
		`https://api.github.com/repos/${GITHUB_REPO}/releases/assets/${assetId}`,
		{
			method: "DELETE",
			headers,
		},
	)
	if (!res.ok && res.status !== 404) {
		console.warn(
			`[prune-assets] Failed to delete asset ${assetName} (${assetId}) from ${tagName}: ${res.status}`,
		)
		return false
	}
	console.log(
		`[prune-assets] Deleted asset: ${assetName} from release ${tagName}`,
	)
	return true
}

async function main() {
	console.log(`[prune-assets] Fetching releases for ${GITHUB_REPO}...`)
	const releases = await fetchReleases()

	// Sort releases by published_at or created_at descending
	releases.sort(
		(a, b) =>
			new Date(b.published_at || b.created_at) -
			new Date(a.published_at || a.created_at),
	)

	const kept = releases.slice(0, keepCount)
	const pruned = releases.slice(keepCount)

	console.log(
		`[prune-assets] Keeping assets for ${kept.length} latest releases:`,
	)
	for (const r of kept) {
		console.log(`  - ${r.tag_name} (${r.assets ? r.assets.length : 0} assets)`)
	}

	if (pruned.length === 0) {
		console.log("[prune-assets] No older releases to prune.")
		return
	}

	console.log(
		`[prune-assets] Pruning assets from ${pruned.length} older releases (keep <= ${keepCount}):`,
	)
	let totalDeleted = 0
	for (const r of pruned) {
		const assets = r.assets || []
		if (assets.length === 0) {
			console.log(`  - ${r.tag_name}: 0 assets (already clean)`)
			continue
		}
		console.log(`  - ${r.tag_name}: removing ${assets.length} assets...`)
		for (const asset of assets) {
			const ok = await deleteAsset(asset.id, asset.name, r.tag_name)
			if (ok) totalDeleted++
		}
	}

	console.log(
		`[prune-assets] Complete. Removed ${totalDeleted} assets from older releases.`,
	)
}

main().catch((err) => {
	console.error("[prune-assets] Failed:", err)
	process.exit(1)
})
