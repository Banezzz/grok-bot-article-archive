import { createHash } from 'node:crypto';

/**
 * Content-Security-Policy for every HTML response.
 *
 * Archived article HTML is served on the app's own origin, so a script inside it would
 * run with the reader's session. Only the archive's own inline scripts are allowed, by
 * SHA-256 hash. They are static constants, so the hashes are fixed per deploy, and an
 * injected tag cannot borrow them the way it could steal a per-response nonce.
 */

const SCRIPT_BODY_RE = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;

export function inlineScriptBodies(markup: string): string[] {
	return [...markup.matchAll(SCRIPT_BODY_RE)].map((match) => match[1] ?? '');
}

export function scriptHashSource(body: string): string {
	return `'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`;
}

export function scriptHashSources(scriptMarkups: readonly string[]): string[] {
	const sources = new Set<string>();
	for (const markup of scriptMarkups) {
		for (const body of inlineScriptBodies(markup)) {
			sources.add(scriptHashSource(body));
		}
	}
	return [...sources];
}

const LOCKDOWN = ["object-src 'none'", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'"];

/** Archive UI pages: everything is first-party. */
export function appPagePolicy(hashes: readonly string[]): string {
	return [
		"default-src 'self'",
		`script-src ${hashes.join(' ')}`,
		"style-src 'self' 'unsafe-inline'",
		"img-src 'self' data: blob:",
		...LOCKDOWN,
	].join('; ');
}

/** Stored articles: images, styles, fonts, media and embeds load as before; only scripts are locked down. */
export function articlePagePolicy(hashes: readonly string[]): string {
	return [`script-src ${hashes.join(' ')}`, ...LOCKDOWN].join('; ');
}

/** Raw stored HTML returned as a download: never render or run it on this origin. */
export const DOWNLOAD_POLICY = "sandbox; default-src 'none'";

/** Uploaded thumbnail bytes. */
export const IMAGE_POLICY = "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox";
