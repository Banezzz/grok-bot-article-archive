import { deleteLibraryForArticle, isValidFolderId, type ArticleFolderRef } from './folders';
import { resolveThumbnailSource, storeThumbnail } from './thumbnail';
import { HttpError, isValidSlug, likePattern, randomSuffix, slugifyTitle } from './util';

export type ArticleRow = {
	id: string;
	slug: string;
	title: string;
	source_url: string;
	author: string | null;
	lang: string | null;
	published_at: string | null;
	created_at: string;
	updated_at: string;
	r2_key: string;
	notes: string | null;
	summary_zh: string | null;
	thumbnail_key: string | null;
	owner_id: string | null;
	owner_username?: string | null;
};

export type TagRow = {
	id: string;
	slug: string;
	name_zh: string;
	name_en: string | null;
	created_at: string;
};

export type TagPublic = {
	slug: string;
	name_zh: string;
	name_en: string | null;
};

export type TagCount = TagPublic & {
	article_count: number;
};

export type ArticleView = ArticleRow & {
	tags: TagPublic[];
	owner_username: string | null;
	starred: boolean;
	folders: ArticleFolderRef[];
};

export type UploadInput = {
	title: string;
	source_url: string;
	author?: string;
	lang?: string;
	html: string;
	slug?: string;
	published_at?: string;
	notes?: string;
	summary_zh?: string;
	tags?: string[];
	thumbnail_url?: string;
	thumbnail_base64?: string;
};

export type ArticleSort = 'joined' | 'published';

export type ListQuery = {
	q?: string;
	tags?: string[];
	ownerId?: string;
	folderId?: string;
	starred?: boolean;
	viewerId?: string;
	sort?: ArticleSort;
};

export const DEFAULT_ARTICLE_SORT: ArticleSort = 'joined';
export const SORT_COOKIE = 'archive_sort';

const JOINED_ALIASES = new Set(['joined', 'created', 'created_at', 'archived', 'archive']);
const PUBLISHED_ALIASES = new Set(['published', 'article', 'published_at', 'article_time']);

export function parseArticleSort(value: string | null | undefined): ArticleSort | null {
	if (!value) {
		return null;
	}
	const normalized = value.trim().toLowerCase();
	if (JOINED_ALIASES.has(normalized)) {
		return 'joined';
	}
	if (PUBLISHED_ALIASES.has(normalized)) {
		return 'published';
	}
	return null;
}

export function parseSortCookie(request: Request): ArticleSort | null {
	const header = request.headers.get('cookie') ?? '';
	for (const part of header.split(';')) {
		const trimmed = part.trim();
		const prefix = `${SORT_COOKIE}=`;
		if (trimmed.startsWith(prefix)) {
			return parseArticleSort(trimmed.slice(prefix.length));
		}
	}
	return null;
}

export function sortCookie(sort: ArticleSort, requestUrl: URL): string {
	const secure = requestUrl.protocol === 'https:' ? '; Secure' : '';
	return `${SORT_COOKIE}=${sort}; Path=/; SameSite=Lax; Max-Age=31536000${secure}`;
}

export function resolveArticleSort(request: Request, url: URL = new URL(request.url)): ArticleSort {
	return parseArticleSort(url.searchParams.get('sort')) ?? parseSortCookie(request) ?? DEFAULT_ARTICLE_SORT;
}

function orderByClause(sort: ArticleSort): string {
	if (sort === 'published') {
		return 'ORDER BY datetime(COALESCE(articles.published_at, articles.created_at)) DESC, articles.created_at DESC';
	}
	return 'ORDER BY datetime(articles.created_at) DESC, articles.id DESC';
}

const TITLE_MAX = 500;
const URL_MAX = 2048;
const AUTHOR_MAX = 200;
const LANG_MAX = 16;
const NOTES_MAX = 4000;
const SUMMARY_MAX = 4000;
const SLUG_MAX = 128;
const TAG_SLUG_MAX = 64;

