import * as fs from "node:fs"
import * as path from "node:path"
import * as zlib from "node:zlib"
import { generateText } from "ai"
import { SagClient } from "@zleap-ai/sag-sdk/personal"
import { getAppDataDir } from "../utils/project.js"
import { TokenCounter } from "../memory/token-counter.js"
import { DEFAULT_OM_MODEL_ID } from "../harness/state.js"
import type {
	ImageAnalysisData,
	LibraryItem,
	LibraryItemContent,
	LibraryItemSheet,
	LibraryItemSlide,
	LibraryItemType,
	LibraryMetadata,
	LibrarySearchOptions,
	LibrarySearchResult,
} from "./types.js"

const IMAGE_EXTENSIONS = new Set([
	".png",
	".jpg",
	".jpeg",
	".gif",
	".webp",
	".svg",
	".bmp",
	".ico",
])

const MARKDOWN_EXTENSIONS = new Set([
	".md",
	".markdown",
	".mdown",
	".mdwn",
	".mdx",
])

const TEXT_EXTENSIONS = new Set([
	".txt",
	".json",
	".csv",
	".tsv",
	".log",
	".py",
	".js",
	".jsx",
	".ts",
	".tsx",
	".html",
	".css",
	".scss",
	".less",
	".yaml",
	".yml",
	".xml",
	".sh",
	".bash",
	".zsh",
	".sql",
	".env",
	".ini",
	".conf",
	".toml",
	".rs",
	".go",
	".java",
	".c",
	".cpp",
	".h",
])

/**
 * Validates that extracted or sliced text is human-readable and meaningful,
 * filtering out binary mojibake (like l@@A@@... or repeating control symbols).
 */
export function isMeaningfulText(text: string): boolean {
	if (!text) return false
	if (text.includes("\0")) return false

	let alphanumericCjk = 0
	let weirdSymbols = 0

	for (let i = 0; i < text.length; i++) {
		const code = text.charCodeAt(i)
		// CJK Unified Ideographs & punctuation
		if (
			(code >= 0x4e00 && code <= 0x9fa5) ||
			(code >= 0x3000 && code <= 0x303f) ||
			(code >= 0xff00 && code <= 0xffef)
		) {
			alphanumericCjk++
		}
		// ASCII alphanumeric
		else if (
			(code >= 65 && code <= 90) ||
			(code >= 97 && code <= 122) ||
			(code >= 48 && code <= 57)
		) {
			alphanumericCjk++
		}
		// Characters heavily associated with binary mojibake: @, ~, `, ^, |, \, control codes
		else if (
			code === 64 ||
			code === 126 ||
			code === 96 ||
			code === 94 ||
			code === 124 ||
			code === 92 ||
			code < 32 ||
			code >= 127
		) {
			weirdSymbols++
		}
	}

	// Must have adequate readable content and not be overwhelmed by binary noise
	if (
		weirdSymbols > text.length * 0.15 ||
		alphanumericCjk < text.length * 0.35
	) {
		return false
	}
	return true
}

function decodeXmlEntities(str: string): string {
	return str
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&#(\d+);/g, (_, dec) => {
			const n = parseInt(dec, 10)
			return !isNaN(n) ? String.fromCharCode(n) : ""
		})
		.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
			const n = parseInt(hex, 16)
			return !isNaN(n) ? String.fromCharCode(n) : ""
		})
}

function shouldExtractZipEntry(
	fileName: string,
	ext: string,
): { isMatch: boolean; tagRegex: RegExp } {
	const lowerExt = ext.toLowerCase()

	// PowerPoint: .pptx, .ppsx, .potx
	if (lowerExt === ".pptx" || lowerExt === ".ppsx" || lowerExt === ".potx") {
		if (
			(fileName.startsWith("ppt/slides/slide") ||
				fileName.startsWith("ppt/notesSlides/notesSlide") ||
				fileName.startsWith("ppt/comments/comment")) &&
			fileName.endsWith(".xml")
		) {
			return { isMatch: true, tagRegex: /<a:t[^>]*>([^<]*)<\/a:t>/g }
		}
	}

	// Excel: .xlsx, .xlsm, .xltx
	if (lowerExt === ".xlsx" || lowerExt === ".xlsm" || lowerExt === ".xltx") {
		if (
			fileName === "xl/sharedStrings.xml" ||
			fileName === "xl/workbook.xml" ||
			fileName.startsWith("xl/comments") ||
			(fileName.startsWith("xl/worksheets/sheet") && fileName.endsWith(".xml"))
		) {
			return {
				isMatch: true,
				tagRegex:
					/<(?:[a-zA-Z0-9_]+:)?(?:t|v)[^>]*>([^<]*)<\/(?:[a-zA-Z0-9_]+:)?(?:t|v)>/g,
			}
		}
	}

	// Word: .docx, .docm, .dotx
	if (lowerExt === ".docx" || lowerExt === ".docm" || lowerExt === ".dotx") {
		if (
			fileName === "word/document.xml" ||
			(fileName.startsWith("word/header") && fileName.endsWith(".xml")) ||
			(fileName.startsWith("word/footer") && fileName.endsWith(".xml"))
		) {
			return { isMatch: true, tagRegex: /<w:t[^>]*>([^<]*)<\/w:t>/g }
		}
	}

	return { isMatch: false, tagRegex: /<[^>]+>([^<]*)<\/[^>]+>/g }
}

const OFFICE_ARCHIVE_EXTENSIONS = new Set([
	".docx",
	".docm",
	".dotx",
	".pptx",
	".ppsx",
	".potx",
	".xlsx",
	".xlsm",
	".xltx",
])

const LEGACY_OFFICE_EXTENSIONS = new Set([
	".doc",
	".dot",
	".ppt",
	".pps",
	".pot",
	".xls",
	".xlt",
])

const OLE_INTERNAL_NAMES = new Set([
	"Root Entry",
	"Workbook",
	"Book",
	"PowerPoint Document",
	"Current User",
	"WordDocument",
	"SummaryInformation",
	"DocumentSummaryInformation",
	"CompObj",
	"ObjectPool",
])

export function extractDocxXml(xml: string): string {
	const blocks: string[] = []
	const blockRegex = /<w:(p|tbl)(?:[\s>][\s\S]*?<\/w:\1>|[\s]*\/>)/g
	let match: RegExpExecArray | null

	while ((match = blockRegex.exec(xml)) !== null) {
		const blockType = match[1]
		const blockXml = match[0]

		if (blockType === "p") {
			let headingPrefix = ""
			const styleMatch = blockXml.match(/<w:pStyle\s+[^>]*w:val="([^"]+)"/i)
			if (styleMatch) {
				const val = styleMatch[1].toLowerCase()
				if (val === "heading1" || val === "1" || val === "title") {
					headingPrefix = "# "
				} else if (val === "heading2" || val === "2" || val === "subtitle") {
					headingPrefix = "## "
				} else if (val === "heading3" || val === "3") {
					headingPrefix = "### "
				}
			}

			let pText = ""
			const tokenRegex =
				/<w:t(?:\s+xml:space="preserve")?[^>]*>([^<]*)<\/w:t>|<w:br\s*\/?>|<w:tab\s*\/?>/g
			let tMatch: RegExpExecArray | null
			while ((tMatch = tokenRegex.exec(blockXml)) !== null) {
				if (tMatch[0].startsWith("<w:br")) {
					pText += "\n"
				} else if (tMatch[0].startsWith("<w:tab")) {
					pText += "    "
				} else if (tMatch[1] !== undefined) {
					pText += decodeXmlEntities(tMatch[1])
				}
			}

			const trimmed = pText.trim()
			if (trimmed) {
				blocks.push((headingPrefix ? headingPrefix : "") + trimmed)
			}
		} else if (blockType === "tbl") {
			const rowRegex = /<w:tr(?:[\s>][\s\S]*?<\/w:tr>|[\s]*\/>)/g
			let rMatch: RegExpExecArray | null
			const rows: string[][] = []

			while ((rMatch = rowRegex.exec(blockXml)) !== null) {
				const rowXml = rMatch[0]
				const cellRegex = /<w:tc(?:[\s>][\s\S]*?<\/w:tc>|[\s]*\/>)/g
				let cMatch: RegExpExecArray | null
				const cells: string[] = []

				while ((cMatch = cellRegex.exec(rowXml)) !== null) {
					const cellXml = cMatch[0]
					const tRegex = /<w:t(?:\s+xml:space="preserve")?[^>]*>([^<]*)<\/w:t>/g
					let cellText = ""
					let ctMatch: RegExpExecArray | null
					while ((ctMatch = tRegex.exec(cellXml)) !== null) {
						if (ctMatch[1]) cellText += decodeXmlEntities(ctMatch[1])
					}
					cells.push(cellText.trim().replace(/\|/g, "\\|"))
				}
				if (cells.some((c) => c.length > 0)) {
					rows.push(cells)
				}
			}

			if (rows.length > 0) {
				const colCount = Math.max(...rows.map((r) => r.length))
				const tableLines: string[] = []
				for (let i = 0; i < rows.length; i++) {
					const row = rows[i]
					while (row.length < colCount) row.push("")
					tableLines.push(`| ${row.join(" | ")} |`)
					if (i === 0) {
						tableLines.push(
							`| ${new Array(colCount).fill("---").join(" | ")} |`,
						)
					}
				}
				blocks.push(tableLines.join("\n"))
			}
		}
	}

	return blocks.join("\n\n")
}

