import { HttpError } from './util';

export const FOLDER_NAME_MAX = 80;

const FOLDER_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type FolderRow = {
	id: string;
	user_id: string;
	name: string;
	sort_order: number;
	created_at: string;
	updated_at: string;
};

export type FolderSummary = FolderRow & {
	article_count: number;
};

export type ArticleFolderRef = {
	id: string;
	name: string;
};

export function isValidFolderId(value: string): boolean {
	return FOLDER_ID_RE.test(value);
}

export function normalizeFolderName(value: string): string {
	const name = value.replace(/\s+/g, ' ').trim();
	if (!name) {
		throw new HttpError(400, 'Folder name is required.');
	}
	if (name.length > FOLDER_NAME_MAX) {
		throw new HttpError(400, 'Folder name is too long.');
	}
	return name;
}

export async function listFolders(env: Env, userId: string): Promise<FolderSummary[]> {
	const result = await env.DB.prepare(
		`SELECT folders.id AS id, folders.user_id AS user_id, folders.name AS name,
		        folders.sort_order AS sort_order, folders.created_at AS created_at,
		        folders.updated_at AS updated_at, COUNT(folder_articles.article_id) AS article_count
		 FROM folders
		 LEFT JOIN folder_articles ON folder_articles.folder_id = folders.id
		 WHERE folders.user_id = ?
		 GROUP BY folders.id
		 ORDER BY folders.sort_order ASC, folders.created_at ASC, folders.id ASC`,
	)
		.bind(userId)
		.all<FolderSummary>();
	return result.results ?? [];
}

export async function getFolder(env: Env, folderId: string, userId: string): Promise<FolderRow | null> {
	if (!isValidFolderId(folderId)) {
		return null;
	}
	return env.DB.prepare('SELECT * FROM folders WHERE id = ? AND user_id = ?').bind(folderId, userId).first<FolderRow>();
}

async function folderNameTaken(env: Env, userId: string, name: string, exceptId?: string): Promise<boolean> {
	const row = exceptId
		? await env.DB.prepare('SELECT id FROM folders WHERE user_id = ? AND name = ? COLLATE NOCASE AND id != ?')
				.bind(userId, name, exceptId)
				.first<{ id: string }>()
		: await env.DB.prepare('SELECT id FROM folders WHERE user_id = ? AND name = ? COLLATE NOCASE').bind(userId, name).first<{ id: string }>();
	return Boolean(row);
}

export async function createFolder(env: Env, userId: string, rawName: string): Promise<FolderRow> {
	const name = normalizeFolderName(rawName);
	if (await folderNameTaken(env, userId, name)) {
		throw new HttpError(409, 'A folder with that name already exists.');
	}
	const max = await env.DB.prepare('SELECT MAX(sort_order) AS n FROM folders WHERE user_id = ?').bind(userId).first<{ n: number | null }>();
	const now = new Date().toISOString();
	const row: FolderRow = {
		id: crypto.randomUUID(),
		user_id: userId,
		name,
		sort_order: Number(max?.n ?? -1) + 1,
		created_at: now,
		updated_at: now,
	};
	await env.DB.prepare('INSERT INTO folders (id, user_id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').bind(row.id, row.user_id, row.name, row.sort_order, row.created_at, row.updated_at).run();
	return row;
}

export async function renameFolder(env: Env, folderId: string, userId: string, rawName: string): Promise<FolderRow> {
	const folder = await getFolder(env, folderId, userId);
	if (!folder) {
		throw new HttpError(404, 'Folder not found');
	}
	const name = normalizeFolderName(rawName);
	if (await folderNameTaken(env, userId, name, folder.id)) {
		throw new HttpError(409, 'A folder with that name already exists.');
	}
	const now = new Date().toISOString();
	await env.DB.prepare('UPDATE folders SET name = ?, updated_at = ? WHERE id = ? AND user_id = ?').bind(name, now, folder.id, userId).run();
	return { ...folder, name, updated_at: now };
}