function optionalString(value: unknown, field: string, max: number): string | undefined {
	if (value === undefined || value === null || value === '') {
		return undefined;
	}
	if (typeof value !== 'string') {
		throw new HttpError(400, `${field} must be a string`);
	}
	const trimmed = value.trim();
	if (!trimmed) {
		return undefined;
	}
	if (trimmed.length > max) {
		throw new HttpError(400, `${field} is too long`);
	}
	return trimmed;
}

function requiredString(value: unknown, field: string, max: number): string {
	if (typeof value !== 'string' || !value.trim()) {
		throw new HttpError(400, `${field} is required`);
	}
	const trimmed = value.trim();
	if (trimmed.length > max) {
		throw new HttpError(400, `${field} is too long`);
	}
	return trimmed;
}

function parseTagSlugs(value: unknown): string[] | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (!Array.isArray(value)) {
		throw new HttpError(400, 'tags must be an array of slugs');
	}
	const slugs: string[] = [];
	for (const item of value) {
		if (typeof item !== 'string' || !item.trim()) {
			throw new HttpError(400, 'tags must be an array of slugs');
		}
		const slug = item.trim().toLowerCase();
		if (!isValidSlug(slug) || slug.length > TAG_SLUG_MAX) {
			throw new HttpError(400, `invalid tag slug: ${slug}`);
		}
		if (!slugs.includes(slug)) {
			slugs.push(slug);
		}
	}
	return slugs;
}

export function parseUploadBody(data: unknown): UploadInput {
	if (!data || typeof data !== 'object') {
		throw new HttpError(400, 'JSON object required');
	}
	const body = data as Record<string, unknown>;
	if (typeof body.html !== 'string' || body.html.length === 0) {
		throw new HttpError(400, 'html is required');
	}

	const publishedAt = optionalString(body.published_at, 'published_at', 64);
	if (publishedAt && Number.isNaN(new Date(publishedAt).getTime())) {
		throw new HttpError(400, 'published_at must be an ISO datetime');
	}

	const slug = optionalString(body.slug, 'slug', SLUG_MAX);
	if (slug && !isValidSlug(slug)) {
		throw new HttpError(400, 'slug must be lowercase letters, digits, and hyphens');
	}

	return {
		title: requiredString(body.title, 'title', TITLE_MAX),
		source_url: requiredString(body.source_url, 'source_url', URL_MAX),
		html: body.html,
		author: optionalString(body.author, 'author', AUTHOR_MAX),
		lang: optionalString(body.lang, 'lang', LANG_MAX),
		slug,
		published_at: publishedAt,
		notes: optionalString(body.notes, 'notes', NOTES_MAX),
		summary_zh: optionalString(body.summary_zh, 'summary_zh', SUMMARY_MAX),
		tags: parseTagSlugs(body.tags),
		thumbnail_url: optionalString(body.thumbnail_url, 'thumbnail_url', URL_MAX),
		thumbnail_base64: optionalString(body.thumbnail_base64, 'thumbnail_base64', 4 * 1024 * 1024),
	};
}

export function articlePublic(article: ArticleView) {
	return {
		id: article.id,
		slug: article.slug,
		title: article.title,
		source_url: article.source_url,
		author: article.author,
		lang: article.lang,
		published_at: article.published_at,
		created_at: article.created_at,
		updated_at: article.updated_at,
		notes: article.notes,
		summary_zh: article.summary_zh,
		thumbnail_url: article.thumbnail_key ? `/thumb/${article.slug}` : null,
		tags: article.tags,
		owner_id: article.owner_id,
		owner_username: article.owner_username ?? null,
		starred: article.starred,
		folders: article.folders,
		url: `/a/${article.slug}`,
	};
}

export function canViewArticle(session: { id: string; role: string }, article: { owner_id: string | null }): boolean {
	return session.role === 'admin' || article.owner_id === session.id;
}

export async function getArticleBySlug(env: Env, slug: string): Promise<ArticleRow | null> {
	return env.DB.prepare(
		`SELECT articles.*, users.username AS owner_username
		 FROM articles
		 LEFT JOIN users ON users.id = articles.owner_id
		 WHERE articles.slug = ?`,
	)
		.bind(slug)
		.first<ArticleRow>();
}

