import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import {
	UserMessage,
	UserMessageSkillCard,
	parseSkillMessage,
} from "../components/UserMessage"
import type { Message } from "../types/ipc"

describe("UserMessage Skill Card and Question Layout", () => {
	const skillActivatedText = `# Activated Skill: Study-Mate (global skill)
Description: 你的AI学习搭档：定路线、讲知识、做项目，边学边做，学透一门科目

## Skill Instructions
You are Study-Mate. Help the student master the subject step by step.

## User Task
把这个项目整一个学校资料出来`

	it("parseSkillMessage extracts skill metadata and separates user question", () => {
		const parsed = parseSkillMessage(skillActivatedText)
		expect(parsed).not.toBeNull()
		expect(parsed?.skillName).toBe("Study-Mate")
		expect(parsed?.skillScope).toBe("global")
		expect(parsed?.skillDescription).toBe(
			"你的AI学习搭档：定路线、讲知识、做项目，边学边做，学透一门科目",
		)
		expect(parsed?.skillInstructions).toContain("You are Study-Mate")
		expect(parsed?.userQuestion).toBe("把这个项目整一个学校资料出来")
	})

	it("UserMessage renders user question prominently and hides raw # Activated Skill markdown", () => {
		const message: Message = {
			id: "msg-1",
			role: "user",
			content: [{ type: "text", text: skillActivatedText }],
			createdAt: new Date().toISOString(),
		}

		const html = renderToStaticMarkup(<UserMessage message={message} />)

		// User's question must be clearly present
		expect(html).toContain("把这个项目整一个学校资料出来")

		// Raw markdown header should NOT be rendered
		expect(html).not.toContain("# Activated Skill")
		expect(html).not.toContain("## Skill Instructions")
		expect(html).not.toContain("## User Task")

		// A dedicated skill badge with Study-Mate must be present with ellipsis and without global skill tag
		expect(html).toContain("Study-Mate")
		expect(html).toContain("text-overflow:ellipsis")
		expect(html).not.toContain("global skill")
		expect(html).not.toContain("project skill")
		expect(html).not.toContain("Instructions Preview")
	})

	it("UserMessage renders normal messages without skill card", () => {
		const normalMessage: Message = {
			id: "msg-2",
			role: "user",
			content: [{ type: "text", text: "Hello, can you help me?" }],
			createdAt: new Date().toISOString(),
		}

		const html = renderToStaticMarkup(<UserMessage message={normalMessage} />)

		expect(html).toContain("Hello, can you help me?")
		expect(html).not.toContain("global skill")
		expect(html).not.toContain("project skill")
	})

	it("UserMessageSkillCard popover uses max width, max height, overflow scroll, and word breaking", () => {
		const parsed = parseSkillMessage(skillActivatedText)
		expect(parsed).not.toBeNull()
		const html = renderToStaticMarkup(
			<UserMessageSkillCard parsedSkill={parsed!} />,
		)
		expect(html).toContain("Study-Mate")
		// The pill should not have native title to prevent overlapping native browser tooltip
		expect(html).not.toContain('title="Study-Mate"')
	})
})
