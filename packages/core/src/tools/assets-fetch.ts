import { createTool } from "../core/index.js"
import { z } from "zod/v3"
import { AssetManager } from "../assets/manager.js"

export function createAssetsFetchTool(defaultProjectRoot?: string) {
	return createTool({
		id: "assets_fetch",
		description:
			'Fetch the content of an uploaded asset (image, screenshot, or file) by its assetId. Call this tool whenever you need to view or inspect an image or file attachment referenced in the conversation history (e.g. [Attached Asset: assetId="ast_..."]). For images, returns the image data so you can inspect its visual details; for text files, returns the file contents.',
		inputSchema: z.object({
			assetId: z
				.string()
				.describe(
					"The asset ID to fetch, e.g. ast_9f8e7d6c or filename ast_9f8e7d6c.png",
				),
		}),
		execute: async ({ assetId }, context) => {
			const reqCtx = context?.requestContext
			const harness = (reqCtx?.get?.("harness") ||
				reqCtx?.get?.("controller")) as any
			const state = harness?.state ?? harness?.getState?.()
			const projectRoot =
				state?.projectPath || defaultProjectRoot || process.cwd()

			const asset = await AssetManager.getAsset(assetId, projectRoot)
			if (!asset) {
				return {
					success: false,
					error: `Asset file for ID "${assetId}" was not found on disk. The local file may have been moved or deleted from .myagent/assets.`,
				}
			}

			if (asset.mimeType.startsWith("image/")) {
				return {
					success: true,
					assetId: asset.assetId,
					filename: asset.filename,
					mimeType: asset.mimeType,
					size: asset.size,
					data: `data:${asset.mimeType};base64,${asset.base64}`,
					message: `Image "${asset.filename}" (${asset.mimeType}, ${asset.size} bytes) loaded successfully for visual inspection.`,
				}
			}

			if (asset.text !== undefined) {
				return {
					success: true,
					assetId: asset.assetId,
					filename: asset.filename,
					mimeType: asset.mimeType,
					size: asset.size,
					content: asset.text,
					message: `File "${asset.filename}" loaded successfully.`,
				}
			}

			return {
				success: true,
				assetId: asset.assetId,
				filename: asset.filename,
				mimeType: asset.mimeType,
				size: asset.size,
				base64: asset.base64,
				message: `Binary asset "${asset.filename}" loaded (${asset.size} bytes).`,
			}
		},
	})
}
