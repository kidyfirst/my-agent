import { describe, it, expect, beforeEach, afterEach } from "vitest"
import * as fs from "node:fs"
import * as path from "node:path"
import * as os from "node:os"
import * as zlib from "node:zlib"
import { LibraryService } from "../library-service.js"

function createMockZip(files: Record<string, string>): Buffer {
	const localEntries: Buffer[] = []
	const cdEntries: Buffer[] = []
	let offset = 0

	for (const [fileName, content] of Object.entries(files)) {
		const contentBuf = Buffer.from(content, "utf8")
		const compressed = zlib.deflateRawSync(contentBuf)
		const fnBuf = Buffer.from(fileName, "utf8")

		const localHeader = Buffer.alloc(30)
		localHeader.writeUInt32LE(0x04034b50, 0)
		localHeader.writeUInt16LE(20, 4)
		localHeader.writeUInt16LE(0, 6)
		localHeader.writeUInt16LE(8, 8)
		localHeader.writeUInt32LE(compressed.length, 18)
		localHeader.writeUInt32LE(contentBuf.length, 22)
		localHeader.writeUInt16LE(fnBuf.length, 26)
		localHeader.writeUInt16LE(0, 28)

		const localFile = Buffer.concat([localHeader, fnBuf, compressed])
		localEntries.push(localFile)

		const cdHeader = Buffer.alloc(46)
		cdHeader.writeUInt32LE(0x02014b50, 0)
		cdHeader.writeUInt16LE(20, 4)
		cdHeader.writeUInt16LE(20, 6)
		cdHeader.writeUInt16LE(8, 10)
		cdHeader.writeUInt32LE(compressed.length, 20)
		cdHeader.writeUInt32LE(contentBuf.length, 24)
		cdHeader.writeUInt16LE(fnBuf.length, 28)
		cdHeader.writeUInt16LE(0, 30)
		cdHeader.writeUInt16LE(0, 32)
		cdHeader.writeUInt32LE(offset, 42)

		cdEntries.push(Buffer.concat([cdHeader, fnBuf]))
		offset += localFile.length
	}

	const allLocal = Buffer.concat(localEntries)
	const allCd = Buffer.concat(cdEntries)

	const eocd = Buffer.alloc(22)
	eocd.writeUInt32LE(0x06054b50, 0)
	eocd.writeUInt16LE(cdEntries.length, 8)
	eocd.writeUInt16LE(cdEntries.length, 10)
	eocd.writeUInt32LE(allCd.length, 12)
	eocd.writeUInt32LE(allLocal.length, 16)

	return Buffer.concat([allLocal, allCd, eocd])
}

function createMockDocx(text: string): Buffer {
	return createMockZip({
		"word/document.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`,
	})
}

function createMockPptx(slideTexts: string[]): Buffer {
	const files: Record<string, string> = {}
	slideTexts.forEach((text, i) => {
		files[`ppt/slides/slide${i + 1}.xml`] =
			`<?xml version="1.0" encoding="UTF-8"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`
	})
	return createMockZip(files)
}

function createMockXlsx(sharedStrings: string[]): Buffer {
	const siXml = sharedStrings.map((s) => `<si><t>${s}</t></si>`).join("")
	const sharedStringsXml = `<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${siXml}</sst>`
	return createMockZip({
		"xl/sharedStrings.xml": sharedStringsXml,
	})
}