export async function getArticleViewBySlug(env: Env, slug: string, viewerId?: string): Promise<ArticleView | null> {
	const row = await getArticleBySlug(env, slug);
	if (!row) {
		return null;
	}
	const [view] = await attachViewerState(env, await attachTags(env, [row]), viewerId);
	return view ?? null;
}

async function attachTags(env: Env, rows: ArticleRow[]): Promise<ArticleView[]> {
	if (rows.length === 0) {
		return [];
	}
	const placeholders = rows.map(() => '?').join(', ');
	const result = await env.DB.prepare(
		`SELECT article_tags.article_id AS article_id, tags.slug AS slug, tags.name_zh AS name_zh, tags.name_en AS name_en
		 FROM article_tags
		 JOIN tags ON tags.id = article_tags.tag_id
		 WHERE article_tags.article_id IN (${placeholders})
		 ORDER BY tags.name_zh COLLATE NOCASE`,
	)
		.bind(...rows.map((row) => row.id))
		.all<{ article_id: string; slug: string; name_zh: string; name_en: string | null }>();

	const byArticle = new Map<string, TagPublic[]>();
	for (const tag of result.results ?? []) {
		const list = byArticle.get(tag.article_id) ?? [];
		list.push({ slug: tag.slug, name_zh: tag.name_zh, name_en: tag.name_en });
		byArticle.set(tag.article_id, list);
	}
	return rows.map((row) => ({
		...row,
		tags: byArticle.get(row.id) ?? [],
		owner_username: row.owner_username ?? null,
		starred: false,
		folders: [],
	}));
}

async function attachViewerState(env: Env, rows: ArticleView[], viewerId?: string): Promise<ArticleView[]> {
	if (!viewerId || rows.length === 0) {
		return rows;
	}
	const placeholders = rows.map(() => '?').join(', ');
	const ids = rows.map((row) => row.id);
	const [stars, memberships] = await Promise.all([
		env.DB.prepare(`SELECT article_id FROM article_stars WHERE user_id = ? AND article_id IN (${placeholders})`)
			.bind(viewerId, ...ids)
			.all<{ article_id: string }>(),
		env.DB.prepare(
			`SELECT folder_articles.article_id AS article_id, folders.id AS id, folders.name AS name
			 FROM folder_articles
			 JOIN folders ON folders.id = folder_articles.folder_id
			 WHERE folders.user_id = ? AND folder_articles.article_id IN (${placeholders})
			 ORDER BY folders.sort_order ASC, folders.name COLLATE NOCASE`,
		)
			.bind(viewerId, ...ids)
			.all<{ article_id: string; id: string; name: string }>(),
	]);
	const starred = new Set((stars.results ?? []).map((row) => row.article_id));
	const foldersByArticle = new Map<string, ArticleFolderRef[]>();
	for (const row of memberships.results ?? []) {
		const list = foldersByArticle.get(row.article_id) ?? [];
		list.push({ id: row.id, name: row.name });
		foldersByArticle.set(row.article_id, list);
	}
	return rows.map((row) => ({
		...row,
		starred: starred.has(row.id),
		folders: foldersByArticle.get(row.id) ?? [],
	}));
}

