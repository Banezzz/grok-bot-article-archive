import { HttpError, safeHttpUrl } from './util';

export const MAX_THUMB_BYTES = 2 * 1024 * 1024;

const MIME_EXT: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/jpg': 'jpg',
	'image/png': 'png',
	'image/gif': 'gif',
	'image/webp': 'webp',
	'image/avif': 'avif',
};

export type StoredThumbnail = {
	key: string;
	contentType: string;
};

function extensionFor(contentType: string, fallback = 'jpg'): string {
	return MIME_EXT[contentType] ?? fallback;
}

function sniffContentType(bytes: Uint8Array, hinted?: string | null): string {
	if (hinted && MIME_EXT[hinted.split(';', 1)[0] ?? '']) {
		return hinted.split(';', 1)[0] ?? 'image/jpeg';
	}
	if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
		return 'image/jpeg';
	}
	if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
		return 'image/png';
	}
	if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
		return 'image/gif';
	}
	if (bytes.length >= 12 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
		return 'image/webp';
	}
	return 'image/jpeg';
}

function decodeBase64(value: string): Uint8Array {
	const binary = atob(value);
	const out = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		out[i] = binary.charCodeAt(i);
	}
	return out;
}

export function parseImageDataUri(value: string): { contentType: string; bytes: Uint8Array } | null {
	const match = /^data:(image\/[a-zA-Z0-9.+-]+)(;charset=[^;,]+)?;base64,([A-Za-z0-9+/=\s]+)$/.exec(value.trim());
	if (!match?.[1] || !match[3]) {
		return null;
	}
	try {
		const bytes = decodeBase64(match[3].replace(/\s+/g, ''));
		if (bytes.byteLength === 0 || bytes.byteLength > MAX_THUMB_BYTES) {
			return null;
		}
		return { contentType: sniffContentType(bytes, match[1]), bytes };
	} catch {
		return null;
	}
}

function firstImgSrc(html: string): string | null {
	const window = html.slice(0, 512 * 1024);
	const match = /<img\b[^>]*\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i.exec(window);
	const src = match?.[1] ?? match?.[2] ?? match?.[3];
	return src?.trim() || null;
}

function resolveImgSrc(src: string, sourceUrl: string): string | null {
	if (src.startsWith('data:image/')) {
		return src;
	}
	const absolute = safeHttpUrl(src);
	if (absolute) {
		return absolute;
	}
	try {
		return safeHttpUrl(new URL(src, sourceUrl).toString());
	} catch {
		return null;
	}
}

async function bytesFromRemoteUrl(url: string): Promise<{ contentType: string; bytes: Uint8Array } | null> {
	let response: Response;
	try {
		response = await fetch(url, {
			redirect: 'follow',
			signal: AbortSignal.timeout(10_000),
			headers: { accept: 'image/*,*/*;q=0.8' },
		});
	} catch {
		return null;
	}
	if (!response.ok) {
		return null;
	}
	const hinted = response.headers.get('content-type')?.split(';', 1)[0] ?? null;
	const buffer = await response.arrayBuffer();
	if (buffer.byteLength === 0 || buffer.byteLength > MAX_THUMB_BYTES) {
		return null;
	}
	const bytes = new Uint8Array(buffer);
	const contentType = sniffContentType(bytes, hinted);
	if (!MIME_EXT[contentType]) {
		return null;
	}
	return { contentType, bytes };
}

function imageFromBase64Field(value: string): { contentType: string; bytes: Uint8Array } | null {
	const asData = parseImageDataUri(value);
	if (asData) {
		return asData;
	}
	try {
		const bytes = decodeBase64(value.replace(/\s+/g, ''));
		if (bytes.byteLength === 0 || bytes.byteLength > MAX_THUMB_BYTES) {
			return null;
		}
		return { contentType: sniffContentType(bytes), bytes };
	} catch {
		return null;
	}
}

export async function resolveThumbnailSource(input: { thumbnail_url?: string; thumbnail_base64?: string; html: string; source_url: string }): Promise<{ contentType: string; bytes: Uint8Array } | null> {
	if (input.thumbnail_base64) {
		const parsed = imageFromBase64Field(input.thumbnail_base64);
		if (!parsed) {
			throw new HttpError(400, 'thumbnail_base64 is not a valid image');
		}
		return parsed;
	}

	if (input.thumbnail_url) {
		const url = safeHttpUrl(input.thumbnail_url);
		if (!url) {
			throw new HttpError(400, 'thumbnail_url must be http(s)');
		}
		const fetched = await bytesFromRemoteUrl(url);
		if (!fetched) {
			throw new HttpError(400, 'Could not fetch thumbnail_url');
		}
		return fetched;
	}

	const src = firstImgSrc(input.html);
	if (!src) {
		return null;
	}
	const resolved = resolveImgSrc(src, input.source_url);
	if (!resolved) {
		return null;
	}
	if (resolved.startsWith('data:')) {
		return parseImageDataUri(resolved);
	}
	return bytesFromRemoteUrl(resolved);
}

export async function storeThumbnail(env: Env, slug: string, image: { contentType: string; bytes: Uint8Array }, previousKey?: string | null): Promise<StoredThumbnail> {
	const ext = extensionFor(image.contentType);
	const key = `thumbs/${slug}.${ext}`;
	await env.ARTICLES.put(key, image.bytes, {
		httpMetadata: { contentType: image.contentType },
		customMetadata: { slug },
	});
	if (previousKey && previousKey !== key) {
		await env.ARTICLES.delete(previousKey);
	}
	return { key, contentType: image.contentType };
}
