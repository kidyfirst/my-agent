export type LibraryItemType = "image" | "document" | "folder"

export interface LibraryItem {
	id: string
	name: string
	type: LibraryItemType
	path: string
	relativePath: string
	sizeBytes: number
	createdAt: string
	updatedAt: string
	previewUrl?: string
	isFavorite?: boolean
	tags?: string[]
	itemCount?: number
	sagDocumentId?: string
	hasOcr?: boolean
}

export interface LibrarySearchOptions {
	query: string
	category?: "all" | "recommended" | "favorite" | "folder" | "image"
	limit?: number
	maxTokens?: number
}

export interface LibrarySearchResult {
	query: string
	totalMatches: number
	tokenCount: number
	items: Array<{
		id: string
		name: string
		type: LibraryItemType
		snippet?: string
		score?: number
		path: string
		previewUrl?: string
		hasOcr?: boolean
	}>
}

export interface ImageAnalysisData {
	ocrText: string
	summary: string
	tags: string[]
	analyzedAt: string
	modelUsed: string
}

export interface LibraryItemSheet {
	name: string
	rows: string[][]
}

export interface LibraryItemSlide {
	index: number
	title?: string
	content: string
}

export interface LibraryItemContent {
	item: LibraryItem
	extension: string
	isImage: boolean
	isMarkdown: boolean
	isText: boolean
	isPdf?: boolean
	isHtml?: boolean
	isSpreadsheet?: boolean
	isPresentation?: boolean
	isWord?: boolean
	textContent?: string
	analysis?: ImageAnalysisData | null
	imageDataUrl?: string
	pdfDataUrl?: string
	htmlContent?: string
	spreadsheetData?: LibraryItemSheet[]
	presentationData?: LibraryItemSlide[]
}

export interface LibraryMetadata {
	favorites: Record<string, boolean>
	tags: Record<string, string[]>
	sagSyncMap: Record<
		string,
		{ documentId: string; syncedAt: string; sourceId?: string }
	>
	imageDescriptions?: Record<string, ImageAnalysisData>
	libraryJudgeModelId?: string
	imageProcessModelId?: string
}