export async function listArticles(env: Env, query: ListQuery = {}): Promise<ArticleView[]> {
	const order = orderByClause(query.sort ?? DEFAULT_ARTICLE_SORT);
	const clauses: string[] = [];
	const binds: string[] = [];
	const q = query.q?.trim();
	if (q) {
		const pattern = likePattern(q);
		clauses.push(`(
			articles.title LIKE ? ESCAPE '\\'
			OR IFNULL(articles.author, '') LIKE ? ESCAPE '\\'
			OR IFNULL(articles.summary_zh, '') LIKE ? ESCAPE '\\'
			OR articles.source_url LIKE ? ESCAPE '\\'
			OR EXISTS (
				SELECT 1 FROM article_tags
				JOIN tags ON tags.id = article_tags.tag_id
				WHERE article_tags.article_id = articles.id
				  AND (tags.slug LIKE ? ESCAPE '\\' OR tags.name_zh LIKE ? ESCAPE '\\' OR IFNULL(tags.name_en, '') LIKE ? ESCAPE '\\')
			)
		)`);
		binds.push(pattern, pattern, pattern, pattern, pattern, pattern, pattern);
	}

	if (query.ownerId) {
		clauses.push('articles.owner_id = ?');
		binds.push(query.ownerId);
	}

	if (query.folderId && query.viewerId && isValidFolderId(query.folderId)) {
		clauses.push(`articles.id IN (
			SELECT folder_articles.article_id
			FROM folder_articles
			JOIN folders ON folders.id = folder_articles.folder_id
			WHERE folders.id = ? AND folders.user_id = ?
		)`);
		binds.push(query.folderId, query.viewerId);
	}

	if (query.starred && query.viewerId) {
		clauses.push(`articles.id IN (
			SELECT article_id FROM article_stars WHERE user_id = ?
		)`);
		binds.push(query.viewerId);
	}

	const tagSlugs = (query.tags ?? []).filter(Boolean);
	if (tagSlugs.length > 0) {
		const tagPlaceholders = tagSlugs.map(() => '?').join(', ');
		clauses.push(`articles.id IN (
			SELECT article_tags.article_id
			FROM article_tags
			JOIN tags ON tags.id = article_tags.tag_id
			WHERE tags.slug IN (${tagPlaceholders})
		)`);
		binds.push(...tagSlugs);
	}

	const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
	const result = await env.DB.prepare(
		`SELECT articles.*, users.username AS owner_username
		 FROM articles
		 LEFT JOIN users ON users.id = articles.owner_id
		 ${where} ${order}`,
	)
		.bind(...binds)
		.all<ArticleRow>();
	return attachViewerState(env, await attachTags(env, result.results ?? []), query.viewerId);
}

export async function listTags(env: Env, ownerId?: string): Promise<TagCount[]> {
	const ownerClause = ownerId ? 'AND articles.owner_id = ?' : '';
	const result = await env.DB.prepare(
		`SELECT tags.slug AS slug, tags.name_zh AS name_zh, tags.name_en AS name_en,
		        COUNT(articles.id) AS article_count
		 FROM tags
		 LEFT JOIN article_tags ON article_tags.tag_id = tags.id
		 LEFT JOIN articles ON articles.id = article_tags.article_id ${ownerClause}
		 GROUP BY tags.id
		 ORDER BY tags.name_zh COLLATE NOCASE`,
	)
		.bind(...(ownerId ? [ownerId] : []))
		.all<TagCount>();
	return result.results ?? [];
}

async function uniqueGeneratedSlug(env: Env, title: string): Promise<string> {
	const base = slugifyTitle(title);
	for (let attempt = 0; attempt < 6; attempt++) {
		const candidate = attempt === 0 ? base : `${base}-${randomSuffix()}`;
		const existing = await getArticleBySlug(env, candidate);
		if (!existing) {
			return candidate;
		}
	}
	throw new HttpError(409, 'Could not allocate a unique slug');
}

async function resolveOrCreateTags(env: Env, slugs: string[]): Promise<TagRow[]> {
	const rows: TagRow[] = [];
	for (const slug of slugs) {
		let tag = await env.DB.prepare('SELECT * FROM tags WHERE slug = ?').bind(slug).first<TagRow>();
		if (!tag) {
			const now = new Date().toISOString();
			tag = {
				id: crypto.randomUUID(),
				slug,
				name_zh: slug,
				name_en: null,
				created_at: now,
			};
			await env.DB.prepare('INSERT INTO tags (id, slug, name_zh, name_en, created_at) VALUES (?, ?, ?, ?, ?)').bind(tag.id, tag.slug, tag.name_zh, tag.name_en, tag.created_at).run();
		}
		rows.push(tag);
	}
	return rows;
}

async function replaceArticleTags(env: Env, articleId: string, slugs: string[]): Promise<void> {
	await env.DB.prepare('DELETE FROM article_tags WHERE article_id = ?').bind(articleId).run();
	const tags = await resolveOrCreateTags(env, slugs);
	for (const tag of tags) {
		await env.DB.prepare('INSERT OR IGNORE INTO article_tags (article_id, tag_id) VALUES (?, ?)').bind(articleId, tag.id).run();
	}
}

