const encoder = new TextEncoder();

/**
 * Constant-time string compare. Both sides are SHA-256 hashed first so
 * `timingSafeEqual` always receives equal-length buffers and length is not leaked.
 */
export async function timingSafeEqualString(left: string, right: string): Promise<boolean> {
	const [leftHash, rightHash] = await Promise.all([crypto.subtle.digest('SHA-256', encoder.encode(left)), crypto.subtle.digest('SHA-256', encoder.encode(right))]);
	return crypto.subtle.timingSafeEqual(leftHash, rightHash);
}

export async function hmacKey(secret: string): Promise<CryptoKey> {
	return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function hmacSign(secret: string, message: string): Promise<ArrayBuffer> {
	const key = await hmacKey(secret);
	return crypto.subtle.sign('HMAC', key, encoder.encode(message));
}

export function bytesToBase64Url(bytes: ArrayBuffer | Uint8Array): string {
	const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
	let binary = '';
	for (const byte of view) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function base64UrlToBytes(value: string): Uint8Array | null {
	const padded = value.replace(/-/g, '+').replace(/_/g, '/');
	const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
	try {
		const binary = atob(padded + pad);
		const out = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) {
			out[i] = binary.charCodeAt(i);
		}
		return out;
	} catch {
		return null;
	}
}

export async function timingSafeEqualBytes(left: Uint8Array, right: Uint8Array): Promise<boolean> {
	const [leftHash, rightHash] = await Promise.all([crypto.subtle.digest('SHA-256', left), crypto.subtle.digest('SHA-256', right)]);
	return crypto.subtle.timingSafeEqual(leftHash, rightHash);
}
