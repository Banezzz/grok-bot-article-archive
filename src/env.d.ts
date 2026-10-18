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

// Provided by the nodejs_compat flag; only the synchronous hash used for CSP script hashes is declared.
declare module 'node:crypto' {
	interface Hash {
		update(data: string, encoding: 'utf8'): Hash;
		digest(encoding: 'base64'): string;
	}
	export function createHash(algorithm: 'sha256'): Hash;
}
