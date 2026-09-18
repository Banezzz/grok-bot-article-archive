import { clearSessionCookie, createSessionCookie, getSession, resolveUploadActor, toSessionUser, unauthorized } from './auth';
import { localeCookie, parseLocale, parseLocaleParam, parseTheme, parseThemeParam, themeCookie, translateError } from './i18n';
import { createFolder, deleteFolder, isValidFolderId, listFolders, moveFolder, renameFolder, setArticleFolders, toggleArticleStar } from './folders';
import {
	adminUsersPage,
	foldersPage,
	injectArchiveChrome,
	listPage,
	loginPage,
	notFoundPage,
	settingsPage,
	setupCompletePage,
	setupPage,
	type Chrome,
} from './pages';
import {
	articlePublic,
	canViewArticle,
	deleteArticle,
	getArticleBySlug,
	getArticleViewBySlug,
	listArticles,
	listTags,
	parseArticleSort,
	parseTagQuery,
	parseUploadBody,
	resolveArticleSort,
	sortCookie,
	upsertArticle,
} from './store';
import {
	assignOrphanArticles,
	authenticateUser,
	countUsers,
	createUser,
	deleteUser,
	getUserById,
	listUsers,
	rotateUploadToken,
	setUserRole,
	type SessionUser,
	type UserRole,
} from './users';
import { getSiteIcon, isSiteIconPath, siteIconResponse } from './icons';
import { htmlAttachmentDisposition, HttpError, isApiPath, isValidSlug, json, jsonError, MAX_UPLOAD_BYTES, readBodyWithLimit, safeNextPath } from './util';

function ui(request: Request, overridePath?: string): Chrome {
	const url = new URL(request.url);
	return {
		locale: parseLocale(request),
		theme: parseTheme(request),
		path: overridePath ?? `${url.pathname}${url.search}`,
	};
}

function methodNotAllowed(allow: string): Response {
	return new Response('Method Not Allowed', {
		status: 405,
		headers: { allow, 'cache-control': 'private, no-store' },
	});
}

function forbiddenPage(chrome: Chrome): Response {
	return notFoundPage(chrome);
}

async function requireAdmin(session: SessionUser | null): Promise<SessionUser> {
	if (!session || session.role !== 'admin') {
		throw new HttpError(404, 'not found');
	}
	return session;
}

function signedRedirect(url: URL, location: string, cookie: string): Response {
	return new Response(null, {
		status: 303,
		headers: {
			location: new URL(location, url.origin).toString(),
			'set-cookie': cookie,
			'cache-control': 'private, no-store',
		},
	});
}

async function handleSetup(request: Request, env: Env): Promise<Response> {
	const chrome = ui(request, '/setup');
	if ((await countUsers(env)) > 0) {
		return notFoundPage(chrome);
	}
	if (request.method === 'GET') {
		return setupPage(chrome);
	}
	if (request.method !== 'POST') {
		return methodNotAllowed('GET, POST');
	}
	if (!env.SITE_ACCESS_SECRET) {
		return setupPage(chrome, translateError(chrome.locale, 'SITE_ACCESS_SECRET is not configured.'));
	}

	const form = await request.formData();
	const username = String(form.get('username') ?? '');
	const password = String(form.get('password') ?? '');
	const confirm = String(form.get('confirm') ?? '');
	if (password !== confirm) {
		return setupPage(chrome, translateError(chrome.locale, 'Passwords do not match.'));
	}

	try {
		const created = await createUser(env, { username, password, role: 'admin' });
		const assigned = await assignOrphanArticles(env, created.user.id);
		const url = new URL(request.url);
		const cookie = await createSessionCookie(env, url, toSessionUser(created.user));
		return setupCompletePage(chrome, created.user.username, created.uploadToken, assigned, { 'set-cookie': cookie });
	} catch (error) {
		if (error instanceof HttpError) {
			return setupPage(chrome, translateError(chrome.locale, error.message));
		}
		throw error;
	}
}

