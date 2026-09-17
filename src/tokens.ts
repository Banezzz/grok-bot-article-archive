import { bytesToBase64Url, timingSafeEqualString } from './crypto';

const encoder = new TextEncoder();

export async function sha256Hex(value: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function generateUploadToken(): { token: string; prefix: string } {
	const token = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
	return { token, prefix: token.slice(0, 8) };
}

export async function hashUploadToken(token: string): Promise<string> {
	return sha256Hex(token);
}

export async function tokensMatch(provided: string, storedHash: string): Promise<boolean> {
	const providedHash = await hashUploadToken(provided);
	return timingSafeEqualString(providedHash, storedHash);
}