export function extractPptxSlideXml(xml: string): string {
	const paragraphs: string[] = []
	const pRegex = /<a:p(?:[\s>][\s\S]*?<\/a:p>|[\s]*\/>)/g
	let match: RegExpExecArray | null

	while ((match = pRegex.exec(xml)) !== null) {
		const pXml = match[0]
		const tRegex = /<a:t[^>]*>([^<]*)<\/a:t>|<a:br\s*\/?>/g
		let pText = ""
		let tMatch: RegExpExecArray | null
		while ((tMatch = tRegex.exec(pXml)) !== null) {
			if (tMatch[0].startsWith("<a:br")) {
				pText += "\n"
			} else if (tMatch[1] !== undefined) {
				pText += decodeXmlEntities(tMatch[1])
			}
		}
		const trimmed = pText.trim()
		if (trimmed) {
			paragraphs.push(trimmed)
		}
	}

	return paragraphs.join("\n\n")
}

export function colLetterToIndex(col: string): number {
	let index = 0
	for (let i = 0; i < col.length; i++) {
		index = index * 26 + (col.charCodeAt(i) - 64)
	}
	return index - 1
}

export function parseDelimitedText(text: string, delimiter = ","): string[][] {
	const rows: string[][] = []
	let currentRow: string[] = []
	let currentCell = ""
	let inQuotes = false

	for (let i = 0; i < text.length; i++) {
		const char = text[i]
		const nextChar = text[i + 1]

		if (char === '"') {
			if (inQuotes && nextChar === '"') {
				currentCell += '"'
				i++
			} else {
				inQuotes = !inQuotes
			}
		} else if (char === delimiter && !inQuotes) {
			currentRow.push(currentCell.trim())
			currentCell = ""
		} else if ((char === "\r" || char === "\n") && !inQuotes) {
			if (char === "\r" && nextChar === "\n") {
				i++
			}
			currentRow.push(currentCell.trim())
			if (currentRow.some((c) => c.length > 0)) {
				rows.push(currentRow)
			}
			currentRow = []
			currentCell = ""
		} else {
			currentCell += char
		}
	}
	if (currentCell.length > 0 || currentRow.length > 0) {
		currentRow.push(currentCell.trim())
		if (currentRow.some((c) => c.length > 0)) {
			rows.push(currentRow)
		}
	}
	return rows
}

export function parseXlsxSheets(
	entries: Map<string, string>,
): Array<{ name: string; rows: string[][] }> {
	const sharedStrings: string[] = []
	const ssXml = entries.get("xl/sharedStrings.xml")
	if (ssXml) {
		const siRegex = /<si(?:[\s>][\s\S]*?<\/si>|[\s]*\/>)/g
		let siMatch: RegExpExecArray | null
		while ((siMatch = siRegex.exec(ssXml)) !== null) {
			const siContent = siMatch[0]
			const tRegex = /<t(?:\s+xml:space="preserve")?[^>]*>([^<]*)<\/t>/g
			let tMatch: RegExpExecArray | null
			let text = ""
			while ((tMatch = tRegex.exec(siContent)) !== null) {
				if (tMatch[1]) text += decodeXmlEntities(tMatch[1])
			}
			sharedStrings.push(text)
		}
	}

	const sheetNamesList: string[] = []
	const wbXml = entries.get("xl/workbook.xml")
	if (wbXml) {
		const sheetTagRegex = /<sheet\s+[^>]*name="([^"]+)"[^>]*>/g
		let sMatch: RegExpExecArray | null
		while ((sMatch = sheetTagRegex.exec(wbXml)) !== null) {
			sheetNamesList.push(decodeXmlEntities(sMatch[1]))
		}
	}

	const sheetKeys = Array.from(entries.keys())
		.filter((k) => k.startsWith("xl/worksheets/sheet") && k.endsWith(".xml"))
		.sort((a, b) => {
			const aNum = parseInt(a.replace(/[^0-9]/g, ""), 10) || 0
			const bNum = parseInt(b.replace(/[^0-9]/g, ""), 10) || 0
			return aNum - bNum
		})

	const sheets: Array<{ name: string; rows: string[][] }> = []

	for (let sIdx = 0; sIdx < sheetKeys.length; sIdx++) {
		const sheetKey = sheetKeys[sIdx]
		const sheetName = sheetNamesList[sIdx] || `Sheet ${sIdx + 1}`
		const sheetXml = entries.get(sheetKey)!
		const rowRegex = /<row\s+[^>]*>([\s\S]*?)<\/row>/g
		let rowMatch: RegExpExecArray | null
		const rows: string[][] = []

		while ((rowMatch = rowRegex.exec(sheetXml)) !== null) {
			const rowContent = rowMatch[1]
			const cellRegex =
				/<c\s+[^>]*?(?:r="([A-Z]+)\d+")?[^>]*?(?:t="([^"]*)")?[^>]*>(?:<v>([^<]*)<\/v>|<is><t>([^<]*)<\/t><\/is>)?<\/c>/g
			let cellMatch: RegExpExecArray | null
			const cells: string[] = []

			while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
				const colLetter = cellMatch[1]
				const type = cellMatch[2]
				const val = cellMatch[3]
				const inlineVal = cellMatch[4]

				let cellStr = ""
				if (inlineVal) {
					cellStr = decodeXmlEntities(inlineVal)
				} else if (val) {
					if (type === "s") {
						const idx = parseInt(val, 10)
						cellStr = sharedStrings[idx] ?? val
					} else {
						cellStr = decodeXmlEntities(val)
					}
				}

				if (colLetter) {
					const colIdx = colLetterToIndex(colLetter)
					if (colIdx >= 0) {
						while (cells.length < colIdx) {
							cells.push("")
						}
					}
				}
				cells.push(cellStr.trim())
			}

			if (cells.some((c) => c.length > 0)) {
				rows.push(cells)
			}
		}

		if (rows.length > 0) {
			sheets.push({ name: sheetName, rows })
		}
	}

	return sheets
}

export function extractXlsxXml(entries: Map<string, string>): string {
	const sheets = parseXlsxSheets(entries)
	const sheetBlocks: string[] = []
	for (const sheet of sheets) {
		const rows = sheet.rows
		if (rows.length === 0) continue
		const colCount = Math.max(...rows.map((r) => r.length))
		const tableLines: string[] = []
		if (sheets.length > 1) {
			tableLines.push(`### ${sheet.name}\n`)
		}
		for (let i = 0; i < rows.length; i++) {
			const row = [...rows[i]]
			while (row.length < colCount) row.push("")
			tableLines.push(
				`| ${row.map((c) => c.replace(/\|/g, "\\|")).join(" | ")} |`,
			)
			if (i === 0) {
				tableLines.push(`| ${new Array(colCount).fill("---").join(" | ")} |`)
			}
		}
		sheetBlocks.push(tableLines.join("\n"))
	}
	return sheetBlocks.join("\n\n---\n\n")
}