async function handleLogin(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	const next = safeNextPath(url.searchParams.get('next'));
	const chrome = ui(request, next === '/' ? '/login' : `/login?next=${encodeURIComponent(next)}`);
	const empty = (await countUsers(env)) === 0;

	if (request.method === 'GET') {
		const session = await getSession(request, env);
		if (session) {
			return Response.redirect(new URL(next, url.origin).toString(), 302);
		}
		if (empty) {
			return Response.redirect(new URL('/setup', url.origin).toString(), 302);
		}
		return loginPage(chrome, next, undefined, false);
	}

	if (request.method !== 'POST') {
		return methodNotAllowed('GET, POST');
	}

	const contentType = request.headers.get('content-type') ?? '';
	let username = '';
	let password = '';
	let postedNext = next;
	if (contentType.includes('application/json')) {
		const raw = await readBodyWithLimit(request, 64 * 1024);
		const data = JSON.parse(raw) as { username?: unknown; password?: unknown; next?: unknown };
		username = typeof data.username === 'string' ? data.username : '';
		password = typeof data.password === 'string' ? data.password : '';
		postedNext = typeof data.next === 'string' ? safeNextPath(data.next) : next;
	} else {
		const form = await request.formData();
		username = String(form.get('username') ?? '');
		password = String(form.get('password') ?? '');
		postedNext = safeNextPath(String(form.get('next') ?? next));
	}

	const user = await authenticateUser(env, username, password);
	if (!user) {
		return loginPage(chrome, postedNext, translateError(chrome.locale, 'Invalid credentials.'));
	}
	const cookie = await createSessionCookie(env, url, toSessionUser(user));
	return signedRedirect(url, postedNext, cookie);
}

async function handleLogout(request: Request): Promise<Response> {
	if (request.method !== 'POST') {
		return methodNotAllowed('POST');
	}
	const url = new URL(request.url);
	return signedRedirect(url, '/login', clearSessionCookie(url));
}

async function handleUpload(request: Request, env: Env): Promise<Response> {
	if (request.method !== 'POST') {
		return methodNotAllowed('POST');
	}
	const actor = await resolveUploadActor(request, env);
	if (actor instanceof Response) {
		return actor;
	}

	const raw = await readBodyWithLimit(request, MAX_UPLOAD_BYTES);
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return jsonError(400, 'Invalid JSON');
	}

	const input = parseUploadBody(parsed);
	const htmlBytes = new TextEncoder().encode(input.html).byteLength;
	if (htmlBytes > MAX_UPLOAD_BYTES) {
		return jsonError(413, `html exceeds ${MAX_UPLOAD_BYTES} bytes`);
	}

	const ownerId = actor.kind === 'user' ? actor.user.id : null;
	const row = await upsertArticle(env, input, ownerId);
	const publicArticle = articlePublic(row);
	return json({
		ok: true,
		slug: row.slug,
		url: publicArticle.url,
		tags: publicArticle.tags,
		summary_zh: publicArticle.summary_zh,
		thumbnail_url: publicArticle.thumbnail_url,
		owner_username: publicArticle.owner_username,
	});
}

function visibilityOwnerId(session: SessionUser, url: URL): string | undefined {
	if (session.role === 'admin' && url.searchParams.get('mine') !== '1') {
		return undefined;
	}
	return session.id;
}

function parseFolderQuery(url: URL): string | null {
	const raw = url.searchParams.get('folder')?.trim() ?? '';
	return isValidFolderId(raw) ? raw : null;
}

function formRedirect(url: URL, next: string): Response {
	return new Response(null, {
		status: 303,
		headers: {
			location: new URL(safeNextPath(next), url.origin).toString(),
			'cache-control': 'private, no-store',
		},
	});
}