export async function upsertArticle(env: Env, input: UploadInput, ownerId: string | null): Promise<ArticleView> {
	const providedSlug = input.slug;
	const slug = providedSlug ?? (await uniqueGeneratedSlug(env, input.title));
	const existing = providedSlug ? await getArticleBySlug(env, providedSlug) : null;
	const now = new Date().toISOString();
	const id = existing?.id ?? crypto.randomUUID();
	const createdAt = existing?.created_at ?? now;
	const persistedOwnerId = existing?.owner_id ?? ownerId;
	const r2Key = `articles/${slug}.html`;
	const summaryZh = input.summary_zh !== undefined ? input.summary_zh : (existing?.summary_zh ?? null);

	await env.ARTICLES.put(r2Key, input.html, {
		httpMetadata: {
			contentType: 'text/html; charset=utf-8',
		},
		customMetadata: {
			slug,
			title: input.title,
		},
	});

	let thumbnailKey = existing?.thumbnail_key ?? null;
	const shouldResolveThumb = Boolean(input.thumbnail_url || input.thumbnail_base64 || !thumbnailKey);
	if (shouldResolveThumb) {
		const image = await resolveThumbnailSource({
			thumbnail_url: input.thumbnail_url,
			thumbnail_base64: input.thumbnail_base64,
			html: input.html,
			source_url: input.source_url,
		});
		if (image) {
			const stored = await storeThumbnail(env, slug, image, thumbnailKey);
			thumbnailKey = stored.key;
		} else if (input.thumbnail_url || input.thumbnail_base64) {
			thumbnailKey = null;
		}
	}

	await env.DB.prepare(
		`INSERT INTO articles (
			id, slug, title, source_url, author, lang, published_at, created_at, updated_at, r2_key, notes, summary_zh, thumbnail_key, owner_id
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(slug) DO UPDATE SET
			title = excluded.title,
			source_url = excluded.source_url,
			author = excluded.author,
			lang = excluded.lang,
			published_at = excluded.published_at,
			updated_at = excluded.updated_at,
			r2_key = excluded.r2_key,
			notes = excluded.notes,
			summary_zh = excluded.summary_zh,
			thumbnail_key = excluded.thumbnail_key,
			owner_id = COALESCE(articles.owner_id, excluded.owner_id)`,
	)
		.bind(
			id,
			slug,
			input.title,
			input.source_url,
			input.author ?? null,
			input.lang ?? null,
			input.published_at ?? null,
			createdAt,
			now,
			r2Key,
			input.notes ?? null,
			summaryZh,
			thumbnailKey,
			persistedOwnerId,
		)
		.run();

	if (input.tags !== undefined) {
		await replaceArticleTags(env, id, input.tags);
	}

	const view = await getArticleViewBySlug(env, slug);
	if (!view) {
		throw new HttpError(500, 'Failed to persist article metadata');
	}
	return view;
}

export async function deleteArticle(env: Env, slug: string): Promise<boolean> {
	const row = await getArticleBySlug(env, slug);
	if (!row) {
		return false;
	}
	await env.DB.prepare('DELETE FROM article_tags WHERE article_id = ?').bind(row.id).run();
	await deleteLibraryForArticle(env, row.id);
	const keys = [row.r2_key, row.thumbnail_key].filter((key): key is string => Boolean(key));
	if (keys.length > 0) {
		await env.ARTICLES.delete(keys);
	}
	await env.DB.prepare('DELETE FROM articles WHERE slug = ?').bind(slug).run();
	return true;
}

export function parseTagQuery(url: URL): string[] {
	const tags = new Set<string>();
	const single = url.searchParams.get('tag')?.trim().toLowerCase();
	if (single && isValidSlug(single)) {
		tags.add(single);
	}
	const multi = url.searchParams.get('tags')?.split(',') ?? [];
	for (const raw of multi) {
		const slug = raw.trim().toLowerCase();
		if (slug && isValidSlug(slug)) {
			tags.add(slug);
		}
	}
	return [...tags];
}
