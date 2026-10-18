import { jsonSqlList, sqlInJsonEach } from './d1';

/**
 * Fixed-window throttle for failed sign-ins, stored in D1 so it holds across isolates.
 * Per-IP stops one client spraying many accounts; per-username stops a distributed
 * guess at one account (at the cost that it can briefly lock that account out).
 */
export const LOGIN_WINDOW_SECONDS = 15 * 60;
export const LOGIN_MAX_FAILURES_PER_IP = 20;
export const LOGIN_MAX_FAILURES_PER_USERNAME = 10;

export type ThrottleKey = { key: string; limit: number };

export function loginThrottleKeys(request: Request, username: string): ThrottleKey[] {
	const keys: ThrottleKey[] = [];
	const ip = request.headers.get('cf-connecting-ip')?.trim();
	if (ip) {
		keys.push({ key: `ip:${ip}`, limit: LOGIN_MAX_FAILURES_PER_IP });
	}
	const name = username.trim().toLowerCase().slice(0, 64);
	if (name) {
		keys.push({ key: `user:${name}`, limit: LOGIN_MAX_FAILURES_PER_USERNAME });
	}
	return keys;
}

function nowSeconds(): number {
	return Math.floor(Date.now() / 1000);
}

export async function isLoginThrottled(env: Env, keys: ThrottleKey[]): Promise<boolean> {
	if (keys.length === 0) {
		return false;
	}
	const result = await env.DB.prepare(`SELECT key, count FROM login_failures WHERE ${sqlInJsonEach('key')} AND window_start > ?`)
		.bind(jsonSqlList(keys.map((item) => item.key)), nowSeconds() - LOGIN_WINDOW_SECONDS)
		.all<{ key: string; count: number }>();
	const counts = new Map((result.results ?? []).map((row) => [row.key, Number(row.count)]));
	return keys.some((item) => (counts.get(item.key) ?? 0) >= item.limit);
}

export async function recordLoginFailure(env: Env, keys: ThrottleKey[]): Promise<void> {
	const now = nowSeconds();
	const expired = now - LOGIN_WINDOW_SECONDS;
	await env.DB.batch([
		env.DB.prepare('DELETE FROM login_failures WHERE window_start <= ?').bind(expired),
		...keys.map((item) =>
			env.DB.prepare(
				`INSERT INTO login_failures (key, count, window_start) VALUES (?, 1, ?)
				 ON CONFLICT(key) DO UPDATE SET count = count + 1`,
			).bind(item.key, now),
		),
	]);
}

/** Clears only the username counter: a successful sign-in to one's own account must not reset an IP's budget. */
export async function clearLoginFailures(env: Env, username: string): Promise<void> {
	const name = username.trim().toLowerCase().slice(0, 64);
	if (name) {
		await env.DB.prepare('DELETE FROM login_failures WHERE key = ?').bind(`user:${name}`).run();
	}
}