async function requireVisibleArticle(env: Env, session: SessionUser, slug: string) {
	if (!isValidSlug(slug)) {
		throw new HttpError(404, 'not found');
	}
	const row = await getArticleViewBySlug(env, slug, session.id);
	if (!row || !canViewArticle(session, row)) {
		throw new HttpError(404, 'not found');
	}
	return row;
}

async function handleStar(request: Request, env: Env, session: SessionUser): Promise<Response> {
	if (request.method !== 'POST') {
		return methodNotAllowed('POST');
	}
	const form = await request.formData();
	const slug = String(form.get('slug') ?? '');
	const next = String(form.get('next') ?? '/');
	const row = await requireVisibleArticle(env, session, slug);
	await toggleArticleStar(env, session.id, row.id);
	return formRedirect(new URL(request.url), next);
}

async function handleFolderMembership(request: Request, env: Env, session: SessionUser): Promise<Response> {
	if (request.method !== 'POST') {
		return methodNotAllowed('POST');
	}
	const form = await request.formData();
	const slug = String(form.get('slug') ?? '');
	const next = String(form.get('next') ?? '/');
	const folderIds = form.getAll('folder_id').map((value) => String(value));
	const row = await requireVisibleArticle(env, session, slug);
	await setArticleFolders(env, session.id, row.id, folderIds);
	return formRedirect(new URL(request.url), next);
}

async function handleFolders(request: Request, env: Env, session: SessionUser): Promise<Response> {
	const chrome = ui(request, '/folders');
	if (request.method === 'GET') {
		return foldersPage(chrome, session, await listFolders(env, session.id));
	}
	if (request.method !== 'POST') {
		return methodNotAllowed('GET, POST');
	}
	try {
		await createFolder(env, session.id, String(formName(await request.formData())));
		return foldersPage(chrome, session, await listFolders(env, session.id));
	} catch (error) {
		if (error instanceof HttpError) {
			return foldersPage(chrome, session, await listFolders(env, session.id), translateError(chrome.locale, error.message));
		}
		throw error;
	}
}

function formName(form: FormData): string {
	return String(form.get('name') ?? '');
}

async function handleFolderAction(request: Request, env: Env, session: SessionUser, folderId: string, action: string): Promise<Response> {
	const chrome = ui(request, '/folders');
	if (request.method !== 'POST') {
		return methodNotAllowed('POST');
	}
	try {
		if (action === 'rename') {
			await renameFolder(env, folderId, session.id, formName(await request.formData()));
		} else if (action === 'delete') {
			await deleteFolder(env, folderId, session.id);
		} else if (action === 'move') {
			const direction = String((await request.formData()).get('direction') ?? '');
			if (direction !== 'up' && direction !== 'down') {
				throw new HttpError(400, 'Folder not found');
			}
			await moveFolder(env, folderId, session.id, direction);
		} else {
			return notFoundPage(chrome);
		}
		return foldersPage(chrome, session, await listFolders(env, session.id));
	} catch (error) {
		if (error instanceof HttpError) {
			return foldersPage(chrome, session, await listFolders(env, session.id), translateError(chrome.locale, error.message));
		}
		throw error;
	}
}

async function handleArticlesCollection(request: Request, env: Env, url: URL, session: SessionUser): Promise<Response> {
	if (request.method !== 'GET') {
		return methodNotAllowed('GET');
	}
	const q = url.searchParams.get('q')?.trim() ?? '';
	const tags = parseTagQuery(url);
	const folderId = parseFolderQuery(url);
	const starred = url.searchParams.get('starred') === '1';
	const rows = await listArticles(env, {
		q: q || undefined,
		tags: tags.length > 0 ? tags : undefined,
		ownerId: visibilityOwnerId(session, url),
		folderId: folderId ?? undefined,
		starred: starred || undefined,
		viewerId: session.id,
		sort: resolveArticleSort(request, url),
	});
	return json({ ok: true, articles: rows.map(articlePublic) });
}

