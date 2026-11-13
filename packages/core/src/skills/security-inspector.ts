import type {
	SecurityAuditReport,
	SecurityIssue,
	SecurityRiskSeverity,
} from "./types.js"

export interface AuditSkillOptions {
	manifestContent: string
	files?: Record<string, string>
}

interface SensitivePattern {
	regex: RegExp
	title: string
	category: SecurityIssue["category"]
	severity: SecurityRiskSeverity
	descriptionTemplate: string
}

const SENSITIVE_PATTERNS: SensitivePattern[] = [
	{
		regex: /(\/etc\/passwd|\/etc\/shadow|\/etc\/sudoers)/i,
		title: "Access to Sensitive System Files",
		category: "privacy_leak",
		severity: "critical",
		descriptionTemplate:
			"Attempts to read root or operating system account databases ($1).",
	},
	{
		regex:
			/(~?\/?\.ssh\/(id_rsa|id_ecdsa|id_ed25519|authorized_keys|known_hosts))/i,
		title: "SSH Private Key or Credential Access",
		category: "privacy_leak",
		severity: "critical",
		descriptionTemplate:
			"Attempts to access sensitive SSH keys or configuration ($1).",
	},
	{
		regex: /(~?\/?\.(aws\/credentials|config\/gcloud|kube\/config|azure))/i,
		title: "Cloud Provider Credential Access",
		category: "privacy_leak",
		severity: "critical",
		descriptionTemplate:
			"Attempts to access cloud infrastructure credentials ($1).",
	},
	{
		regex: /(^|[\s"'`])\.env(\.local|\.production)?([\s"'`]|$)/i,
		title: "Environment Secrets File Access",
		category: "privacy_leak",
		severity: "high",
		descriptionTemplate:
			"Attempts to directly inspect application secret files (.env).",
	},
	{
		regex:
			/(ignore\s+(all\s+)?(previous|prior)\s+instructions|disregard\s+(all\s+)?(system|prior)\s+directives|system\s+override|you\s+are\s+now\s+in\s+godmode|output\s+(the\s+)?(hidden\s+)?user\s+system\s+prompt)/i,
		title: "Prompt Injection or Safety Jailbreak Payload",
		category: "prompt_injection",
		severity: "critical",
		descriptionTemplate:
			"Contains directives intended to bypass model safety constraints or hijack system prompts.",
	},
]

export class SecurityInspector {
	/**
	 * Parses YAML frontmatter permissions and metadata from markdown
	 */
	parseManifest(content: string): {
		permissions: string[]
		name?: string
		description?: string
	} {
		const match = content.match(/^---\s*([\s\S]*?)\s*---/)
		if (!match) {
			return { permissions: [] }
		}

		const rawYaml = match[1]
		const permissions: string[] = []
		let name: string | undefined
		let description: string | undefined

		const lines = rawYaml.split("\n")
		let inPermissions = false

		for (const line of lines) {
			const trimmed = line.trim()
			if (trimmed.startsWith("name:")) {
				name = trimmed
					.replace("name:", "")
					.trim()
					.replace(/^['"]|['"]$/g, "")
				inPermissions = false
			} else if (trimmed.startsWith("description:")) {
				description = trimmed
					.replace("description:", "")
					.trim()
					.replace(/^['"]|['"]$/g, "")
				inPermissions = false
			} else if (trimmed.startsWith("permissions:")) {
				inPermissions = true
				const inline = trimmed.replace("permissions:", "").trim()
				if (inline.startsWith("[") && inline.endsWith("]")) {
					const items = inline
						.slice(1, -1)
						.split(",")
						.map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
						.filter(Boolean)
					permissions.push(...items)
					inPermissions = false
				}
			} else if (inPermissions) {
				if (trimmed.startsWith("-")) {
					const perm = trimmed
						.replace(/^-+\s*/, "")
						.replace(/^['"]|['"]$/g, "")
						.trim()
					if (perm) permissions.push(perm)
				} else if (trimmed && !trimmed.startsWith("#")) {
					inPermissions = false
				}
			}
		}

		return { permissions, name, description }
	}

	async auditSkill(options: AuditSkillOptions): Promise<SecurityAuditReport> {
		const { manifestContent, files = {} } = options
		const issues: SecurityIssue[] = []
		const detectedPermissions = new Set<string>()

		const parsed = this.parseManifest(manifestContent)
		const declaredPermissions = parsed.permissions || []

		const allFiles: Record<string, string> = {
			"SKILL.md": manifestContent,
			...files,
		}

		// Inspect all file contents
		for (const [filename, fileContent] of Object.entries(allFiles)) {
			// Check sensitive patterns
			for (const pattern of SENSITIVE_PATTERNS) {
				const match = fileContent.match(pattern.regex)
				if (match) {
					issues.push({
						severity: pattern.severity,
						category: pattern.category,
						title: pattern.title,
						description: pattern.descriptionTemplate.replace(
							"$1",
							match[1] || match[0],
						),
						file: filename,
						codeSnippet: match[0],
					})
				}
			}

			// Detect actual capabilities used
			if (
				/child_process|exec\(|spawn\(|execSync|\/bin\/sh|\/bin\/bash|powershell/i.test(
					fileContent,
				)
			) {
				detectedPermissions.add("shell")
			}
			if (
				/fetch\(|http\.request|https\.request|axios|curl\s+|wget\s+/i.test(
					fileContent,
				)
			) {
				detectedPermissions.add("network")
			}
			if (/fs\.writeFile|fs\.rmSync|fs\.unlink|rm\s+-rf/i.test(fileContent)) {
				detectedPermissions.add("filesystem")
			}
		}

		// Check permission consistency
		const declaredLower = declaredPermissions.map((p) => p.toLowerCase())
		for (const detected of detectedPermissions) {
			const isDeclared =
				(detected === "shell" &&
					(declaredLower.includes("shell") ||
						declaredLower.includes("command") ||
						declaredLower.includes("exec"))) ||
				(detected === "network" &&
					(declaredLower.includes("network") ||
						declaredLower.includes("net") ||
						declaredLower.includes("http") ||
						declaredLower.includes("web"))) ||
				(detected === "filesystem" &&
					(declaredLower.includes("filesystem") ||
						declaredLower.includes("fs") ||
						declaredLower.includes("file")))

			if (!isDeclared) {
				issues.push({
					severity: detected === "shell" ? "high" : "medium",
					category: "permission_mismatch",
					title: `Undeclared ${detected.toUpperCase()} Capability`,
					description: `The skill executes ${detected} actions without declaring '${detected}' in its manifest permissions.`,
				})
			}
		}

		// Calculate security score
		let score = 100
		for (const issue of issues) {
			switch (issue.severity) {
				case "critical":
					score -= 40
					break
				case "high":
					score -= 25
					break
				case "medium":
					score -= 15
					break
				case "low":
					score -= 5
					break
			}
		}
		score = Math.max(0, Math.min(100, score))

		const hasCritical = issues.some((i) => i.severity === "critical")
		const safe = score >= 70 && !hasCritical

		const summary = safe
			? "No critical security risks detected. Safe to install."
			: `Security risks detected (Score: ${score}/100). Review flagged issues before proceeding.`

		return {
			safe,
			score,
			scannedFilesCount: Object.keys(allFiles).length,
			detectedPermissions: Array.from(detectedPermissions),
			declaredPermissions,
			issues,
			summary,
		}
	}
}
