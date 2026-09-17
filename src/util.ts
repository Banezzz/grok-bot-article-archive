export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
export const SESSION_COOKIE = 'archive_session';

export class HttpError extends Error {
	readonly status: number;
	readonly expose: boolean;

	constructor(status: number, message: string, expose = true) {
		super(message);
		this.name = 'HttpError';
		this.status = status;
		this.expose = expose;
	}
}

export function json(data: unknown, status = 200, headers?: HeadersInit): Response {
	const extra = new Headers(headers);
	if (!extra.has('content-type')) {
		extra.set('content-type', 'application/json; charset=utf-8');
	}
	extra.set('cache-control', 'private, no-store');
	return new Response(JSON.stringify(data), { status, headers: extra });
}

export function jsonError(status: number, message: string): Response {
	return json({ ok: false, error: message }, status);
}

export function escapeHtml(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function safeHttpUrl(value: string): string | null {
	try {
		const url = new URL(value);
		if (url.protocol === 'http:' || url.protocol === 'https:') {
			return url.toString();
		}
		return null;
	} catch {
		return null;
	}
}

export function safeNextPath(value: string | null): string {
	if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
		return '/';
	}
	return value;
}

export function likePattern(query: string): string {
	return `%${query.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;
}

export function isApiPath(pathname: string): boolean {
	return pathname === '/health' || pathname.startsWith('/api/');
}

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,126}[a-z0-9])?$/;

export function isValidSlug(slug: string): boolean {
	return SLUG_RE.test(slug);
}


export function htmlAttachmentDisposition(slug: string): string {
	const filename = `${slug}.html`;
	const encoded = encodeURIComponent(filename).replace(/'/g, '%27');
	return `attachment; filename="${filename}"; filename*=UTF-8''${encoded}`;
}

export function slugifyTitle(title: string, now = new Date()): string {
	const date = now.toISOString().slice(0, 10);
	const base = title
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 60);
	return `${base || 'article'}-${date}`;
}

export function randomSuffix(bytes = 3): string {
	const buf = new Uint8Array(bytes);
	crypto.getRandomValues(buf);
	return [...buf].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function readBodyWithLimit(request: Request, maxBytes: number): Promise<string> {
	const declared = Number(request.headers.get('content-length') ?? '');
	if (Number.isFinite(declared) && declared > maxBytes) {
		throw new HttpError(413, `Request body exceeds ${maxBytes} bytes`);
	}

	if (!request.body) {
		return '';
	}

	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;

	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}
			total += value.byteLength;
			if (total > maxBytes) {
				throw new HttpError(413, `Request body exceeds ${maxBytes} bytes`);
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}

	const merged = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		merged.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return new TextDecoder().decode(merged);
}

export function formatDisplayDate(iso: string | null | undefined): string {
	if (!iso) {
		return '';
	}
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) {
		return iso;
	}
	return new Intl.DateTimeFormat('en', { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
}