async function handleTagsApi(request: Request, env: Env, url: URL, session: SessionUser): Promise<Response> {
	if (request.method !== 'GET') {
		return methodNotAllowed('GET');
	}
	const tags = await listTags(env, visibilityOwnerId(session, url));
	return json({ ok: true, tags });
}

async function handleArticleApi(request: Request, env: Env, slug: string, session: SessionUser | null): Promise<Response> {
	if (!isValidSlug(slug)) {
		return jsonError(400, 'invalid slug');
	}

	if (request.method === 'DELETE') {
		const actor = await resolveUploadActor(request, env);
		if (actor instanceof Response) {
			return actor;
		}
		const row = await getArticleBySlug(env, slug);
		if (!row) {
			return jsonError(404, 'not found');
		}
		if (actor.kind === 'user' && actor.user.role !== 'admin' && row.owner_id !== actor.user.id) {
			return jsonError(404, 'not found');
		}
		const deleted = await deleteArticle(env, slug);
		if (!deleted) {
			return jsonError(404, 'not found');
		}
		return json({ ok: true, slug });
	}

	if (request.method !== 'GET') {
		return methodNotAllowed('GET, DELETE');
	}
	if (!session) {
		return jsonError(401, 'unauthorized');
	}

	const row = await getArticleViewBySlug(env, slug, session.id);
	if (!row || !canViewArticle(session, row)) {
		return jsonError(404, 'not found');
	}
	return json({ ok: true, article: articlePublic(row) });
}

async function handleArticlePage(env: Env, slug: string, session: SessionUser, chrome: Chrome): Promise<Response> {
	if (!isValidSlug(slug)) {
		return notFoundPage(chrome);
	}
	const row = await getArticleViewBySlug(env, slug, session.id);
	if (!row || !canViewArticle(session, row)) {
		return notFoundPage(chrome);
	}

	const object = await env.ARTICLES.get(row.r2_key);
	if (!object) {
		return notFoundPage(chrome);
	}

	const headers = new Headers({
		'content-type': 'text/html; charset=utf-8',
		'cache-control': 'private, no-store',
		'x-robots-tag': 'noindex, nofollow',
		'x-content-type-options': 'nosniff',
	});
	object.writeHttpMetadata(headers);
	headers.set('content-type', 'text/html; charset=utf-8');
	if (object.httpEtag) {
		headers.set('etag', object.httpEtag);
	}

	const folders = await listFolders(env, session.id);
	return injectArchiveChrome(new Response(object.body, { headers }), row, folders, chrome);
}

async function handleArticleDownload(env: Env, slug: string, session: SessionUser, chrome: Chrome): Promise<Response> {
	if (!isValidSlug(slug)) {
		return notFoundPage(chrome);
	}
	const row = await getArticleViewBySlug(env, slug, session.id);
	if (!row || !canViewArticle(session, row)) {
		return notFoundPage(chrome);
	}

	const object = await env.ARTICLES.get(row.r2_key);
	if (!object) {
		return notFoundPage(chrome);
	}

	const headers = new Headers({
		'content-type': 'text/html; charset=utf-8',
		'content-disposition': htmlAttachmentDisposition(row.slug),
		'cache-control': 'private, no-store',
		'x-robots-tag': 'noindex, nofollow',
		'x-content-type-options': 'nosniff',
	});
	object.writeHttpMetadata(headers);
	headers.set('content-type', 'text/html; charset=utf-8');
	headers.set('content-disposition', htmlAttachmentDisposition(row.slug));
	if (object.httpEtag) {
		headers.set('etag', object.httpEtag);
	}

	return new Response(object.body, { headers });
}