describe("LibraryService", () => {
	let tempDir: string
	let service: LibraryService

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "my-library-test-"))
		service = new LibraryService(tempDir)
	})

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true })
	})

	it("creates folder and lists items correctly", () => {
		const folder = service.createFolder("TestFolder")
		expect(folder.name).toBe("TestFolder")
		expect(folder.type).toBe("folder")

		const list = service.listItems()
		expect(list.length).toBe(1)
		expect(list[0].name).toBe("TestFolder")
	})

	it("adds document and respects token budget in search", async () => {
		const content =
			"SAG is SQL-Retrieval Augmented Generation with Event-Entity index"
		const item = await service.addFile("sag-note.txt", Buffer.from(content))
		expect(item.name).toBe("sag-note.txt")
		expect(item.type).toBe("document")

		const res = await service.search({ query: "Augmented", maxTokens: 800 })
		expect(res.items.length).toBe(1)
		expect(res.items[0].snippet).toContain("Augmented")
		expect(res.tokenCount).toBeLessThanOrEqual(800)
	})

	it("toggles favorite status", async () => {
		const item = await service.addFile("test.txt", Buffer.from("hello world"))
		expect(item.isFavorite).toBe(false)

		const isFav = service.toggleFavorite(item.id)
		expect(isFav).toBe(true)

		const list = service.listItems()
		expect(list[0].isFavorite).toBe(true)
	})

	it("matches colloquial queries and character n-grams like 潜渊将的啥？", async () => {
		const chapter1 =
			"# 第一章 听雨院\n周衡穿越成为七皇子萧沉渊，在听雨院和阿七一起生存。"
		const chapter2 = "# 第二章 第一锅皂\n萧沉渊与阿七用草木灰制造第一份肥皂。"
		await service.addFile("第一章.md", Buffer.from(chapter1))
		await service.addFile("第二章.md", Buffer.from(chapter2))

		// Query has typos/colloquial suffixes: "潜渊将的啥？"
		const res = await service.search({ query: "潜渊将的啥？" })
		expect(res.items.length).toBeGreaterThan(0)
		expect(res.items[0].snippet).toContain("萧沉渊")
	})

	it("removes corresponding index and metadata records when deleting file or image", async () => {
		const imgItem = await service.addFile(
			"sample.png",
			Buffer.from("fake image bytes"),
		)
		expect(imgItem).toBeDefined()

		// Manually mock index/analysis metadata
		const metaPath = path.join(tempDir, ".library-meta.json")
		const meta = fs.existsSync(metaPath)
			? JSON.parse(fs.readFileSync(metaPath, "utf-8"))
			: { favorites: {}, tags: {}, sagSyncMap: {}, imageDescriptions: {} }
		meta.imageDescriptions = {
			"sample.png": {
				ocrText: "Ralph loop orchestration AI agent",
				summary: "An overview diagram of Ralph loop",
				tags: ["ralph", "agent"],
				analyzedAt: new Date().toISOString(),
				modelUsed: "deepseek/deepseek-flash",
			},
		}
		meta.favorites["sample.png"] = true
		meta.tags["sample.png"] = ["diagram"]
		meta.sagSyncMap["sample.png"] = {
			documentId: "doc-123",
			syncedAt: new Date().toISOString(),
		}
		fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf-8")

		// Verify status shows indexed
		const statusBefore = service.getImageIndexStatus()
		expect(statusBefore.indexedImages).toBe(1)

		// Search finds it via OCR
		const searchBefore = await service.search({ query: "orchestration" })
		expect(searchBefore.items.length).toBe(1)
		expect(searchBefore.items[0].id).toBe("sample.png")
		expect(searchBefore.items[0].hasOcr).toBe(true)

		// Delete the image
		const deleted = await service.deleteItem("sample.png")
		expect(deleted).toBe(true)

		// Verify file is removed from disk
		expect(fs.existsSync(path.join(tempDir, "sample.png"))).toBe(false)

		// Verify metadata and index records are deleted
		const metaAfter = JSON.parse(fs.readFileSync(metaPath, "utf-8"))
		expect(metaAfter.imageDescriptions["sample.png"]).toBeUndefined()
		expect(metaAfter.favorites["sample.png"]).toBeUndefined()
		expect(metaAfter.tags["sample.png"]).toBeUndefined()
		expect(metaAfter.sagSyncMap["sample.png"]).toBeUndefined()

		// Verify index status is updated
		const statusAfter = service.getImageIndexStatus()
		expect(statusAfter.indexedImages).toBe(0)
		expect(statusAfter.totalImages).toBe(0)

		// Search no longer returns the deleted image
		const searchAfter = await service.search({ query: "orchestration" })
		expect(searchAfter.items.length).toBe(0)
	})

	it("removes nested items index records when deleting a folder", async () => {
		service.createFolder("SubDir")
		await service.addFile(
			"nested.png",
			Buffer.from("fake nested image"),
			"SubDir",
		)

		const metaPath = path.join(tempDir, ".library-meta.json")
		const meta = fs.existsSync(metaPath)
			? JSON.parse(fs.readFileSync(metaPath, "utf-8"))
			: { favorites: {}, tags: {}, sagSyncMap: {}, imageDescriptions: {} }
		const nestedRel = path.join("SubDir", "nested.png")
		meta.imageDescriptions = {
			[nestedRel]: {
				ocrText: "Nested confidential text",
				summary: "Nested summary",
				tags: ["nested"],
				analyzedAt: new Date().toISOString(),
				modelUsed: "deepseek/deepseek-flash",
			},
		}
		meta.favorites[nestedRel] = true
		meta.tags[nestedRel] = ["secret"]
		fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf-8")

		// Delete entire folder
		const deleted = await service.deleteItem("SubDir")
		expect(deleted).toBe(true)

		const metaAfter = JSON.parse(fs.readFileSync(metaPath, "utf-8"))
		expect(metaAfter.imageDescriptions[nestedRel]).toBeUndefined()
		expect(metaAfter.favorites[nestedRel]).toBeUndefined()
		expect(metaAfter.tags[nestedRel]).toBeUndefined()
	})

	it("returns item content for image, markdown, and document preview", async () => {
		// 1. Markdown file
		const mdText = "# Title\n\nPreview body content"
		await service.addFile("doc.md", Buffer.from(mdText))
		const mdContent = await service.getItemContent("doc.md")
		expect(mdContent).not.toBeNull()
		expect(mdContent?.isMarkdown).toBe(true)
		expect(mdContent?.isText).toBe(true)
		expect(mdContent?.isImage).toBe(false)
		expect(mdContent?.textContent).toBe(mdText)
		expect(mdContent?.extension).toBe("md")

		// 2. Image file with analysis metadata
		await service.addFile("test.png", Buffer.from("fake image bytes"))
		const metaPath = path.join(tempDir, ".library-meta.json")
		const meta = fs.existsSync(metaPath)
			? JSON.parse(fs.readFileSync(metaPath, "utf-8"))
			: { favorites: {}, tags: {}, sagSyncMap: {}, imageDescriptions: {} }
		meta.imageDescriptions = {
			"test.png": {
				ocrText: "Sample extracted OCR text",
				summary: "Diagram showing flow",
				tags: ["flow", "diagram"],
				analyzedAt: new Date().toISOString(),
				modelUsed: "deepseek/deepseek-flash",
			},
		}
		fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf-8")

		const imgContent = await service.getItemContent("test.png")
		expect(imgContent).not.toBeNull()
		expect(imgContent?.isImage).toBe(true)
		expect(imgContent?.isMarkdown).toBe(false)
		expect(imgContent?.analysis?.ocrText).toBe("Sample extracted OCR text")
		expect(imgContent?.analysis?.tags).toEqual(["flow", "diagram"])
		expect(imgContent?.imageDataUrl).toContain("data:image/png;base64,")

		// 3. Word document (.docx)
		const mockDocxBuf = createMockDocx(
			"庆祝中国共产党成立105周年大会重要讲话内容：牢记初心使命，坚持高质量发展。",
		)
		await service.addFile("105周年讲话.docx", mockDocxBuf)
		const docContent = await service.getItemContent("105周年讲话.docx")
		expect(docContent).not.toBeNull()
		expect(docContent?.isImage).toBe(false)
		expect(docContent?.isMarkdown).toBe(false)
		expect(docContent?.isText).toBe(true)
		expect(docContent?.textContent).toContain(
			"庆祝中国共产党成立105周年大会重要讲话内容",
		)
		expect(docContent?.extension).toBe("docx")

		// Search inside .docx document content
		const searchRes = await service.search({
			query: "105周年大会讲话",
		})
		expect(searchRes.items.length).toBeGreaterThan(0)
		expect(searchRes.items[0].snippet).toContain("牢记初心使命")

		// 4. PowerPoint presentation (.pptx)
		const mockPptxBuf = createMockPptx([
			"项目年度汇报：技术架构全面升级",
			"第二页：核心指标大幅提升，系统控制能力建设。",
		])
		await service.addFile("project-review.pptx", mockPptxBuf)
		const pptContent = await service.getItemContent("project-review.pptx")
		expect(pptContent).not.toBeNull()
		expect(pptContent?.isText).toBe(true)
		expect(pptContent?.textContent).toContain("项目年度汇报")
		expect(pptContent?.textContent).toContain("系统控制能力建设")
		expect(pptContent?.extension).toBe("pptx")

		// Search inside .pptx
		const pptSearch = await service.search({ query: "技术架构" })
		expect(pptSearch.items.length).toBeGreaterThan(0)
		expect(pptSearch.items[0].id).toBe("project-review.pptx")
		expect(pptSearch.items[0].snippet).toContain("全面升级")

		// 5. Excel spreadsheet (.xlsx)
		const mockXlsxBuf = createMockXlsx([
			"季度财务报表",
			"研发费用预算支出总计",
			"云计算基础设施成本核算",
		])
		await service.addFile("q3-financial.xlsx", mockXlsxBuf)
		const xlsxContent = await service.getItemContent("q3-financial.xlsx")
		expect(xlsxContent).not.toBeNull()
		expect(xlsxContent?.isText).toBe(true)
		expect(xlsxContent?.textContent).toContain("季度财务报表")
		expect(xlsxContent?.textContent).toContain("云计算基础设施成本核算")
		expect(xlsxContent?.extension).toBe("xlsx")

		// Search inside .xlsx
		const xlsxSearch = await service.search({ query: "基础设施成本" })
		expect(xlsxSearch.items.length).toBeGreaterThan(0)
		expect(xlsxSearch.items[0].id).toBe("q3-financial.xlsx")
		expect(xlsxSearch.items[0].snippet).toContain("云计算基础设施成本核算")

		// 6. Legacy Office binary (.ppt, .xls, .doc)
		const legacyPptBuf = Buffer.concat([
			Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), // OLE header signature
			Buffer.from("PowerPoint Document", "utf8"),
			Buffer.alloc(16, 0),
			Buffer.from(
				"历史项目演示文稿：团队全员攻坚克难，保障产品按期交付。",
				"utf16le",
			),
			Buffer.alloc(8, 0),
		])
		await service.addFile("legacy-presentation.ppt", legacyPptBuf)
		const legacyContent = await service.getItemContent(
			"legacy-presentation.ppt",
		)
		expect(legacyContent).not.toBeNull()
		expect(legacyContent?.isText).toBe(true)
		expect(legacyContent?.textContent).toContain("团队全员攻坚克难")
		expect(legacyContent?.extension).toBe("ppt")

		// Search inside legacy .ppt
		const legacySearch = await service.search({ query: "攻坚克难" })
		expect(legacySearch.items.length).toBeGreaterThan(0)
		expect(legacySearch.items[0].id).toBe("legacy-presentation.ppt")
		expect(legacySearch.items[0].snippet).toContain("团队全员攻坚克难")
	})

	it("extracts structured paragraphs and headings from docx preserving paragraph breaks and layout", async () => {
		const docxXml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>在庆祝中国共产党成立105周年大会上的讲话</w:t></w:r></w:p>
    <w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>(2026年7月1日)</w:t></w:r></w:p>
    <w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>习近平</w:t></w:r></w:p>
    <w:p><w:r><w:t>同志们，朋友们：</w:t></w:r></w:p>
    <w:p><w:r><w:t>今天，我们隆重集会，庆祝中国共产党成立105周年。</w:t></w:r></w:p>
    <w:p><w:r><w:t>首先，我代表党中央，向全体中国共产党员致以节日的问候！</w:t></w:r></w:p>
  </w:body>
</w:document>`
		const docxBuf = createMockZip({ "word/document.xml": docxXml })
		await service.addFile("105周年结构讲话.docx", docxBuf)

		const content = await service.getItemContent("105周年结构讲话.docx")
		expect(content).not.toBeNull()
		expect(content?.isText).toBe(true)

		const text = content?.textContent || ""
		// Title formatted as heading
		expect(text).toContain("# 在庆祝中国共产党成立105周年大会上的讲话")
		// Date and author as separate paragraphs
		expect(text).toContain("(2026年7月1日)")
		expect(text).toContain("习近平")
		// Separate paragraphs with newlines
		expect(text).toContain("同志们，朋友们：\n\n今天，我们隆重集会")
		expect(text).toContain("105周年。\n\n首先，我代表党中央")
	})

	it("handles rich previews for PDF, HTML, CSV, and structured sheets/slides", async () => {
		// 1. PDF file
		const fakePdf = Buffer.from(
			"%PDF-1.4\n1 0 obj\n<<\n>>\nendobj\ntrailer\n<<\n>>\n%%EOF",
		)
		await service.addFile("sample.pdf", fakePdf)
		const pdfContent = await service.getItemContent("sample.pdf")
		expect(pdfContent?.isPdf).toBe(true)
		expect(pdfContent?.pdfDataUrl).toContain("data:application/pdf;base64,")

		// 2. HTML file
		const htmlStr =
			"<!DOCTYPE html><html><body><h1>Web Page Preview</h1><p>Hello HTML</p></body></html>"
		await service.addFile("page.html", Buffer.from(htmlStr, "utf-8"))
		const htmlContent = await service.getItemContent("page.html")
		expect(htmlContent?.isHtml).toBe(true)
		expect(htmlContent?.htmlContent).toBe(htmlStr)

		// 3. CSV file
		const csvStr =
			"Name,Department,Salary\nAlice,Engineering,15000\nBob,Design,12000"
		await service.addFile("employees.csv", Buffer.from(csvStr, "utf-8"))
		const csvContent = await service.getItemContent("employees.csv")
		expect(csvContent?.isSpreadsheet).toBe(true)
		expect(csvContent?.spreadsheetData).toBeDefined()
		expect(csvContent?.spreadsheetData?.[0].rows).toEqual([
			["Name", "Department", "Salary"],
			["Alice", "Engineering", "15000"],
			["Bob", "Design", "12000"],
		])
	})
})