export function parsePptxSlides(
	entries: Map<string, string>,
): Array<{ index: number; title?: string; content: string }> {
	const slideEntries = Array.from(entries.entries())
		.filter(([k]) => k.startsWith("ppt/slides/slide") && k.endsWith(".xml"))
		.sort(([a], [b]) => {
			const aNum = parseInt(a.replace(/[^0-9]/g, ""), 10) || 0
			const bNum = parseInt(b.replace(/[^0-9]/g, ""), 10) || 0
			return aNum - bNum
		})

	return slideEntries.map(([name, xml], idx) => {
		const slideContent = extractPptxSlideXml(xml)
		const lines = slideContent.split("\n").filter((l) => l.trim().length > 0)
		const title = lines[0] || `Slide ${idx + 1}`
		return {
			index: idx + 1,
			title,
			content: slideContent,
		}
	})
}

export function extractOfficeArchiveEntries(
	buffer: Buffer,
	ext: string,
): Map<string, string> {
	const entries = new Map<string, string>()

	const addEntry = (
		fileName: string,
		compressionMethod: number,
		compressed: Buffer,
	) => {
		try {
			const xml =
				compressionMethod === 8
					? zlib.inflateRawSync(compressed).toString("utf8")
					: compressed.toString("utf8")
			entries.set(fileName, xml)
		} catch {}
	}

	// 1. Scan Central Directory headers (PK\x01\x02 = 0x02014b50)
	let pos = 0
	while (pos < buffer.length - 46) {
		if (buffer.readUInt32LE(pos) === 0x02014b50) {
			const compressionMethod = buffer.readUInt16LE(pos + 10)
			const compressedSize = buffer.readUInt32LE(pos + 20)
			const fileNameLen = buffer.readUInt16LE(pos + 28)
			const extraLen = buffer.readUInt16LE(pos + 30)
			const commentLen = buffer.readUInt16LE(pos + 32)
			const localHeaderOffset = buffer.readUInt32LE(pos + 42)
			const fileName = buffer.toString("utf8", pos + 46, pos + 46 + fileNameLen)

			const match = shouldExtractZipEntry(fileName, ext)
			if (match.isMatch && localHeaderOffset < buffer.length - 30) {
				try {
					const localNameLen = buffer.readUInt16LE(localHeaderOffset + 26)
					const localExtraLen = buffer.readUInt16LE(localHeaderOffset + 28)
					const dataStart =
						localHeaderOffset + 30 + localNameLen + localExtraLen
					if (
						dataStart + compressedSize <= buffer.length &&
						compressedSize > 0
					) {
						const compressed = buffer.subarray(
							dataStart,
							dataStart + compressedSize,
						)
						addEntry(fileName, compressionMethod, compressed)
					}
				} catch {}
			}
			pos += 46 + fileNameLen + extraLen + commentLen
		} else {
			pos++
		}
	}

	// 2. Fallback to scanning local headers if central directory didn't yield entries
	if (entries.size === 0) {
		pos = 0
		while (pos < buffer.length - 30) {
			if (buffer.readUInt32LE(pos) === 0x04034b50) {
				const compressionMethod = buffer.readUInt16LE(pos + 8)
				const compressedSize = buffer.readUInt32LE(pos + 18)
				const fileNameLen = buffer.readUInt16LE(pos + 26)
				const extraLen = buffer.readUInt16LE(pos + 28)
				const fileName = buffer.toString(
					"utf8",
					pos + 30,
					pos + 30 + fileNameLen,
				)
				const dataStart = pos + 30 + fileNameLen + extraLen

				const match = shouldExtractZipEntry(fileName, ext)
				if (
					match.isMatch &&
					compressedSize > 0 &&
					dataStart + compressedSize <= buffer.length
				) {
					const compressed = buffer.subarray(
						dataStart,
						dataStart + compressedSize,
					)
					addEntry(fileName, compressionMethod, compressed)
				}
				pos +=
					30 +
					fileNameLen +
					extraLen +
					(compressedSize > 0 ? compressedSize : 0)
			} else {
				pos++
			}
		}
	}

	return entries
}

/**
 * Extracts structured plain text from Office OpenXML archives (.docx, .pptx, .xlsx, etc.) without external dependencies.
 */
export function extractTextFromOfficeArchive(
	buffer: Buffer,
	ext: string,
): string {
	try {
		const entries = extractOfficeArchiveEntries(buffer, ext)
		const lowerExt = ext.toLowerCase()

		// Case A: Word (.docx, .docm, .dotx)
		if (lowerExt === ".docx" || lowerExt === ".docm" || lowerExt === ".dotx") {
			const docXml = entries.get("word/document.xml")
			if (docXml) {
				const structured = extractDocxXml(docXml)
				if (isMeaningfulText(structured)) {
					return structured
				}
			}
		}

		// Case B: PowerPoint (.pptx, .ppsx, .potx)
		if (lowerExt === ".pptx" || lowerExt === ".ppsx" || lowerExt === ".potx") {
			const slides = parsePptxSlides(entries)
			if (slides.length > 0) {
				const slidesText = slides
					.map(
						(s) =>
							`### Slide ${s.index}${s.title ? `: ${s.title}` : ""}\n\n${s.content}`,
					)
					.filter((s) => s.trim().length > 0)
					.join("\n\n---\n\n")

				if (isMeaningfulText(slidesText)) {
					return slidesText
				}
			}
		}

		// Case C: Excel (.xlsx, .xlsm, .xltx)
		if (lowerExt === ".xlsx" || lowerExt === ".xlsm" || lowerExt === ".xltx") {
			const xlsxText = extractXlsxXml(entries)
			if (isMeaningfulText(xlsxText)) {
				return xlsxText
			}
		}

		// Fallback: Generic tag extraction
		const fallbackTexts: string[] = []
		for (const [fileName, xml] of entries) {
			const match = shouldExtractZipEntry(fileName, ext)
			let m: RegExpExecArray | null
			while ((m = match.tagRegex.exec(xml)) !== null) {
				if (m[1]) {
					const decoded = decodeXmlEntities(m[1].trim())
					if (decoded) fallbackTexts.push(decoded)
				}
			}
			fallbackTexts.push("\n")
		}

		const full = fallbackTexts
			.join(" ")
			.replace(/[ \t]+/g, " ")
			.replace(/\n\s*\n/g, "\n")
			.trim()
		return isMeaningfulText(full) ? full : ""
	} catch (err) {
		console.warn(
			"[LibraryService] Failed to extract text from office archive:",
			err,
		)
	}
	return ""
}

/** Alias for backward compatibility */
export const extractTextFromDocx = (buffer: Buffer): string =>
	extractTextFromOfficeArchive(buffer, ".docx")

/**
 * Extracts printable UTF-16LE and ASCII text runs from legacy binary Office (.doc, .ppt, .xls) documents.
 */