function handlePrefCookie(request: Request, kind: 'lang' | 'theme'): Response {
	if (request.method !== 'GET') {
		return methodNotAllowed('GET');
	}
	const url = new URL(request.url);
	const next = safeNextPath(url.searchParams.get('next'));
	const location = new URL(next, url.origin).toString();
	let cookie: string | null = null;
	if (kind === 'lang') {
		const locale = parseLocaleParam(url.searchParams.get('set'));
		cookie = locale ? localeCookie(locale, url) : null;
	} else {
		const theme = parseThemeParam(url.searchParams.get('set'));
		cookie = theme ? themeCookie(theme, url) : null;
	}
	if (!cookie) {
		return Response.redirect(location, 302);
	}
	return new Response(null, {
		status: 302,
		headers: {
			location,
			'set-cookie': cookie,
			'cache-control': 'private, no-store',
		},
	});
}

async function handleThumbnail(env: Env, slug: string, session: SessionUser): Promise<Response> {
	if (!isValidSlug(slug)) {
		return new Response('Not Found', { status: 404, headers: { 'cache-control': 'private, no-store' } });
	}
	const row = await getArticleBySlug(env, slug);
	if (!row?.thumbnail_key || !canViewArticle(session, row)) {
		return new Response('Not Found', { status: 404, headers: { 'cache-control': 'private, no-store' } });
	}
	const object = await env.ARTICLES.get(row.thumbnail_key);
	if (!object) {
		return new Response('Not Found', { status: 404, headers: { 'cache-control': 'private, no-store' } });
	}
	const headers = new Headers({
		'cache-control': 'private, max-age=300',
		'x-robots-tag': 'noindex, nofollow',
		'x-content-type-options': 'nosniff',
	});
	object.writeHttpMetadata(headers);
	if (object.httpEtag) {
		headers.set('etag', object.httpEtag);
	}
	return new Response(object.body, { headers });
}

async function handleSettings(request: Request, env: Env, session: SessionUser): Promise<Response> {
	const chrome = ui(request, '/settings');
	const user = await getUserById(env, session.id);
	if (request.method === 'GET') {
		return settingsPage(chrome, session, user?.upload_token_prefix ?? null);
	}
	return methodNotAllowed('GET');
}

async function handleRotateOwnToken(request: Request, env: Env, session: SessionUser): Promise<Response> {
	if (request.method !== 'POST') {
		return methodNotAllowed('POST');
	}
	const chrome = ui(request, '/settings');
	const rotated = await rotateUploadToken(env, session.id);
	return settingsPage(chrome, session, rotated.user.upload_token_prefix, rotated.uploadToken);
}

async function handleAdminUsers(request: Request, env: Env, session: SessionUser): Promise<Response> {
	await requireAdmin(session);
	const chrome = ui(request, '/admin/users');
	if (request.method === 'GET') {
		return adminUsersPage(chrome, session, await listUsers(env));
	}
	if (request.method !== 'POST') {
		return methodNotAllowed('GET, POST');
	}
	const form = await request.formData();
	try {
		const created = await createUser(env, {
			username: String(form.get('username') ?? ''),
			password: String(form.get('password') ?? ''),
			role: String(form.get('role') ?? 'user') === 'admin' ? 'admin' : 'user',
		});
		return adminUsersPage(chrome, session, await listUsers(env), { username: created.user.username, token: created.uploadToken });
	} catch (error) {
		if (error instanceof HttpError) {
			return adminUsersPage(chrome, session, await listUsers(env), undefined, translateError(chrome.locale, error.message));
		}
		throw error;
	}
}

async function handleAdminUserAction(request: Request, env: Env, session: SessionUser, userId: string, action: string): Promise<Response> {
	await requireAdmin(session);
	const chrome = ui(request, '/admin/users');
	if (request.method !== 'POST') {
		return methodNotAllowed('POST');
	}
	try {
		if (action === 'delete') {
			await deleteUser(env, userId);
			if (userId === session.id) {
				const url = new URL(request.url);
				return signedRedirect(url, '/login', clearSessionCookie(url));
			}
			return adminUsersPage(chrome, session, await listUsers(env));
		}
		if (action === 'role') {
			const form = await request.formData();
			const role = String(form.get('role') ?? '') as UserRole;
			if (role !== 'user' && role !== 'admin') {
				throw new HttpError(400, 'Invalid role');
			}
			await setUserRole(env, userId, role);
			return adminUsersPage(chrome, session, await listUsers(env));
		}
		if (action === 'token') {
			const rotated = await rotateUploadToken(env, userId);
			return adminUsersPage(chrome, session, await listUsers(env), { username: rotated.user.username, token: rotated.uploadToken });
		}
		return notFoundPage(chrome);
	} catch (error) {
		if (error instanceof HttpError) {
			return adminUsersPage(chrome, session, await listUsers(env), undefined, translateError(chrome.locale, error.message));
		}
		throw error;
	}
}

