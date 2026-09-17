import { base64UrlToBytes, bytesToBase64Url, timingSafeEqualBytes } from './crypto';

const encoder = new TextEncoder();
export const PBKDF2_ITERATIONS = 100_000;

async function deriveBits(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
	const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
	const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, key, 256);
	return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const hash = await deriveBits(password, salt, PBKDF2_ITERATIONS);
	return `pbkdf2$sha256$${PBKDF2_ITERATIONS}$${bytesToBase64Url(salt)}$${bytesToBase64Url(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
	const parts = stored.split('$');
	if (parts.length !== 5 || parts[0] !== 'pbkdf2' || parts[1] !== 'sha256') {
		await hashPassword(password);
		return false;
	}
	const iterations = Number(parts[2]);
	const salt = base64UrlToBytes(parts[3] ?? '');
	const expected = base64UrlToBytes(parts[4] ?? '');
	if (!salt || !expected || !Number.isFinite(iterations) || iterations < 1 || iterations > 1_000_000) {
		await hashPassword(password);
		return false;
	}
	const actual = await deriveBits(password, salt, iterations);
	return timingSafeEqualBytes(actual, expected);
}