export function extractTextFromLegacyOfficeBinary(buffer: Buffer): string {
	try {
		const chunks: string[] = []

		// 1. Scan UTF-16LE runs (both even and odd byte alignments)
		const scanUtf16 = (startOffset: number) => {
			let currentRun: string[] = []
			for (let i = startOffset; i < buffer.length - 1; i += 2) {
				const code = buffer.readUInt16LE(i)
				if (
					(code >= 0x4e00 && code <= 0x9fa5) || // CJK Unified Ideographs
					(code >= 0x3000 && code <= 0x303f) || // CJK Symbols & Punctuation
					(code >= 0xff00 && code <= 0xffef) || // Fullwidth forms
					(code >= 32 && code <= 126) || // Printable ASCII
					code === 10 ||
					code === 13 ||
					code === 9
				) {
					currentRun.push(String.fromCharCode(code))
				} else {
					if (currentRun.length >= 4) {
						const run = currentRun.join("").trim()
						if (
							run.length >= 4 &&
							!OLE_INTERNAL_NAMES.has(run) &&
							!run.includes("@@")
						) {
							chunks.push(run)
						}
					}
					currentRun = []
				}
			}
			if (currentRun.length >= 4) {
				const run = currentRun.join("").trim()
				if (
					run.length >= 4 &&
					!OLE_INTERNAL_NAMES.has(run) &&
					!run.includes("@@")
				) {
					chunks.push(run)
				}
			}
		}

		scanUtf16(0)
		scanUtf16(1)

		// 2. Scan 8-bit printable ASCII runs (for BIFF8 8-bit strings and PPT CString atoms)
		let asciiRun: number[] = []
		for (let i = 0; i < buffer.length; i++) {
			const b = buffer[i]
			if ((b >= 32 && b <= 126) || b === 10 || b === 13 || b === 9) {
				asciiRun.push(b)
			} else {
				if (asciiRun.length >= 4) {
					const str = Buffer.from(asciiRun).toString("utf8").trim()
					if (
						str.length >= 4 &&
						!OLE_INTERNAL_NAMES.has(str) &&
						!str.includes("@@")
					) {
						chunks.push(str)
					}
				}
				asciiRun = []
			}
		}
		if (asciiRun.length >= 4) {
			const str = Buffer.from(asciiRun).toString("utf8").trim()
			if (
				str.length >= 4 &&
				!OLE_INTERNAL_NAMES.has(str) &&
				!str.includes("@@")
			) {
				chunks.push(str)
			}
		}

		// Deduplicate adjacent identical chunks
		const deduped: string[] = []
		for (const chunk of chunks) {
			if (deduped[deduped.length - 1] !== chunk) {
				deduped.push(chunk)
			}
		}

		const full = deduped.join(" ").replace(/\s+/g, " ").trim()
		return isMeaningfulText(full) ? full : ""
	} catch {
		return ""
	}
}

/** Alias for backward compatibility */
export const extractTextFromDocBinary = extractTextFromLegacyOfficeBinary

/**
 * Universally extract readable text from any supported document format.
 * Returns empty string for unsupported binary formats (preventing mojibake).
 */
export function extractDocumentText(filePath: string): string {
	const ext = path.extname(filePath).toLowerCase()

	// 1. Plain text / Markdown
	if (TEXT_EXTENSIONS.has(ext) || MARKDOWN_EXTENSIONS.has(ext)) {
		try {
			const maxBytes = 2 * 1024 * 1024
			const stat = fs.statSync(filePath)
			const buffer = Buffer.alloc(Math.min(stat.size, maxBytes))
			const fd = fs.openSync(filePath, "r")
			const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0)
			fs.closeSync(fd)
			const text = buffer.toString("utf-8", 0, bytesRead)
			return isMeaningfulText(text) ? text : ""
		} catch {
			return ""
		}
	}

	// 2. Modern Office (.docx, .pptx, .xlsx, .xlsm, .ppsx, etc.)
	if (OFFICE_ARCHIVE_EXTENSIONS.has(ext)) {
		try {
			const buffer = fs.readFileSync(filePath)
			return extractTextFromOfficeArchive(buffer, ext)
		} catch {
			return ""
		}
	}

	// 3. Legacy Office (.doc, .ppt, .xls)
	if (LEGACY_OFFICE_EXTENSIONS.has(ext)) {
		try {
			const buffer = fs.readFileSync(filePath)
			return extractTextFromLegacyOfficeBinary(buffer)
		} catch {
			return ""
		}
	}

	// Non-text binaries: return empty to avoid garbled binary output
	return ""
}

export class LibraryService {
	private readonly rootDir: string
	private readonly metaFilePath: string
	private readonly tokenCounter: TokenCounter
	private sagClient: SagClient | null = null
	private sagOrigin: string
	private sagConnected = false
	private sagCheckedAt = 0

	private libraryJudgeModelId = DEFAULT_OM_MODEL_ID
	private imageProcessModelId = DEFAULT_OM_MODEL_ID
	private resolveModelFn?: (modelId: string, options?: any) => any

	constructor(customDir?: string, sagOrigin?: string) {
		this.rootDir = customDir || path.join(getAppDataDir(), "my-library")
		this.metaFilePath = path.join(this.rootDir, ".library-meta.json")
		this.tokenCounter = new TokenCounter()
		this.sagOrigin =
			sagOrigin || process.env.SAG_ORIGIN || "http://localhost:3000"

		this.ensureDirectory(this.rootDir)
		this.initSagClient()
	}

	private ensureDirectory(dirPath: string): void {
		if (!fs.existsSync(dirPath)) {
			fs.mkdirSync(dirPath, { recursive: true })
		}
	}

	private initSagClient(): void {
		try {
			this.sagClient = new SagClient({
				origin: this.sagOrigin,
				timeoutMs: 3000,
			})
		} catch {
			this.sagClient = null
		}
	}

	public async checkSagConnection(): Promise<boolean> {
		const now = Date.now()
		if (now - this.sagCheckedAt < 10000) {
			return this.sagConnected
		}
		this.sagCheckedAt = now
		if (!this.sagClient) {
			this.sagConnected = false
			return false
		}
		try {
			const res = await this.sagClient.ready()
			this.sagConnected = Boolean(res && (res as any).status !== "error")
			return this.sagConnected
		} catch {
			this.sagConnected = false
			return false
		}
	}

	public setConfig(config: {
		libraryJudgeModelId?: string
		imageProcessModelId?: string
		resolveModel?: (modelId: string, options?: any) => any
	}): void {
		if (config.libraryJudgeModelId)
			this.libraryJudgeModelId = config.libraryJudgeModelId
		if (config.imageProcessModelId)
			this.imageProcessModelId = config.imageProcessModelId
		if (config.resolveModel) this.resolveModelFn = config.resolveModel

		const meta = this.loadMetadata()
		let changed = false
		if (
			config.libraryJudgeModelId &&
			meta.libraryJudgeModelId !== config.libraryJudgeModelId
		) {
			meta.libraryJudgeModelId = config.libraryJudgeModelId
			changed = true
		}
		if (
			config.imageProcessModelId &&
			meta.imageProcessModelId !== config.imageProcessModelId
		) {
			meta.imageProcessModelId = config.imageProcessModelId
			changed = true
		}
		if (changed) {
			this.saveMetadata(meta)
		}
	}

	public getConfig(): {
		libraryJudgeModelId: string
		imageProcessModelId: string
	} {
		const meta = this.loadMetadata()
		return {
			libraryJudgeModelId: meta.libraryJudgeModelId || this.libraryJudgeModelId,
			imageProcessModelId: meta.imageProcessModelId || this.imageProcessModelId,
		}
	}

	private loadMetadata(): LibraryMetadata {
		try {
			if (fs.existsSync(this.metaFilePath)) {
				const content = fs.readFileSync(this.metaFilePath, "utf-8")
				const parsed = JSON.parse(content)
				return {
					favorites: parsed.favorites || {},
					tags: parsed.tags || {},
					sagSyncMap: parsed.sagSyncMap || {},
					imageDescriptions: parsed.imageDescriptions || {},
					libraryJudgeModelId:
						parsed.libraryJudgeModelId || this.libraryJudgeModelId,
					imageProcessModelId:
						parsed.imageProcessModelId || this.imageProcessModelId,
				}
			}
		} catch {
			// ignore corruption
		}
		return {
			favorites: {},
			tags: {},
			sagSyncMap: {},
			imageDescriptions: {},
			libraryJudgeModelId: this.libraryJudgeModelId,
			imageProcessModelId: this.imageProcessModelId,
		}
	}

	private saveMetadata(meta: LibraryMetadata): void {
		try {
			fs.writeFileSync(
				this.metaFilePath,
				JSON.stringify(meta, null, 2),
				"utf-8",
			)
		} catch (e) {
			console.warn("[LibraryService] Failed to save metadata:", e)
		}
	}

	public getLibraryPath(): string {
		return this.rootDir
	}

	private getItemType(fullPath: string, isDir: boolean): LibraryItemType {
		if (isDir) return "folder"
		const ext = path.extname(fullPath).toLowerCase()
		if (IMAGE_EXTENSIONS.has(ext)) return "image"
		return "document"
	}