function isPublicPath(pathname: string, method: string): boolean {
	if (pathname === '/health' || isSiteIconPath(pathname)) {
		return true;
	}
	if (pathname === '/login' && (method === 'GET' || method === 'POST')) {
		return true;
	}
	if (pathname === '/logout' && method === 'POST') {
		return true;
	}
	if (pathname === '/setup' && (method === 'GET' || method === 'POST')) {
		return true;
	}
	if ((pathname === '/lang' || pathname === '/theme') && method === 'GET') {
		return true;
	}
	return false;
}

function isWriteApi(pathname: string, method: string): boolean {
	if (pathname === '/api/upload' && method === 'POST') {
		return true;
	}
	if (method === 'DELETE' && /^\/api\/articles\/[^/]+$/.test(pathname)) {
		return true;
	}
	return false;
}

export default {
	async fetch(request, env): Promise<Response> {
		const url = new URL(request.url);
		const pathname = url.pathname;

		try {
			if (pathname === '/health') {
				return json({ ok: true });
			}
			const siteIcon = getSiteIcon(pathname);
			if (siteIcon) {
				if (request.method !== 'GET' && request.method !== 'HEAD') {
					return methodNotAllowed('GET, HEAD');
				}
				return siteIconResponse(siteIcon);
			}
			if (pathname === '/setup') {
				return await handleSetup(request, env);
			}
			if (pathname === '/login') {
				return await handleLogin(request, env);
			}
			if (pathname === '/logout') {
				return await handleLogout(request);
			}
			if (pathname === '/lang') {
				return handlePrefCookie(request, 'lang');
			}
			if (pathname === '/theme') {
				return handlePrefCookie(request, 'theme');
			}

			const session = await getSession(request, env);
			if (!isPublicPath(pathname, request.method) && !isWriteApi(pathname, request.method) && !session) {
				const empty = (await countUsers(env)) === 0;
				return unauthorized(request, new URL(empty ? '/setup' : '/login', url.origin).toString());
			}

			if (pathname === '/api/upload') {
				return await handleUpload(request, env);
			}

			const apiArticle = /^\/api\/articles\/([^/]+)$/.exec(pathname);
			if (apiArticle?.[1] && request.method === 'DELETE') {
				return await handleArticleApi(request, env, decodeURIComponent(apiArticle[1]), session);
			}

			if (!session && !isWriteApi(pathname, request.method)) {
				return unauthorized(request, new URL('/login', url.origin).toString());
			}

			if (pathname === '/api/articles') {
				return await handleArticlesCollection(request, env, url, session!);
			}
			if (pathname === '/api/tags') {
				return await handleTagsApi(request, env, url, session!);
			}
			if (apiArticle?.[1]) {
				return await handleArticleApi(request, env, decodeURIComponent(apiArticle[1]), session);
			}

			if (pathname === '/') {
				if (request.method !== 'GET') {
					return methodNotAllowed('GET');
				}
				const q = url.searchParams.get('q')?.trim() ?? '';
				const tags = parseTagQuery(url);
				const mine = session!.role === 'admin' && url.searchParams.get('mine') === '1';
				const ownerId = session!.role === 'admin' && !mine ? undefined : session!.id;
				const activeTag = tags[0] ?? null;
				const starred = url.searchParams.get('starred') === '1';
				const activeFolderId = parseFolderQuery(url);
				const requestedSort = parseArticleSort(url.searchParams.get('sort'));
				const sort = resolveArticleSort(request, url);
				const [rows, allTags, folders] = await Promise.all([
					listArticles(env, {
						q: q || undefined,
						tags: activeTag ? [activeTag] : undefined,
						ownerId,
						folderId: activeFolderId ?? undefined,
						starred: starred || undefined,
						viewerId: session!.id,
						sort,
					}),
					listTags(env, ownerId),
					listFolders(env, session!.id),
				]);
				const response = listPage(ui(request), {
					articles: rows,
					tags: allTags,
					folders,
					query: q,
					activeTag,
					activeFolderId,
					starred,
					viewer: session!,
					mine,
					sort,
				});
				if (requestedSort) {
					response.headers.append('set-cookie', sortCookie(requestedSort, url));
				}
				return response;
			}

			if (pathname === '/star') {
				return await handleStar(request, env, session!);
			}
			if (pathname === '/folders/membership') {
				return await handleFolderMembership(request, env, session!);
			}
			if (pathname === '/folders') {
				return await handleFolders(request, env, session!);
			}
			const folderAction = /^\/folders\/([^/]+)\/(rename|delete|move)$/.exec(pathname);
			if (folderAction?.[1] && folderAction[2]) {
				return await handleFolderAction(request, env, session!, decodeURIComponent(folderAction[1]), folderAction[2]);
			}

			if (pathname === '/settings') {
				return await handleSettings(request, env, session!);
			}
			if (pathname === '/settings/token') {
				return await handleRotateOwnToken(request, env, session!);
			}
			if (pathname === '/admin/users') {
				if (!session || session.role !== 'admin') {
					return forbiddenPage(ui(request));
				}
				return await handleAdminUsers(request, env, session);
			}
			const adminAction = /^\/admin\/users\/([^/]+)\/(delete|role|token)$/.exec(pathname);
			if (adminAction?.[1] && adminAction[2]) {
				if (!session || session.role !== 'admin') {
					return forbiddenPage(ui(request));
				}
				return await handleAdminUserAction(request, env, session, decodeURIComponent(adminAction[1]), adminAction[2]);
			}

			const thumbPage = /^\/thumb\/([^/]+)$/.exec(pathname);
			if (thumbPage?.[1]) {
				if (request.method !== 'GET') {
					return methodNotAllowed('GET');
				}
				return await handleThumbnail(env, decodeURIComponent(thumbPage[1]), session!);
			}

			const articleDownload = /^\/a\/([^/]+)\/download$/.exec(pathname);
			if (articleDownload?.[1]) {
				if (request.method !== 'GET') {
					return methodNotAllowed('GET');
				}
				const slug = decodeURIComponent(articleDownload[1]);
				return await handleArticleDownload(env, slug, session!, ui(request, `/a/${encodeURIComponent(slug)}`));
			}

			const articlePage = /^\/a\/([^/]+)$/.exec(pathname);
			if (articlePage?.[1]) {
				if (request.method !== 'GET') {
					return methodNotAllowed('GET');
				}
				const slug = decodeURIComponent(articlePage[1]);
				return await handleArticlePage(env, slug, session!, ui(request, `/a/${encodeURIComponent(slug)}`));
			}

			if (isApiPath(pathname)) {
				return jsonError(404, 'not found');
			}
			return notFoundPage(ui(request));
		} catch (error) {
			if (error instanceof HttpError) {
				if (error.status === 404 && !isApiPath(pathname)) {
					return notFoundPage(ui(request));
				}
				return jsonError(error.status, error.message);
			}
			if (error instanceof SyntaxError) {
				return jsonError(400, 'Invalid JSON');
			}
			console.error('Unhandled worker error', error);
			return jsonError(500, 'internal error');
		}
	},
} satisfies ExportedHandler<Env>;
