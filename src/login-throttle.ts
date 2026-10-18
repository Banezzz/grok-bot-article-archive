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

/**
 * Counts this attempt, then reports whether any key is now over its limit. Counting first,
 * in one atomic upsert per key, closes the race where parallel requests all read the old
 * count, pass the check, and each get a password guess.
 */
export async function registerLoginAttempt(env: Env, keys: ThrottleKey[]): Promise<boolean> {
	if (keys.length === 0) {
		return false;
	}
	const now = nowSeconds();
	const results = await env.DB.batch<{ count: number }>([
		env.DB.prepare('DELETE FROM login_failures WHERE window_start <= ?').bind(now - LOGIN_WINDOW_SECONDS),
		...keys.map((item) =>
			env.DB.prepare(
				`INSERT INTO login_failures (key, count, window_start) VALUES (?, 1, ?)
				 ON CONFLICT(key) DO UPDATE SET count = count + 1
				 RETURNING count`,
			).bind(item.key, now),
		),
	]);
	return keys.some((item, index) => Number(results[index + 1]?.results?.[0]?.count ?? 0) > item.limit);
}

/**
 * After a successful sign-in: forget the username's failures and give the IP back the
 * attempt that just succeeded, so signing in to one's own account never spends the budget.
 */
export async function recordLoginSuccess(env: Env, keys: ThrottleKey[]): Promise<void> {
	const statements = keys.map((item) =>
		item.key.startsWith('user:')
			? env.DB.prepare('DELETE FROM login_failures WHERE key = ?').bind(item.key)
			: env.DB.prepare('UPDATE login_failures SET count = MAX(count - 1, 0) WHERE key = ?').bind(item.key),
	);
	if (statements.length > 0) {
		await env.DB.batch(statements);
	}
}
