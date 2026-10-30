/**
 * Static asset module declarations for the renderer.
 *
 * Vite resolves these imports to hashed URLs at build time; TypeScript needs to
 * know they are modules. Only the types used by the app are listed.
 */
declare module "*.png" {
	const src: string
	export default src
}

declare module "*.jpg" {
	const src: string
	export default src
}

declare module "*.svg" {
	const src: string
	export default src
}
