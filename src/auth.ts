import { base64UrlToBytes, bytesToBase64Url, hmacSign, timingSafeEqualBytes, timingSafeEqualString } from './crypto';
import { countUserTokens, findUserByUploadToken, getUserById, type SessionUser, type UserRow } from './users';
import { jsonError, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from './util';

type SessionPayload = {
	v: 2;
	uid: string;
	role: SessionUser['role'];
	exp: number;
	iat: number;
};

export function bearerToken(request: Request): string {
	const header = request.headers.get('authorization') ?? '';
	const match = /^Bearer\s+(\S+)$/i.exec(header);
	return match?.[1] ?? '';
}

export type UploadActor = { kind: 'user'; user: UserRow } | { kind: 'legacy' };

export async function resolveUploadActor(request: Request, env: Env): Promise<UploadActor | Response> {
	const provided = bearerToken(request);
	const user = await findUserByUploadToken(env, provided);
	if (user) {
		return { kind: 'user', user };
	}

	const tokenCount = await countUserTokens(env);
	if (tokenCount === 0 && env.UPLOAD_TOKEN) {
		if (await timingSafeEqualString(provided, env.UPLOAD_TOKEN)) {
			return { kind: 'legacy' };
		}
	}

	return jsonError(401, 'unauthorized');
}

function cookieValue(request: Request, name: string): string | null {
	const header = request.headers.get('cookie');
	if (!header) {
		return null;
	}
	for (const part of header.split(';')) {
		const trimmed = part.trim();
		const eq = trimmed.indexOf('=');
		if (eq === -1) {
			continue;
		}
		if (trimmed.slice(0, eq) === name) {
			return trimmed.slice(eq + 1);
		}
	}
	return null;
}

export async function createSessionCookie(env: Env, requestUrl: URL, user: SessionUser): Promise<string> {
	const secret = env.SITE_ACCESS_SECRET;
	if (!secret) {
		throw new Error('SITE_ACCESS_SECRET is not configured');
	}
	const now = Math.floor(Date.now() / 1000);
	const payload: SessionPayload = { v: 2, uid: user.id, role: user.role, iat: now, exp: now + SESSION_MAX_AGE_SECONDS };
	const body = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
	const signature = bytesToBase64Url(await hmacSign(secret, body));
	const token = `${body}.${signature}`;
	const secure = requestUrl.protocol === 'https:' ? '; Secure' : '';
	return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}${secure}`;
}

export function clearSessionCookie(requestUrl: URL): string {
	const secure = requestUrl.protocol === 'https:' ? '; Secure' : '';
	return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export async function getSession(request: Request, env: Env): Promise<SessionUser | null> {
	const secret = env.SITE_ACCESS_SECRET;
	if (!secret) {
		return null;
	}
	const raw = cookieValue(request, SESSION_COOKIE);
	if (!raw) {
		return null;
	}
	const dot = raw.lastIndexOf('.');
	if (dot <= 0) {
		return null;
	}
	const body = raw.slice(0, dot);
	const providedSig = base64UrlToBytes(raw.slice(dot + 1));
	if (!providedSig) {
		return null;
	}
	const expectedSig = new Uint8Array(await hmacSign(secret, body));
	if (!(await timingSafeEqualBytes(providedSig, expectedSig))) {
		return null;
	}
	const payloadBytes = base64UrlToBytes(body);
	if (!payloadBytes) {
		return null;
	}
	try {
		const payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as SessionPayload;
		if (payload.v !== 2 || typeof payload.uid !== 'string' || typeof payload.exp !== 'number') {
			return null;
		}
		if (payload.exp <= Math.floor(Date.now() / 1000)) {
			return null;
		}
		const user = await getUserById(env, payload.uid);
		if (!user) {
			return null;
		}
		return { id: user.id, username: user.username, role: user.role };
	} catch {
		return null;
	}
}

export function unauthorized(request: Request, loginUrl: string): Response {
	const pathname = new URL(request.url).pathname;
	if (pathname.startsWith('/api/')) {
		return jsonError(401, 'unauthorized');
	}
	const next = encodeURIComponent(`${pathname}${new URL(request.url).search}`);
	return Response.redirect(`${loginUrl}?next=${next}`, 302);
}

export function toSessionUser(user: UserRow): SessionUser {
	return { id: user.id, username: user.username, role: user.role };
}