export async function deleteFolder(env: Env, folderId: string, userId: string): Promise<void> {
	const folder = await getFolder(env, folderId, userId);
	if (!folder) {
		throw new HttpError(404, 'Folder not found');
	}
	await env.DB.prepare('DELETE FROM folder_articles WHERE folder_id = ?').bind(folder.id).run();
	await env.DB.prepare('DELETE FROM folders WHERE id = ? AND user_id = ?').bind(folder.id, userId).run();
}

export async function moveFolder(env: Env, folderId: string, userId: string, direction: 'up' | 'down'): Promise<FolderRow> {
	const folder = await getFolder(env, folderId, userId);
	if (!folder) {
		throw new HttpError(404, 'Folder not found');
	}
	const folders = await listFolders(env, userId);
	const index = folders.findIndex((item) => item.id === folder.id);
	if (index < 0) {
		throw new HttpError(404, 'Folder not found');
	}
	const swapWith = direction === 'up' ? index - 1 : index + 1;
	const neighbor = folders[swapWith];
	if (!neighbor) {
		return folder;
	}
	const now = new Date().toISOString();
	await env.DB.prepare('UPDATE folders SET sort_order = ?, updated_at = ? WHERE id = ?').bind(neighbor.sort_order, now, folder.id).run();
	await env.DB.prepare('UPDATE folders SET sort_order = ?, updated_at = ? WHERE id = ?').bind(folder.sort_order, now, neighbor.id).run();
	return { ...folder, sort_order: neighbor.sort_order, updated_at: now };
}

export async function setArticleFolders(env: Env, userId: string, articleId: string, folderIds: string[]): Promise<string[]> {
	const unique = [...new Set(folderIds.filter(isValidFolderId))];
	const owned = unique.length === 0 ? [] : await listFolders(env, userId);
	const ownedIds = new Set(owned.map((folder) => folder.id));
	const nextIds = unique.filter((id) => ownedIds.has(id));
	await env.DB.prepare(
		`DELETE FROM folder_articles
		 WHERE article_id = ?
		   AND folder_id IN (SELECT id FROM folders WHERE user_id = ?)`,
	)
		.bind(articleId, userId)
		.run();
	const now = new Date().toISOString();
	for (const folderId of nextIds) {
		await env.DB.prepare('INSERT OR IGNORE INTO folder_articles (folder_id, article_id, created_at) VALUES (?, ?, ?)').bind(folderId, articleId, now).run();
	}
	return nextIds;
}

export async function toggleArticleStar(env: Env, userId: string, articleId: string): Promise<boolean> {
	const existing = await env.DB.prepare('SELECT article_id FROM article_stars WHERE user_id = ? AND article_id = ?').bind(userId, articleId).first<{ article_id: string }>();
	if (existing) {
		await env.DB.prepare('DELETE FROM article_stars WHERE user_id = ? AND article_id = ?').bind(userId, articleId).run();
		return false;
	}
	await env.DB.prepare('INSERT INTO article_stars (user_id, article_id, created_at) VALUES (?, ?, ?)').bind(userId, articleId, new Date().toISOString()).run();
	return true;
}

export async function deleteLibraryForArticle(env: Env, articleId: string): Promise<void> {
	await env.DB.prepare('DELETE FROM folder_articles WHERE article_id = ?').bind(articleId).run();
	await env.DB.prepare('DELETE FROM article_stars WHERE article_id = ?').bind(articleId).run();
}

export async function deleteLibraryForUser(env: Env, userId: string): Promise<void> {
	await env.DB.prepare('DELETE FROM article_stars WHERE user_id = ?').bind(userId).run();
	await env.DB.prepare('DELETE FROM folder_articles WHERE folder_id IN (SELECT id FROM folders WHERE user_id = ?)').bind(userId).run();
	await env.DB.prepare('DELETE FROM folders WHERE user_id = ?').bind(userId).run();
}