	public getImageDataUrl(filePath: string): string | undefined {
		try {
			const stat = fs.statSync(filePath)
			// Limit preview data url generation to images under 4MB
			if (stat.size > 4 * 1024 * 1024) return undefined
			const ext = path.extname(filePath).toLowerCase().replace(".", "")
			const mime =
				ext === "svg"
					? "image/svg+xml"
					: `image/${ext === "jpg" ? "jpeg" : ext}`
			const data = fs.readFileSync(filePath).toString("base64")
			return `data:${mime};base64,${data}`
		} catch {
			return undefined
		}
	}

	public listItems(subFolder = ""): LibraryItem[] {
		const targetDir = path.resolve(this.rootDir, subFolder)
		if (!targetDir.startsWith(this.rootDir) || !fs.existsSync(targetDir)) {
			return []
		}

		const meta = this.loadMetadata()
		const entries = fs.readdirSync(targetDir, { withFileTypes: true })
		const items: LibraryItem[] = []

		for (const entry of entries) {
			if (entry.name.startsWith(".")) continue

			const fullPath = path.join(targetDir, entry.name)
			const relPath = path.relative(this.rootDir, fullPath)
			const isDir = entry.isDirectory()
			const itemType = this.getItemType(fullPath, isDir)

			let sizeBytes = 0
			let createdAt = new Date().toISOString()
			let updatedAt = new Date().toISOString()
			let itemCount: number | undefined

			try {
				const stat = fs.statSync(fullPath)
				sizeBytes = stat.size
				createdAt = stat.birthtime.toISOString()
				updatedAt = stat.mtime.toISOString()
			} catch {
				// ignore
			}

			if (isDir) {
				try {
					const children = fs.readdirSync(fullPath)
					itemCount = children.filter((c) => !c.startsWith(".")).length
				} catch {
					itemCount = 0
				}
			}

			let previewUrl: string | undefined
			if (itemType === "image") {
				previewUrl = this.getImageDataUrl(fullPath)
			}

			const sagInfo = meta.sagSyncMap[relPath]
			const hasOcr =
				itemType === "image"
					? Boolean(
							meta.imageDescriptions?.[relPath]?.ocrText ||
							meta.imageDescriptions?.[relPath]?.summary,
						)
					: undefined

			items.push({
				id: relPath,
				name: entry.name,
				type: itemType,
				path: fullPath,
				relativePath: relPath,
				sizeBytes,
				createdAt,
				updatedAt,
				previewUrl,
				isFavorite: Boolean(meta.favorites[relPath]),
				tags: meta.tags[relPath] || [],
				itemCount,
				sagDocumentId: sagInfo?.documentId,
				hasOcr,
			})
		}

		// Sort: folders first, then by updatedAt descending
		return items.sort((a, b) => {
			if (a.type === "folder" && b.type !== "folder") return -1
			if (a.type !== "folder" && b.type === "folder") return 1
			return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
		})
	}

