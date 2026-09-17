import { deleteLibraryForUser } from './folders';
import { hashPassword, verifyPassword } from './password';
import { generateUploadToken, hashUploadToken, tokensMatch } from './tokens';
import { HttpError } from './util';

export type UserRole = 'user' | 'admin';

export type UserRow = {
	id: string;
	username: string;
	password_hash: string;
	role: UserRole;
	upload_token_hash: string | null;
	upload_token_prefix: string | null;
	created_at: string;
	updated_at: string;
};

export type SessionUser = {
	id: string;
	username: string;
	role: UserRole;
};

export type CreatedUser = {
	user: UserRow;
	uploadToken: string;
};

const USERNAME_RE = /^[a-zA-Z0-9._-]{3,32}$/;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 200;

export function normalizeUsername(value: string): string {
	const trimmed = value.trim();
	if (!USERNAME_RE.test(trimmed)) {
		throw new HttpError(400, 'Username must be 3–32 characters: letters, digits, dot, underscore, or hyphen.');
	}
	return trimmed.toLowerCase();
}

export function assertPassword(value: string): string {
	if (value.length < PASSWORD_MIN || value.length > PASSWORD_MAX) {
		throw new HttpError(400, `Password must be ${PASSWORD_MIN}–${PASSWORD_MAX} characters.`);
	}
	return value;
}

export async function countUsers(env: Env): Promise<number> {
	const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>();
	return Number(row?.n ?? 0);
}

export async function countAdmins(env: Env): Promise<number> {
	const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").first<{ n: number }>();
	return Number(row?.n ?? 0);
}

export async function countUserTokens(env: Env): Promise<number> {
	const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM users WHERE upload_token_hash IS NOT NULL').first<{ n: number }>();
	return Number(row?.n ?? 0);
}

export async function getUserById(env: Env, id: string): Promise<UserRow | null> {
	return env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>();
}

export async function getUserByUsername(env: Env, username: string): Promise<UserRow | null> {
	return env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username.toLowerCase()).first<UserRow>();
}

export async function listUsers(env: Env): Promise<UserRow[]> {
	const result = await env.DB.prepare('SELECT * FROM users ORDER BY created_at ASC').all<UserRow>();
	return result.results ?? [];
}

async function applyUploadToken(env: Env, userId: string): Promise<{ token: string; prefix: string; hash: string; updatedAt: string }> {
	const { token, prefix } = generateUploadToken();
	const hash = await hashUploadToken(token);
	const updatedAt = new Date().toISOString();
	await env.DB.prepare('UPDATE users SET upload_token_hash = ?, upload_token_prefix = ?, updated_at = ? WHERE id = ?').bind(hash, prefix, updatedAt, userId).run();
	return { token, prefix, hash, updatedAt };
}

export async function createUser(env: Env, input: { username: string; password: string; role: UserRole }): Promise<CreatedUser> {
	const username = normalizeUsername(input.username);
	assertPassword(input.password);
	if (input.role !== 'user' && input.role !== 'admin') {
		throw new HttpError(400, 'Invalid role');
	}
	const existing = await getUserByUsername(env, username);
	if (existing) {
		throw new HttpError(409, 'That username is already taken.');
	}
	const now = new Date().toISOString();
	const { token, prefix } = generateUploadToken();
	const user: UserRow = {
		id: crypto.randomUUID(),
		username,
		password_hash: await hashPassword(input.password),
		role: input.role,
		upload_token_hash: await hashUploadToken(token),
		upload_token_prefix: prefix,
		created_at: now,
		updated_at: now,
	};
	await env.DB.prepare(
		`INSERT INTO users (id, username, password_hash, role, upload_token_hash, upload_token_prefix, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
	)
		.bind(user.id, user.username, user.password_hash, user.role, user.upload_token_hash, user.upload_token_prefix, user.created_at, user.updated_at)
		.run();
	return { user, uploadToken: token };
}

export async function rotateUploadToken(env: Env, userId: string): Promise<{ user: UserRow; uploadToken: string }> {
	const user = await getUserById(env, userId);
	if (!user) {
		throw new HttpError(404, 'User not found');
	}
	const rotated = await applyUploadToken(env, userId);
	return {
		user: { ...user, upload_token_hash: rotated.hash, upload_token_prefix: rotated.prefix, updated_at: rotated.updatedAt },
		uploadToken: rotated.token,
	};
}

export async function authenticateUser(env: Env, username: string, password: string): Promise<UserRow | null> {
	let normalized: string;
	try {
		normalized = normalizeUsername(username);
	} catch {
		await hashPassword(password);
		return null;
	}
	const user = await getUserByUsername(env, normalized);
	if (!user) {
		await hashPassword(password);
		return null;
	}
	if (!(await verifyPassword(password, user.password_hash))) {
		return null;
	}
	return user;
}

export async function findUserByUploadToken(env: Env, token: string): Promise<UserRow | null> {
	if (!token) {
		return null;
	}
	const hash = await hashUploadToken(token);
	const user = await env.DB.prepare('SELECT * FROM users WHERE upload_token_hash = ?').bind(hash).first<UserRow>();
	if (!user?.upload_token_hash) {
		return null;
	}
	if (!(await tokensMatch(token, user.upload_token_hash))) {
		return null;
	}
	return user;
}

export async function assignOrphanArticles(env: Env, ownerId: string): Promise<number> {
	const result = await env.DB.prepare('UPDATE articles SET owner_id = ? WHERE owner_id IS NULL').bind(ownerId).run();
	return result.meta.changes ?? 0;
}

export async function setUserRole(env: Env, userId: string, role: UserRole): Promise<UserRow> {
	const user = await getUserById(env, userId);
	if (!user) {
		throw new HttpError(404, 'User not found');
	}
	if (user.role === 'admin' && role !== 'admin' && (await countAdmins(env)) <= 1) {
		throw new HttpError(400, 'Cannot demote the last remaining admin.');
	}
	const now = new Date().toISOString();
	await env.DB.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?').bind(role, now, userId).run();
	return { ...user, role, updated_at: now };
}

export async function deleteUser(env: Env, userId: string): Promise<void> {
	const user = await getUserById(env, userId);
	if (!user) {
		throw new HttpError(404, 'User not found');
	}
	if (user.role === 'admin' && (await countAdmins(env)) <= 1) {
		throw new HttpError(400, 'Cannot delete the last remaining admin.');
	}
	await deleteLibraryForUser(env, userId);
	await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();
}

export function publicUser(user: UserRow) {
	return {
		id: user.id,
		username: user.username,
		role: user.role,
		upload_token_prefix: user.upload_token_prefix,
		created_at: user.created_at,
	};
}
