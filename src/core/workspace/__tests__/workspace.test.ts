import { describe, it, expect, beforeEach, afterEach } from "vitest"
import path from "node:path"
import fs from "node:fs/promises"
import os from "node:os"
import {
	Workspace,
	LocalFilesystem,
	LocalSandbox,
	WORKSPACE_TOOLS,
} from "../index.js"

describe("Workspace Module", () => {
	let tmpDir: string

	beforeEach(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "workspace-test-"))
	})

	afterEach(async () => {
		try {
			await fs.rm(tmpDir, { recursive: true, force: true })
		} catch {}
	})

	it("defines correct WORKSPACE_TOOLS constants", () => {
		expect(WORKSPACE_TOOLS.FILESYSTEM.READ_FILE).toBe(
			"myagent_workspace_read_file",
		)
		expect(WORKSPACE_TOOLS.FILESYSTEM.WRITE_FILE).toBe(
			"myagent_workspace_write_file",
		)
		expect(WORKSPACE_TOOLS.FILESYSTEM.EDIT_FILE).toBe(
			"myagent_workspace_edit_file",
		)
		expect(WORKSPACE_TOOLS.FILESYSTEM.LIST_FILES).toBe(
			"myagent_workspace_list_files",
		)
		expect(WORKSPACE_TOOLS.FILESYSTEM.DELETE).toBe("myagent_workspace_delete")
		expect(WORKSPACE_TOOLS.FILESYSTEM.FILE_STAT).toBe(
			"myagent_workspace_file_stat",
		)
		expect(WORKSPACE_TOOLS.FILESYSTEM.MKDIR).toBe("myagent_workspace_mkdir")
		expect(WORKSPACE_TOOLS.FILESYSTEM.GREP).toBe("myagent_workspace_grep")
		expect(WORKSPACE_TOOLS.FILESYSTEM.AST_EDIT).toBe(
			"myagent_workspace_ast_edit",
		)

		expect(WORKSPACE_TOOLS.SANDBOX.EXECUTE_COMMAND).toBe(
			"myagent_workspace_execute_command",
		)
		expect(WORKSPACE_TOOLS.SANDBOX.GET_PROCESS_OUTPUT).toBe(
			"myagent_workspace_get_process_output",
		)
		expect(WORKSPACE_TOOLS.SANDBOX.KILL_PROCESS).toBe(
			"myagent_workspace_kill_process",
		)
	})

	it("LocalFilesystem manages paths and file operations", async () => {
		const lfs = new LocalFilesystem({
			basePath: tmpDir,
			allowedPaths: [tmpDir],
		})

		expect(lfs.basePath).toBe(tmpDir)
		expect(lfs.allowedPaths).toContain(tmpDir)

		lfs.setAllowedPaths([tmpDir, "/extra/path"])
		expect(lfs.allowedPaths).toEqual([tmpDir, "/extra/path"])

		const testFile = "hello.txt"
		await lfs.writeFile(testFile, "Hello World")
		expect(await lfs.exists(testFile)).toBe(true)
		const content = await lfs.readFile(testFile)
		expect(content).toBe("Hello World")

		const stat = await lfs.stat(testFile)
		expect(stat.isFile()).toBe(true)

		await lfs.deleteFile(testFile)
		expect(await lfs.exists(testFile)).toBe(false)
	})

	it("LocalSandbox configures environment and working directory", () => {
		const sandbox = new LocalSandbox({
			workingDirectory: tmpDir,
			env: { TEST_ENV: "1" },
		})

		expect(sandbox.workingDirectory).toBe(tmpDir)
		expect(sandbox.env.TEST_ENV).toBe("1")
	})

	it("Workspace instantiates and manages tools configuration", () => {
		const lfs = new LocalFilesystem({ basePath: tmpDir })
		const sandbox = new LocalSandbox({ workingDirectory: tmpDir })

		const ws = new Workspace({
			id: "ws-1",
			name: "Test Workspace",
			filesystem: lfs,
			sandbox,
			tools: {
				[WORKSPACE_TOOLS.FILESYSTEM.READ_FILE]: { name: "view" },
			},
		})

		expect(ws.id).toBe("ws-1")
		expect(ws.name).toBe("Test Workspace")
		expect(ws.filesystem).toBe(lfs)
		expect(ws.sandbox).toBe(sandbox)
		expect(ws.getToolsConfig()).toEqual({
			[WORKSPACE_TOOLS.FILESYSTEM.READ_FILE]: { name: "view" },
		})

		ws.setToolsConfig({
			[WORKSPACE_TOOLS.FILESYSTEM.WRITE_FILE]: { name: "write_file" },
		})
		expect(ws.getToolsConfig()).toEqual({
			[WORKSPACE_TOOLS.FILESYSTEM.WRITE_FILE]: { name: "write_file" },
		})
	})
})
