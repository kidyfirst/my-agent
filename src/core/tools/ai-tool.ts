import { jsonSchema } from "ai"

/**
 * AI SDK v6 dropped the legacy `parameters` field: tool definitions must declare
 * `inputSchema` instead. Anything passed as `parameters` is silently discarded and
 * replaced with an empty object schema that has no `type`, which strict providers
 * (OpenAI, DeepSeek, ...) reject with:
 *
 *   Invalid schema for function 'x': schema must be a JSON Schema of
 *   'type: "object"', got 'type: null'.
 *
 * These helpers normalise our internal tool objects into v6 tool definitions.
 */

const EMPTY_PARAMETERS = {
	type: "object",
	properties: {},
	additionalProperties: false,
} as const

function isZodLike(value: any): boolean {
	if (value == null || typeof value !== "object") return false
	return (
		typeof value.parse === "function" ||
		typeof value.safeParse === "function" ||
		"~standard" in value
	)
}

function isJsonSchemaWrapper(value: any): boolean {
	return value != null && typeof value === "object" && "jsonSchema" in value
}

function looksLikeJsonSchemaObject(value: any): boolean {
	if (value == null || typeof value !== "object") return false
	if (isZodLike(value) || isJsonSchemaWrapper(value)) return false
	return (
		"type" in value ||
		"properties" in value ||
		"anyOf" in value ||
		"oneOf" in value ||
		"allOf" in value ||
		"$ref" in value
	)
}

/**
 * Turns whatever a tool carries (`inputSchema` / legacy `parameters`) into
 * something the AI SDK accepts as a tool input schema. Guarantees an object
 * schema so providers never see `type: null`.
 */
export function toFlexibleSchema(schema: any): any {
	if (!schema) return jsonSchema(EMPTY_PARAMETERS)
	if (isJsonSchemaWrapper(schema) || isZodLike(schema)) return schema
	if (looksLikeJsonSchemaObject(schema)) {
		const normalized = "type" in schema ? schema : { type: "object", ...schema }
		return jsonSchema(normalized)
	}
	return schema
}

/**
 * Builds an AI SDK v6 tool definition from one of our internal Tool instances
 * (or any tool-like object), keeping the provided execute implementation.
 *
 * Tools that are already valid v6 definitions (provider-defined tools from
 * `@ai-sdk/anthropic` / `@ai-sdk/openai`, or hand-written v6 tools) are returned
 * untouched.
 */
export function toModelTool(tool: any, execute: (...args: any[]) => any): any {
	if (isNativeModelTool(tool)) return tool
	const schema = toFlexibleSchema(tool?.inputSchema ?? tool?.parameters)
	return {
		description: tool?.description ?? "",
		inputSchema: schema,
		execute,
	}
}

function isNativeModelTool(tool: any): boolean {
	if (tool == null || typeof tool !== "object") return false
	// Provider-defined tools (e.g. anthropic.tools.webSearch_20250305()).
	if (tool.type === "provider-defined") return true
	// Our own Tool class also exposes `inputSchema` + `execute`, but keeps the
	// real implementation on `_execute`.
	if (typeof tool._execute === "function") return false
	// Anything without the legacy `parameters` field that already declares an
	// input schema and an execute function is a valid v6 definition.
	return "parameters" in tool
		? false
		: Boolean(tool.inputSchema && tool.execute)
}
