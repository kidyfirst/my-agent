import { describe, it, expect, beforeEach, afterEach } from "vitest"
import {
	getDatabasePath,
	getStorageConfig,
	getOmScope,
	getResourceIdOverride,
} from "../utils/project.js"

describe("Environment Variables (MYAGENT_)", () => {
	const originalEnv = { ...process.env }

	beforeEach(() => {
		// Clean up relevant env vars before each test
		delete process.env.MYAGENT_DB_PATH
		delete process.env.MYAGENT_DB_URL
		delete process.env.MYAGENT_DB_AUTH_TOKEN
		delete process.env.MYAGENT_USER_ID
		delete process.env.MYAGENT_OM_SCOPE
		delete process.env.MYAGENT_RESOURCE_ID
	})

	afterEach(() => {
		process.env = { ...originalEnv }
	})

	it("getDatabasePath respects MYAGENT_DB_PATH", () => {
		process.env.MYAGENT_DB_PATH = "/tmp/custom-myagent.db"
		expect(getDatabasePath()).toBe("/tmp/custom-myagent.db")
	})

	it("getStorageConfig respects MYAGENT_DB_URL / AUTH_TOKEN", () => {
		process.env.MYAGENT_DB_URL = "libsql://new.turso.io"
		process.env.MYAGENT_DB_AUTH_TOKEN = "new-token"
		const cfg = getStorageConfig()
		expect(cfg.url).toBe("libsql://new.turso.io")
		expect(cfg.authToken).toBe("new-token")
	})

	it("getOmScope respects MYAGENT_OM_SCOPE", () => {
		process.env.MYAGENT_OM_SCOPE = "resource"
		expect(getOmScope()).toBe("resource")

		process.env.MYAGENT_OM_SCOPE = "thread"
		expect(getOmScope()).toBe("thread")
	})

	it("getResourceIdOverride respects MYAGENT_RESOURCE_ID", () => {
		process.env.MYAGENT_RESOURCE_ID = "new-res-id"
		expect(getResourceIdOverride()).toBe("new-res-id")
	})
})