	public createFolder(folderName: string, parentFolder = ""): LibraryItem {
		const sanitized = folderName.replace(/[<>:"/\\|?*]/g, "_").trim()
		if (!sanitized) throw new Error("Invalid folder name")

		const targetDir = path.resolve(this.rootDir, parentFolder, sanitized)
		if (!targetDir.startsWith(this.rootDir)) {
			throw new Error("Invalid destination path")
		}

		if (!fs.existsSync(targetDir)) {
			fs.mkdirSync(targetDir, { recursive: true })
		}

		const relPath = path.relative(this.rootDir, targetDir)
		const stat = fs.statSync(targetDir)

		return {
			id: relPath,
			name: sanitized,
			type: "folder",
			path: targetDir,
			relativePath: relPath,
			sizeBytes: 0,
			createdAt: stat.birthtime.toISOString(),
			updatedAt: stat.mtime.toISOString(),
			itemCount: 0,
			isFavorite: false,
		}
	}

	public async addFile(
		filename: string,
		bufferOrPath: Buffer | string,
		parentFolder = "",
	): Promise<LibraryItem> {
		const sanitized = path
			.basename(filename)
			.replace(/[<>:"/\\|?*]/g, "_")
			.trim()
		const targetDir = path.resolve(this.rootDir, parentFolder)
		if (!targetDir.startsWith(this.rootDir)) {
			throw new Error("Invalid destination directory")
		}
		this.ensureDirectory(targetDir)

		const targetFile = path.join(targetDir, sanitized)

		if (typeof bufferOrPath === "string") {
			// It is an existing file path, copy it
			fs.copyFileSync(bufferOrPath, targetFile)
		} else {
			fs.writeFileSync(targetFile, bufferOrPath)
		}

		const relPath = path.relative(this.rootDir, targetFile)
		const stat = fs.statSync(targetFile)
		const itemType = this.getItemType(targetFile, false)

		const item: LibraryItem = {
			id: relPath,
			name: sanitized,
			type: itemType,
			path: targetFile,
			relativePath: relPath,
			sizeBytes: stat.size,
			createdAt: stat.birthtime.toISOString(),
			updatedAt: stat.mtime.toISOString(),
			previewUrl:
				itemType === "image" ? this.getImageDataUrl(targetFile) : undefined,
			isFavorite: false,
		}

		// Asynchronously attempt to sync to SAG if connected
		void this.syncToSag(item).catch(() => {})

		// Asynchronously analyze image if it is an image and model is available
		if (itemType === "image") {
			void this.analyzeImage(targetFile).catch(() => {})
		}

		return item
	}

	public async importPaths(
		sourcePaths: string[],
		parentFolder = "",
	): Promise<LibraryItem[]> {
		const results: LibraryItem[] = []
		for (const src of sourcePaths) {
			if (!fs.existsSync(src)) continue
			const stat = fs.statSync(src)
			const baseName = path.basename(src)
			if (stat.isDirectory()) {
				// Copy folder recursively
				const newFolder = this.createFolder(baseName, parentFolder)
				results.push(newFolder)
				const subEntries = fs.readdirSync(src)
				const childPaths = subEntries.map((c) => path.join(src, c))
				await this.importPaths(childPaths, newFolder.relativePath)
			} else {
				const item = await this.addFile(baseName, src, parentFolder)
				results.push(item)
			}
		}
		return results
	}

	public async deleteItem(itemId: string): Promise<boolean> {
		const targetPath = path.resolve(this.rootDir, itemId)
		if (!targetPath.startsWith(this.rootDir) || targetPath === this.rootDir) {
			return false
		}
		if (!fs.existsSync(targetPath)) return false

		const stat = fs.statSync(targetPath)
		const isDir = stat.isDirectory()
		if (isDir) {
			fs.rmSync(targetPath, { recursive: true, force: true })
		} else {
			fs.unlinkSync(targetPath)
		}

		const meta = this.loadMetadata()
		const prefix = itemId.endsWith("/") ? itemId : `${itemId}/`
		const prefixWin = itemId.endsWith("\\") ? itemId : `${itemId}\\`
		const matchesTarget = (key: string) =>
			key === itemId ||
			(isDir && (key.startsWith(prefix) || key.startsWith(prefixWin)))

		// Delete from remote SAG service if synced
		if (this.sagClient) {
			const sagEntriesToDelete = Object.entries(meta.sagSyncMap).filter(([k]) =>
				matchesTarget(k),
			)
			for (const [, entry] of sagEntriesToDelete) {
				if (entry.documentId) {
					const sourceId = entry.sourceId || "my-agent-library"
					void this.sagClient
						.deleteDocument(sourceId, entry.documentId, {
							idempotencyKey: `del-${entry.documentId}-${Date.now()}`,
						})
						.catch(() => {})
				}
			}
		}

		// Delete all matching metadata & index entries
		for (const key of Object.keys(meta.favorites)) {
			if (matchesTarget(key)) delete meta.favorites[key]
		}
		for (const key of Object.keys(meta.tags)) {
			if (matchesTarget(key)) delete meta.tags[key]
		}
		for (const key of Object.keys(meta.sagSyncMap)) {
			if (matchesTarget(key)) delete meta.sagSyncMap[key]
		}
		if (meta.imageDescriptions) {
			for (const key of Object.keys(meta.imageDescriptions)) {
				if (matchesTarget(key)) delete meta.imageDescriptions[key]
			}
		}

		this.saveMetadata(meta)

		return true
	}

	public cleanUpOrphanedMetadata(): void {
		const meta = this.loadMetadata()
		let changed = false
		const checkExists = (relPath: string) => {
			const full = path.resolve(this.rootDir, relPath)
			return fs.existsSync(full)
		}

		for (const key of Object.keys(meta.favorites)) {
			if (!checkExists(key)) {
				delete meta.favorites[key]
				changed = true
			}
		}
		for (const key of Object.keys(meta.tags)) {
			if (!checkExists(key)) {
				delete meta.tags[key]
				changed = true
			}
		}
		for (const key of Object.keys(meta.sagSyncMap)) {
			if (!checkExists(key)) {
				delete meta.sagSyncMap[key]
				changed = true
			}
		}
		if (meta.imageDescriptions) {
			for (const key of Object.keys(meta.imageDescriptions)) {
				if (!checkExists(key)) {
					delete meta.imageDescriptions[key]
					changed = true
				}
			}
		}

		if (changed) {
			this.saveMetadata(meta)
		}
	}

	public toggleFavorite(itemId: string): boolean {
		const meta = this.loadMetadata()
		const current = Boolean(meta.favorites[itemId])
		meta.favorites[itemId] = !current
		this.saveMetadata(meta)
		return !current
	}

	public async getItemContent(
		itemId: string,
	): Promise<LibraryItemContent | null> {
		let fullPath = path.resolve(this.rootDir, itemId)
		if (!fullPath.startsWith(this.rootDir) || !fs.existsSync(fullPath)) {
			// Fallback: search recursively for the file by basename in this.rootDir
			const targetBaseName = path.basename(itemId).trim()
			const findFileRecursively = (dir: string): string | null => {
				try {
					const entries = fs.readdirSync(dir, { withFileTypes: true })
					for (const entry of entries) {
						const cur = path.join(dir, entry.name)
						if (entry.isDirectory()) {
							const found = findFileRecursively(cur)
							if (found) return found
						} else if (
							entry.name === targetBaseName ||
							entry.name.toLowerCase() === targetBaseName.toLowerCase()
						) {
							return cur
						}
					}
				} catch {}
				return null
			}
			const found = findFileRecursively(this.rootDir)
			if (found) {
				fullPath = found
			} else {
				return null
			}
		}
		const stat = fs.statSync(fullPath)
		if (stat.isDirectory()) {
			return null
		}
		const relPath = path.relative(this.rootDir, fullPath)
		const ext = path.extname(fullPath).toLowerCase()
		const isImage = IMAGE_EXTENSIONS.has(ext)
		const isMarkdown = MARKDOWN_EXTENSIONS.has(ext)
		const isPdf = ext === ".pdf"
		const isHtml = ext === ".html" || ext === ".htm"
		const isSpreadsheet = [".xlsx", ".xlsm", ".xltx", ".csv", ".tsv"].includes(
			ext,
		)
		const isPresentation = [".pptx", ".ppsx", ".potx", ".ppt"].includes(ext)
		const isWord = [".docx", ".docm", ".dotx", ".doc", ".dot"].includes(ext)

		const extractedText = extractDocumentText(fullPath)
		const isText =
			isMarkdown ||
			isWord ||
			isSpreadsheet ||
			isPresentation ||
			isHtml ||
			Boolean(extractedText && extractedText.length > 0)
		const meta = this.loadMetadata()
		const itemType = this.getItemType(fullPath, false)

		const item: LibraryItem = {
			id: relPath,
			name: path.basename(fullPath),
			type: itemType,
			path: fullPath,
			relativePath: relPath,
			sizeBytes: stat.size,
			createdAt: stat.birthtime.toISOString(),
			updatedAt: stat.mtime.toISOString(),
			previewUrl: isImage ? this.getImageDataUrl(fullPath) : undefined,
			isFavorite: Boolean(meta.favorites[relPath]),
			tags: meta.tags[relPath] || [],
			hasOcr: isImage
				? Boolean(
						meta.imageDescriptions?.[relPath]?.ocrText ||
						meta.imageDescriptions?.[relPath]?.summary,
					)
				: undefined,
		}

		const textContent: string | undefined = isText ? extractedText : undefined

		const analysis = isImage ? meta.imageDescriptions?.[relPath] || null : null
		const imageDataUrl = isImage ? this.getImageDataUrl(fullPath) : undefined

		let pdfDataUrl: string | undefined
		if (isPdf) {
			try {
				if (stat.size <= 50 * 1024 * 1024) {
					const buf = fs.readFileSync(fullPath)
					pdfDataUrl = `data:application/pdf;base64,${buf.toString("base64")}`
				}
			} catch (e) {
				console.warn("[LibraryService] Failed to read PDF data url:", e)
			}
		}

		let htmlContent: string | undefined
		if (isHtml) {
			try {
				if (stat.size <= 10 * 1024 * 1024) {
					htmlContent = fs.readFileSync(fullPath, "utf-8")
				}
			} catch (e) {
				console.warn("[LibraryService] Failed to read HTML content:", e)
			}
		}

		let spreadsheetData: LibraryItemSheet[] | undefined
		if (isSpreadsheet) {
			try {
				if (ext === ".csv" || ext === ".tsv") {
					const delim = ext === ".tsv" ? "\t" : ","
					const raw = fs.readFileSync(fullPath, "utf-8")
					spreadsheetData = [
						{
							name: path.basename(fullPath),
							rows: parseDelimitedText(raw, delim),
						},
					]
				} else if (ext === ".xlsx" || ext === ".xlsm" || ext === ".xltx") {
					const buf = fs.readFileSync(fullPath)
					const entries = extractOfficeArchiveEntries(buf, ext)
					spreadsheetData = parseXlsxSheets(entries)
				}
			} catch (e) {
				console.warn("[LibraryService] Failed to parse spreadsheet data:", e)
			}
		}

		let presentationData: LibraryItemSlide[] | undefined
		if (isPresentation) {
			try {
				if (ext === ".pptx" || ext === ".ppsx" || ext === ".potx") {
					const buf = fs.readFileSync(fullPath)
					const entries = extractOfficeArchiveEntries(buf, ext)
					presentationData = parsePptxSlides(entries)
				}
			} catch (e) {
				console.warn("[LibraryService] Failed to parse presentation data:", e)
			}
		}

		return {
			item,
			extension: ext.replace(".", ""),
			isImage,
			isMarkdown,
			isText,
			isPdf,
			isHtml,
			isSpreadsheet,
			isPresentation,
			isWord,
			textContent,
			analysis,
			imageDataUrl,
			pdfDataUrl,
			htmlContent,
			spreadsheetData,
			presentationData,
		}
	}

	private async syncToSag(item: LibraryItem): Promise<void> {
		if (item.type === "folder") return
		const isConnected = await this.checkSagConnection()
		if (!isConnected || !this.sagClient) return

		try {
			// Attempt to upload/ingest document to default personal SAG source
			const sources = await this.sagClient.listSources().catch(() => [])
			let sourceId = sources[0]?.id
			if (!sourceId) {
				const created = await this.sagClient.createSource(
					{
						name: "my-agent-library",
						description: "My Agent Personal Library",
					},
					{ idempotencyKey: `init-${Date.now()}` },
				)
				sourceId = created.id
			}

			if (sourceId) {
				const uploadRes = await this.sagClient.uploadDocument(
					sourceId,
					item.path,
					{
						idempotencyKey: `upload-${item.relativePath}-${Date.now()}`,
					},
				)
				const docId = uploadRes.document_id || uploadRes.id
				if (docId) {
					const meta = this.loadMetadata()
					meta.sagSyncMap[item.relativePath] = {
						documentId: docId,
						syncedAt: new Date().toISOString(),
						sourceId,
					}
					this.saveMetadata(meta)
				}
			}
		} catch (e) {
			console.warn("[LibraryService] SAG sync skipped or failed:", e)
		}
	}

	/**
	 * Analyze an image using the vision model (default: deepseek/deepseek-flash).
	 * Extracts OCR text, summary, and keyword tags, saving them into metadata.
	 */
	public async analyzeImage(
		filePath: string,
		customResolver?: (modelId: string) => any,
		customModelId?: string,
	): Promise<ImageAnalysisData | null> {
		const resolver = customResolver || this.resolveModelFn
		if (!resolver) {
			return null
		}
		const modelId =
			customModelId || this.imageProcessModelId || "deepseek/deepseek-flash"

		try {
			const model = resolver(modelId)
			if (!model) return null

			const buffer = fs.readFileSync(filePath)
			const ext = path.extname(filePath).toLowerCase().replace(".", "")
			const mime =
				ext === "svg"
					? "image/svg+xml"
					: `image/${ext === "jpg" ? "jpeg" : ext}`

			const prompt = `Analyze this image in detail:
1. Extract all visible text (OCR) accurately, including code, architecture diagrams, charts, labels, headings, and explanations.
2. Provide a 1-3 sentence summary of what this image describes.
3. List 3-8 relevant keyword tags.

Output in JSON format only:
{
  "ocrText": "...",
  "summary": "...",
  "tags": ["tag1", "tag2"]
}`

			const { text } = await generateText({
				model,
				messages: [
					{
						role: "user",
						content: [
							{ type: "text", text: prompt },
							{ type: "image", image: buffer, mediaType: mime },
						],
					},
				],
			})

			let ocrText = ""
			let summary = ""
			let tags: string[] = []

			try {
				const jsonMatch = text.match(/\{[\s\S]*\}/)
				if (jsonMatch) {
					const parsed = JSON.parse(jsonMatch[0])
					ocrText = parsed.ocrText || ""
					summary = parsed.summary || ""
					tags = Array.isArray(parsed.tags) ? parsed.tags : []
				} else {
					ocrText = text.slice(0, 1000)
					summary = text.slice(0, 200)
				}
			} catch {
				ocrText = text.slice(0, 1000)
				summary = text.slice(0, 200)
			}

			const relPath = path.relative(this.rootDir, filePath)
			const analysisData: ImageAnalysisData = {
				ocrText,
				summary,
				tags,
				analyzedAt: new Date().toISOString(),
				modelUsed: modelId,
			}

			const meta = this.loadMetadata()
			if (!meta.imageDescriptions) meta.imageDescriptions = {}
			meta.imageDescriptions[relPath] = analysisData
			this.saveMetadata(meta)

			return analysisData
		} catch (err) {
			console.warn(`[LibraryService] Failed to analyze image ${filePath}:`, err)
			return null
		}
	}

	public async batchIndexImages(
		customResolver?: (modelId: string) => any,
		customModelId?: string,
	): Promise<{ total: number; processed: number; errors: number }> {
		const allItems = this.collectAllFiles(this.rootDir)
		const imageItems = allItems.filter((i) => i.type === "image")
		const meta = this.loadMetadata()
		let processed = 0
		let errors = 0

		for (const img of imageItems) {
			if (meta.imageDescriptions?.[img.relativePath]) {
				continue
			}
			const result = await this.analyzeImage(
				img.path,
				customResolver,
				customModelId,
			)
			if (result) {
				processed++
			} else {
				errors++
			}
		}

		return {
			total: imageItems.length,
			processed,
			errors,
		}
	}

	public getImageIndexStatus(): { totalImages: number; indexedImages: number } {
		const allItems = this.collectAllFiles(this.rootDir)
		const imageItems = allItems.filter((i) => i.type === "image")
		const meta = this.loadMetadata()
		const indexedCount = imageItems.filter((i) =>
			Boolean(meta.imageDescriptions?.[i.relativePath]),
		).length

		return {
			totalImages: imageItems.length,
			indexedImages: indexedCount,
		}
	}

	/**
	 * Use the configured judge model (default: deepseek/deepseek-flash) to evaluate candidate relevance
	 */
	public async evaluateCandidateRelevance(
		query: string,
		candidates: Array<{
			id: string
			name: string
			snippet: string
			score: number
		}>,
	): Promise<
		Array<{ id: string; name: string; snippet: string; score: number }>
	> {
		if (candidates.length <= 1 || !this.resolveModelFn) {
			return candidates
		}

		try {
			const model = this.resolveModelFn(this.libraryJudgeModelId)
			if (!model) return candidates

			const prompt = `You are a relevance evaluation assistant.
User query: "${query}"

Here are retrieved document/image snippets from the user's library:
${candidates.map((c, i) => `[Item ${i + 1} - ${c.name}]:\n${c.snippet}`).join("\n\n")}

Score each item's relevance to the user query on a scale of 0 to 100.
Return JSON format: [{"index": 1, "score": 85, "reason": "..."}, ...]`

			const { text } = await generateText({
				model,
				prompt,
			})

			const match = text.match(/\[[\s\S]*\]/)
			if (match) {
				const scores: Array<{ index: number; score: number }> = JSON.parse(
					match[0],
				)
				for (const s of scores) {
					const idx = s.index - 1
					if (candidates[idx] && typeof s.score === "number") {
						candidates[idx].score = s.score
					}
				}
				candidates.sort((a, b) => b.score - a.score)
			}
		} catch (e) {
			console.warn("[LibraryService] LLM relevance evaluation skipped:", e)
		}

		return candidates
	}

	/**
	 * Search library with strict token budgeting to preserve agent context.
	 * Max 800 tokens hard budget, Top 3-5 snippets, max 300 chars per snippet.
	 */
	public async search(
		options: LibrarySearchOptions,
	): Promise<LibrarySearchResult> {
		const { query, category = "all", limit = 3, maxTokens = 800 } = options
		const cleanQuery = (query || "").trim().toLowerCase()
		if (!cleanQuery) {
			return { query, totalMatches: 0, tokenCount: 0, items: [] }
		}

		const effectiveLimit = Math.min(Math.max(1, limit), 50)
		const candidateItems: Array<{
			id: string
			name: string
			type: LibraryItemType
			snippet: string
			score: number
			path: string
			previewUrl?: string
			hasOcr?: boolean
		}> = []

		// 1. Try SAG search if connected
		const isConnected = await this.checkSagConnection()
		if (isConnected && this.sagClient) {
			try {
				const sagRes = await this.sagClient.search({
					query: cleanQuery,
					top_k: effectiveLimit,
					save_exploration: false,
				})

				if (sagRes?.sections && sagRes.sections.length > 0) {
					for (const sec of sagRes.sections) {
						candidateItems.push({
							id: sec.chunk_id || sec.heading || "sag-match",
							name: sec.source_name || sec.heading || "SAG Knowledge",
							type: "document",
							snippet: (sec.content || "").slice(0, 300).trim(),
							score: sec.score || 1,
							path: this.rootDir,
						})
					}
				}
			} catch (err) {
				console.warn(
					"[LibraryService] SAG search error, falling back to local:",
					err,
				)
			}
		}

		// 2. Local index & file search
		// Normalize query and extract core keywords / n-grams (handles typos, punctuation & conversational queries like "潜渊将的啥？")
		const normalizedQuery = cleanQuery.replace(/[？?！!，,。.\-_"':：]/g, " ")
		const coreKeywords = normalizedQuery
			.replace(
				/(将的啥|讲的啥|讲了啥|讲什么|说了什么|说了啥|是什么|有啥|有什么|关于什么的|介绍了什么|是什么内容|内容是什么|讲的是什么)/g,
				"",
			)
			.trim()

		const searchTokens = new Set<string>()
		if (cleanQuery) searchTokens.add(cleanQuery)
		if (coreKeywords && coreKeywords !== cleanQuery)
			searchTokens.add(coreKeywords)

		for (const w of (coreKeywords || cleanQuery).split(/\s+/)) {
			if (w.length >= 1) searchTokens.add(w)
			// For CJK text, extract 2-grams and characters
			if (/[\u4e00-\u9fa5]/.test(w)) {
				for (let i = 0; i < w.length; i++) {
					searchTokens.add(w[i])
					if (i < w.length - 1) {
						searchTokens.add(w.slice(i, i + 2))
					}
				}
			}
		}

		const meta = this.loadMetadata()
		const allItems = this.collectAllFiles(this.rootDir)
		for (const item of allItems) {
			if (category === "folder" && item.type !== "folder") continue
			if (category === "image" && item.type !== "image") continue
			if (category === "favorite" && !item.isFavorite) continue

			let score = 0
			let bestMatchIdx = -1
			let contentSnippet = ""

			// Name matches
			const lowerName = item.name.toLowerCase()
			if (
				lowerName.includes(cleanQuery) ||
				(coreKeywords && lowerName.includes(coreKeywords))
			) {
				score += 25
			} else {
				for (const token of searchTokens) {
					if (token.length >= 2 && lowerName.includes(token)) {
						score += 12
					}
				}
			}

			if (item.type === "document") {
				try {
					const text = extractDocumentText(item.path)
					if (text) {
						const lowerText = text.toLowerCase()

						if (lowerText.includes(cleanQuery)) {
							score += 20
							bestMatchIdx = lowerText.indexOf(cleanQuery)
						} else if (coreKeywords && lowerText.includes(coreKeywords)) {
							score += 15
							bestMatchIdx = lowerText.indexOf(coreKeywords)
						} else {
							// Token & character matching (handles typos / homophones like 潜渊 vs 萧沉渊)
							for (const token of searchTokens) {
								if (!token) continue
								const isLongToken = token.length >= 2
								const pos = lowerText.indexOf(token)
								if (pos !== -1) {
									score += isLongToken ? 8 : 3
									if (bestMatchIdx === -1) {
										bestMatchIdx = pos
									}
								}
							}
						}

						if (score > 0) {
							const start = Math.max(
								0,
								(bestMatchIdx >= 0 ? bestMatchIdx : 0) - 40,
							)
							const end = Math.min(text.length, start + 280)
							const rawSnippet = text
								.slice(start, end)
								.replace(/\s+/g, " ")
								.trim()
							if (isMeaningfulText(rawSnippet)) {
								contentSnippet = rawSnippet
							}
						}
					}
				} catch {
					// ignore read errors
				}
			}

			if (item.type === "image") {
				const imgDesc = meta.imageDescriptions?.[item.relativePath]
				if (imgDesc) {
					const lowerOcr = (imgDesc.ocrText || "").toLowerCase()
					const lowerSummary = (imgDesc.summary || "").toLowerCase()
					const lowerTags = (imgDesc.tags || []).join(" ").toLowerCase()

					if (
						lowerOcr.includes(cleanQuery) ||
						lowerSummary.includes(cleanQuery) ||
						lowerTags.includes(cleanQuery)
					) {
						score += 30
						bestMatchIdx = lowerOcr.indexOf(cleanQuery)
					} else if (
						coreKeywords &&
						(lowerOcr.includes(coreKeywords) ||
							lowerSummary.includes(coreKeywords) ||
							lowerTags.includes(coreKeywords))
					) {
						score += 25
						bestMatchIdx = lowerOcr.indexOf(coreKeywords)
					} else {
						for (const token of searchTokens) {
							if (!token) continue
							const isLong = token.length >= 2
							if (
								lowerOcr.includes(token) ||
								lowerSummary.includes(token) ||
								lowerTags.includes(token)
							) {
								score += isLong ? 10 : 4
								if (bestMatchIdx === -1 && lowerOcr.includes(token)) {
									bestMatchIdx = lowerOcr.indexOf(token)
								}
							}
						}
					}

					if (score > 0) {
						const snippetText = imgDesc.summary
							? `[Image Summary] ${imgDesc.summary}\n[Extracted Text] ${imgDesc.ocrText.slice(0, 200)}`
							: `[Image OCR] ${imgDesc.ocrText.slice(0, 280)}`
						contentSnippet = snippetText.replace(/\s+/g, " ").trim()
					}
				}
			}

			if (score > 0) {
				candidateItems.push({
					id: item.relativePath,
					name: item.name,
					type: item.type,
					snippet:
						contentSnippet ||
						(item.type === "image" ? `[Image: ${item.name}]` : ""),
					score,
					path: item.path,
					previewUrl: item.previewUrl,
					hasOcr:
						item.hasOcr !== undefined
							? item.hasOcr
							: item.type === "image"
								? Boolean(
										meta.imageDescriptions?.[item.relativePath]?.ocrText ||
										meta.imageDescriptions?.[item.relativePath]?.summary,
									)
								: undefined,
				})
			}
		}

		// Fallback: If no candidate items matched, provide an overview of existing readable documents
		if (candidateItems.length === 0 && allItems.length > 0) {
			const docItems = allItems.filter((i) => i.type === "document")
			for (const item of docItems.slice(0, effectiveLimit)) {
				try {
					const text = extractDocumentText(item.path)
					if (!text) continue
					const lines = text
						.split("\n")
						.map((l) => l.trim())
						.filter(Boolean)
					const preview = lines.slice(0, 4).join(" ").slice(0, 280)
					if (isMeaningfulText(preview)) {
						candidateItems.push({
							id: item.relativePath,
							name: item.name,
							type: item.type,
							snippet: `[Document Overview: ${item.name}] ${preview}`,
							score: 1,
							path: item.path,
						})
					}
				} catch {}
			}
		}

		// Sort by score descending
		candidateItems.sort((a, b) => b.score - a.score)

		// 3. Strict token budget enforcement
		const finalItems: typeof candidateItems = []
		let accumulatedTokens = this.tokenCounter.estimateTokens(
			`Query: ${cleanQuery}\n`,
		)

		for (const candidate of candidateItems) {
			if (finalItems.length >= effectiveLimit) break

			// Truncate snippet to 300 chars max
			const boundedSnippet = (candidate.snippet || "").slice(0, 300)
			const itemPayload = `[${candidate.type}] ${candidate.name} (${candidate.id}): ${boundedSnippet}\n`
			const snippetTokens = this.tokenCounter.estimateTokens(itemPayload)

			if (
				maxTokens &&
				maxTokens > 0 &&
				accumulatedTokens + snippetTokens > maxTokens
			) {
				break // Stop immediately to strictly preserve context window
			}

			finalItems.push({
				...candidate,
				snippet: boundedSnippet,
			})
			accumulatedTokens += snippetTokens
		}

		return {
			query,
			totalMatches: candidateItems.length,
			tokenCount: accumulatedTokens,
			items: finalItems,
		}
	}

	private collectAllFiles(dir: string): LibraryItem[] {
		const result: LibraryItem[] = []
		const meta = this.loadMetadata()

		const walk = (currentDir: string) => {
			if (!fs.existsSync(currentDir)) return
			const entries = fs.readdirSync(currentDir, { withFileTypes: true })
			for (const entry of entries) {
				if (entry.name.startsWith(".")) continue
				const fullPath = path.join(currentDir, entry.name)
				const relPath = path.relative(this.rootDir, fullPath)
				const isDir = entry.isDirectory()
				const itemType = this.getItemType(fullPath, isDir)

				try {
					const stat = fs.statSync(fullPath)
					result.push({
						id: relPath,
						name: entry.name,
						type: itemType,
						path: fullPath,
						relativePath: relPath,
						sizeBytes: stat.size,
						createdAt: stat.birthtime.toISOString(),
						updatedAt: stat.mtime.toISOString(),
						previewUrl:
							itemType === "image" ? this.getImageDataUrl(fullPath) : undefined,
						isFavorite: Boolean(meta.favorites[relPath]),
						tags: meta.tags[relPath] || [],
						hasOcr:
							itemType === "image"
								? Boolean(
										meta.imageDescriptions?.[relPath]?.ocrText ||
										meta.imageDescriptions?.[relPath]?.summary,
									)
								: undefined,
					})
				} catch {
					// ignore
				}

				if (isDir) {
					walk(fullPath)
				}
			}
		}

		walk(dir)
		return result
	}
}

let defaultServiceInstance: LibraryService | null = null

export function getLibraryService(): LibraryService {
	if (!defaultServiceInstance) {
		defaultServiceInstance = new LibraryService()
	}
	return defaultServiceInstance
}
