interface Env {
	SITE_ACCESS_SECRET: string;
	UPLOAD_TOKEN?: string;
	SITE_PASSWORD?: string;
}

declare module '*.svg' {
	const source: string;
	export default source;
}

declare module '*.ico' {
	const data: ArrayBuffer;
	export default data;
}

declare module '*.png' {
	const data: ArrayBuffer;
	export default data;
}
