import type { MyAgentDBMessage } from "../agent/types.js"

function isSystemReminder(m: MyAgentDBMessage): boolean {
	if (m.role === "system") {
		const content =
			typeof m.content === "string" ? m.content : m.content?.content || ""
		if (
			content.includes("System Reminder") ||
			content.includes("[Reminder]") ||
			content.includes("<system-reminder")
		) {
			return true
		}
	}
	const raw = m.content as any
	if (typeof raw === "string" && raw.includes("<system-reminder")) {
		return true
	}
	if (
		typeof raw?.content === "string" &&
		raw.content.includes("<system-reminder")
	) {
		return true
	}
	if (Array.isArray(raw?.parts)) {
		return raw.parts.some(
			(p: any) =>
				typeof p?.text === "string" && p.text.includes("<system-reminder"),
		)
	}
	return false
}

export function filterSystemReminderMessages(
	messages: MyAgentDBMessage[],
	includeSystemReminders?: boolean,
	hideSignals?: boolean | any[],
): MyAgentDBMessage[] {
	if (hideSignals === false) return messages

	let filtered = messages

	if (hideSignals === true) {
		filtered = filtered.filter((m) => m.role !== "signal")
	} else if (Array.isArray(hideSignals)) {
		filtered = filtered.filter(
			(m) => m.role !== "signal" || (m.type && !hideSignals.includes(m.type)),
		)
	}

	if (includeSystemReminders) {
		return filtered
	}

	return filtered.filter((m) => !isSystemReminder(m))
}
