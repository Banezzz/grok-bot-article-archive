import { env, SELF } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

const LEGACY_UPLOAD_TOKEN = 'dev-upload-token-change-me';
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'admin-pass-123';
const READER_USER = 'reader';
const READER_PASS = 'reader-pass-123';

function cookieFrom(response: Response): string {
	const raw = response.headers.getSetCookie?.() ?? [];
	const session = raw.find((value) => value.startsWith('archive_session='));
	if (!session) {
		throw new Error('missing session cookie');
	}
	return session.split(';', 1)[0] ?? '';
}

function tokenFromHtml(html: string): string {
	const match = html.match(/<code class="token">([^<]+)<\/code>/);
	if (!match?.[1]) {
		throw new Error('missing one-time upload token');
	}
	return match[1];
}

async function setupAdmin(username = ADMIN_USER, password = ADMIN_PASS): Promise<{ cookie: string; token: string }> {
	const response = await SELF.fetch('http://example.com/setup', {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({ username, password, confirm: password }),
		redirect: 'manual',
	});
	expect(response.status).toBe(200);
	return { cookie: cookieFrom(response), token: tokenFromHtml(await response.text()) };
}

async function login(username: string, password: string): Promise<string> {
	const response = await SELF.fetch('http://example.com/login', {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({ username, password, next: '/' }),
		redirect: 'manual',
	});
	expect(response.status).toBe(303);
	return cookieFrom(response);
}

async function addUser(adminCookie: string, username: string, password: string, role = 'user'): Promise<string> {
	const response = await SELF.fetch('http://example.com/admin/users', {
		method: 'POST',
		headers: {
			cookie: adminCookie,
			'content-type': 'application/x-www-form-urlencoded',
		},
		body: new URLSearchParams({ username, password, role }),
	});
	expect(response.status).toBe(200);
	return tokenFromHtml(await response.text());
}

function checkedFolderIds(html: string): string[] {
	return [...html.matchAll(/<input type="checkbox" name="folder_id" value="([^"]+)"([^>]*)>/g)]
		.filter((match) => /\bchecked\b/.test(match[2] ?? ''))
		.map((match) => match[1] ?? '');
}

async function upload(token: string, overrides: Record<string, unknown> = {}) {
	return SELF.fetch('http://example.com/api/upload', {
		method: 'POST',
		headers: {
			authorization: `Bearer ${token}`,
			'content-type': 'application/json',
		},
		body: JSON.stringify({
			title: 'Bilingual garden notes',
			source_url: 'https://example.com/garden',
			author: 'Ada',
			lang: 'en',
			html: '<!doctype html><html><head><title>Garden</title></head><body><h1>Garden</h1><p lang="zh">花园</p></body></html>',
			...overrides,
		}),
	});
}

describe('article archive worker', () => {
	beforeEach(async () => {
		await env.DB.prepare('DELETE FROM folder_articles').run();
		await env.DB.prepare('DELETE FROM article_stars').run();
		await env.DB.prepare('DELETE FROM folders').run();
		await env.DB.prepare('DELETE FROM article_tags').run();
		await env.DB.prepare('DELETE FROM articles').run();
		await env.DB.prepare('DELETE FROM users').run();
	});

	it('exposes a public health check', async () => {
		const response = await SELF.fetch('http://example.com/health');
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true });
	});

	it('serves the default favicon without a session', async () => {
		const svg = await SELF.fetch('http://example.com/favicon.svg');
		expect(svg.status).toBe(200);
		expect(svg.headers.get('content-type')).toContain('image/svg+xml');
		expect(svg.headers.get('cache-control')).toContain('public');
		const svgText = await svg.text();
		expect(svgText).toContain('<svg');
		expect(svgText).toContain('#0c6a52');

		const ico = await SELF.fetch('http://example.com/favicon.ico');
		expect(ico.status).toBe(200);
		expect(ico.headers.get('content-type')).toContain('image/x-icon');
		expect((await ico.arrayBuffer()).byteLength).toBeGreaterThan(0);

		const apple = await SELF.fetch('http://example.com/apple-touch-icon.png');
		expect(apple.status).toBe(200);
		expect(apple.headers.get('content-type')).toContain('image/png');
		expect((await apple.arrayBuffer()).byteLength).toBeGreaterThan(0);
	});

	it('includes favicon links on setup, login, and home', async () => {
		const iconLinks = [
			'<link rel="icon" href="/favicon.svg" type="image/svg+xml">',
			'<link rel="icon" href="/favicon.ico" sizes="any">',
			'<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
		];

		const setup = await SELF.fetch('http://example.com/setup');
		expect(setup.status).toBe(200);
		const setupHtml = await setup.text();
		for (const link of iconLinks) {
			expect(setupHtml).toContain(link);
		}

		const { cookie } = await setupAdmin();
		const login = await SELF.fetch('http://example.com/login', { redirect: 'manual' });
		expect(login.status).toBe(200);
		const loginHtml = await login.text();
		for (const link of iconLinks) {
			expect(loginHtml).toContain(link);
		}

		const home = await SELF.fetch('http://example.com/', { headers: { cookie } });
		expect(home.status).toBe(200);
		const homeHtml = await home.text();
		for (const link of iconLinks) {
			expect(homeHtml).toContain(link);
		}
	});

	it('redirects the list to setup when no users exist', async () => {
		const response = await SELF.fetch('http://example.com/', { redirect: 'manual' });
		expect(response.status).toBe(302);
		expect(response.headers.get('location')).toContain('/setup');
	});

	it('returns JSON 401 for API reads without a session', async () => {
		const response = await SELF.fetch('http://example.com/api/articles');
		expect(response.status).toBe(401);
	});

	it('rejects upload without a bearer token', async () => {
		const response = await SELF.fetch('http://example.com/api/upload', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ title: 'x', source_url: 'https://example.com', html: '<p>x</p>' }),
		});
		expect(response.status).toBe(401);
	});

	it('creates the first admin, assigns orphan articles, then closes setup', async () => {
		const now = new Date().toISOString();
		await env.DB.prepare(
			`INSERT INTO articles (id, slug, title, source_url, created_at, updated_at, r2_key)
			 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		)
			.bind('orphan-1', 'orphan-article', 'Orphan', 'https://example.com/orphan', now, now, 'articles/orphan-article.html')
			.run();

		const { cookie, token } = await setupAdmin();
		expect(token.length).toBeGreaterThan(20);

		const assigned = await env.DB.prepare('SELECT owner_id FROM articles WHERE slug = ?').bind('orphan-article').first<{ owner_id: string }>();
		expect(assigned?.owner_id).toBeTruthy();

		expect((await SELF.fetch('http://example.com/setup')).status).toBe(404);
		expect((await login(ADMIN_USER, ADMIN_PASS)).startsWith('archive_session=')).toBe(true);

		const list = await SELF.fetch('http://example.com/api/articles', { headers: { cookie } });
		const body = (await list.json()) as { articles: Array<{ slug: string }> };
		expect(body.articles.map((row) => row.slug)).toContain('orphan-article');
	});

	it('ignores the env upload token after user tokens exist', async () => {
		await setupAdmin();
		const response = await upload(LEGACY_UPLOAD_TOKEN, { slug: 'legacy-should-fail' });
		expect(response.status).toBe(401);
	});

	it('logs in, uploads with the user token, lists, reads, searches, and deletes', async () => {
		const { cookie, token } = await setupAdmin();

		const created = await upload(token, { slug: 'garden-notes' });
		expect(created.status).toBe(200);
		expect(await created.json()).toMatchObject({
			ok: true,
			slug: 'garden-notes',
			url: '/a/garden-notes',
			owner_username: ADMIN_USER,
		});

		const list = await SELF.fetch('http://example.com/api/articles', { headers: { cookie } });
		const listBody = (await list.json()) as { articles: Array<{ slug: string }> };
		expect(listBody.articles.some((row) => row.slug === 'garden-notes')).toBe(true);

		const search = await SELF.fetch('http://example.com/api/articles?q=Ada', { headers: { cookie } });
		const searchBody = (await search.json()) as { articles: Array<{ slug: string }> };
		expect(searchBody.articles.map((row) => row.slug)).toContain('garden-notes');

		expect((await SELF.fetch('http://example.com/api/articles/garden-notes', { headers: { cookie } })).status).toBe(200);

		const page = await SELF.fetch('http://example.com/a/garden-notes', { headers: { cookie } });
		expect(page.status).toBe(200);
		expect(await page.text()).toContain('Garden');

		const removed = await SELF.fetch('http://example.com/api/articles/garden-notes', {
			method: 'DELETE',
			headers: { authorization: `Bearer ${token}` },
		});
		expect(removed.status).toBe(200);
		expect((await SELF.fetch('http://example.com/api/articles/garden-notes', { headers: { cookie } })).status).toBe(404);
	});

	it('scopes articles so a regular user cannot see another owner', async () => {
		const admin = await setupAdmin();
		const readerToken = await addUser(admin.cookie, READER_USER, READER_PASS);
		const readerCookie = await login(READER_USER, READER_PASS);

		expect((await upload(admin.token, { slug: 'admin-only', title: 'Admin secret' })).status).toBe(200);
		expect((await upload(readerToken, { slug: 'reader-only', title: 'Reader note' })).status).toBe(200);

		const readerList = (await (
			await SELF.fetch('http://example.com/api/articles', { headers: { cookie: readerCookie } })
		).json()) as { articles: Array<{ slug: string }> };
		expect(readerList.articles.map((row) => row.slug)).toEqual(['reader-only']);

		expect((await SELF.fetch('http://example.com/a/admin-only', { headers: { cookie: readerCookie } })).status).toBe(404);
		expect((await SELF.fetch('http://example.com/api/articles/admin-only', { headers: { cookie: readerCookie } })).status).toBe(404);

		const adminList = (await (
			await SELF.fetch('http://example.com/api/articles', { headers: { cookie: admin.cookie } })
		).json()) as { articles: Array<{ slug: string }> };
		expect(adminList.articles.map((row) => row.slug).sort()).toEqual(['admin-only', 'reader-only']);

		const mine = (await (
			await SELF.fetch('http://example.com/api/articles?mine=1', { headers: { cookie: admin.cookie } })
		).json()) as { articles: Array<{ slug: string }> };
		expect(mine.articles.map((row) => row.slug)).toEqual(['admin-only']);
	});

	it('refuses to demote or delete the last admin', async () => {
		const { cookie } = await setupAdmin();
		const usersPage = await SELF.fetch('http://example.com/admin/users', { headers: { cookie } });
		const html = await usersPage.text();
		const idMatch = html.match(/action="\/admin\/users\/([^/]+)\/role"/);
		expect(idMatch?.[1]).toBeTruthy();
		const adminId = idMatch?.[1] ?? '';

		const demote = await SELF.fetch(`http://example.com/admin/users/${adminId}/role`, {
			method: 'POST',
			headers: { cookie: `${cookie}; archive_lang=en`, 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ role: 'user' }),
		});
		expect(await demote.text()).toContain('Cannot demote the last remaining admin.');

		const removed = await SELF.fetch(`http://example.com/admin/users/${adminId}/delete`, {
			method: 'POST',
			headers: { cookie: `${cookie}; archive_lang=en` },
		});
		expect(await removed.text()).toContain('Cannot delete the last remaining admin.');
	});

	it('stores summary, tags, and a base64 thumbnail', async () => {
		const { cookie, token } = await setupAdmin();
		const png =
			'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
		const created = await upload(token, {
			slug: 'tagged-note',
			summary_zh: '花园笔记的中文摘要。',
			tags: ['ai', 'programming', 'custom-topic'],
			thumbnail_base64: png,
		});
		expect(created.status).toBe(200);
		const body = (await created.json()) as { thumbnail_url: string; tags: Array<{ slug: string }> };
		expect(body.thumbnail_url).toBe('/thumb/tagged-note');
		expect(body.tags.map((tag) => tag.slug).sort()).toEqual(['ai', 'custom-topic', 'programming']);

		const filtered = await SELF.fetch('http://example.com/api/articles?tag=ai', { headers: { cookie } });
		expect(((await filtered.json()) as { articles: Array<{ slug: string }> }).articles.map((row) => row.slug)).toContain('tagged-note');

		expect((await SELF.fetch('http://example.com/thumb/tagged-note', { redirect: 'manual' })).status).toBe(302);
		const thumb = await SELF.fetch('http://example.com/thumb/tagged-note', { headers: { cookie } });
		expect(thumb.status).toBe(200);
		expect(thumb.headers.get('content-type')).toContain('image/png');
	});

	it('rejects oversized uploads from Content-Length', async () => {
		const { token } = await setupAdmin();
		const response = await SELF.fetch('http://example.com/api/upload', {
			method: 'POST',
			headers: {
				authorization: `Bearer ${token}`,
				'content-type': 'application/json',
				'content-length': String(9 * 1024 * 1024),
			},
			body: '{}',
		});
		expect(response.status).toBe(413);
	});

	it('keeps POST /api/upload response keys unchanged', async () => {
		const { token } = await setupAdmin();
		const created = await upload(token, { slug: 'upload-shape' });
		expect(created.status).toBe(200);
		const body = (await created.json()) as Record<string, unknown>;
		expect(Object.keys(body).sort()).toEqual(['ok', 'owner_username', 'slug', 'summary_zh', 'tags', 'thumbnail_url', 'url']);
		expect(body.ok).toBe(true);
		expect(body.slug).toBe('upload-shape');
	});

	it('creates, renames, reorders, and deletes per-user folders', async () => {
		const { cookie } = await setupAdmin();
		const created = await SELF.fetch('http://example.com/folders', {
			method: 'POST',
			headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ name: 'Later' }),
		});
		expect(created.status).toBe(200);
		expect(await created.text()).toContain('Later');

		await SELF.fetch('http://example.com/folders', {
			method: 'POST',
			headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ name: 'Work' }),
		});

		const page = await SELF.fetch('http://example.com/folders', { headers: { cookie } });
		const html = await page.text();
		const ids = [...html.matchAll(/action="\/folders\/([^/]+)\/rename"/g)].map((match) => match[1]);
		expect(ids).toHaveLength(2);
		const [laterId, workId] = ids;

		const renamed = await SELF.fetch(`http://example.com/folders/${laterId}/rename`, {
			method: 'POST',
			headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ name: 'Read later' }),
		});
		expect(await renamed.text()).toContain('Read later');

		const moved = await SELF.fetch(`http://example.com/folders/${workId}/move`, {
			method: 'POST',
			headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ direction: 'up' }),
		});
		const movedHtml = await moved.text();
		const movedIds = [...movedHtml.matchAll(/action="\/folders\/([^/]+)\/rename"/g)].map((match) => match[1]);
		expect(movedIds).toEqual([workId, laterId]);

		const removed = await SELF.fetch(`http://example.com/folders/${workId}/delete`, {
			method: 'POST',
			headers: { cookie },
		});
		const removedHtml = await removed.text();
		expect(removedHtml).not.toContain(workId);
		expect(removedHtml).toContain('Read later');
	});

	it('stars articles and filters by starred and folder together', async () => {
		const { cookie, token } = await setupAdmin();
		expect((await upload(token, { slug: 'alpha-note', title: 'Alpha' })).status).toBe(200);
		expect((await upload(token, { slug: 'beta-note', title: 'Beta' })).status).toBe(200);

		const foldersPage = await SELF.fetch('http://example.com/folders', {
			method: 'POST',
			headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ name: 'Inbox' }),
		});
		const folderId = (await foldersPage.text()).match(/action="\/folders\/([^/]+)\/rename"/)?.[1];
		expect(folderId).toBeTruthy();

		const starred = await SELF.fetch('http://example.com/star', {
			method: 'POST',
			headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ slug: 'alpha-note', next: '/' }),
			redirect: 'manual',
		});
		expect(starred.status).toBe(303);

		const membership = await SELF.fetch('http://example.com/folders/membership', {
			method: 'POST',
			headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ slug: 'alpha-note', next: '/', folder_id: folderId ?? '' }),
			redirect: 'manual',
		});
		expect(membership.status).toBe(303);

		const list = await SELF.fetch('http://example.com/?starred=1', { headers: { cookie } });
		const listHtml = await list.text();
		expect(listHtml).toContain('alpha-note');
		expect(listHtml).not.toContain('beta-note');

		const combined = await SELF.fetch(`http://example.com/?starred=1&folder=${folderId}`, { headers: { cookie } });
		const combinedHtml = await combined.text();
		expect(combinedHtml).toContain('alpha-note');
		expect(combinedHtml).not.toContain('beta-note');

		const api = (await (
			await SELF.fetch(`http://example.com/api/articles?starred=1&folder=${folderId}`, { headers: { cookie } })
		).json()) as { articles: Array<{ slug: string; starred: boolean }> };
		expect(api.articles.map((row) => row.slug)).toEqual(['alpha-note']);
		expect(api.articles[0]?.starred).toBe(true);
	});

	it('keeps folders and stars private to each user', async () => {
		const admin = await setupAdmin();
		const readerToken = await addUser(admin.cookie, READER_USER, READER_PASS);
		const readerCookie = await login(READER_USER, READER_PASS);
		expect((await upload(admin.token, { slug: 'admin-star', title: 'Admin star' })).status).toBe(200);
		expect((await upload(readerToken, { slug: 'reader-star', title: 'Reader star' })).status).toBe(200);

		await SELF.fetch('http://example.com/folders', {
			method: 'POST',
			headers: { cookie: admin.cookie, 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ name: 'Admin box' }),
		});
		const readerFolders = await SELF.fetch('http://example.com/folders', {
			method: 'POST',
			headers: { cookie: readerCookie, 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ name: 'Reader box' }),
		});
		const readerFolderHtml = await readerFolders.text();
		expect(readerFolderHtml).toContain('Reader box');
		expect(readerFolderHtml).not.toContain('Admin box');

		await SELF.fetch('http://example.com/star', {
			method: 'POST',
			headers: { cookie: admin.cookie, 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ slug: 'admin-star', next: '/' }),
			redirect: 'manual',
		});

		const readerStarred = await SELF.fetch('http://example.com/?starred=1', {
			headers: { cookie: `${readerCookie}; archive_lang=en` },
		});
		const readerHtml = await readerStarred.text();
		expect(readerHtml).not.toContain('admin-star');
		expect(readerHtml).toContain('No starred articles yet.');
	});

	it('sets a theme cookie and marks the document on later pages', async () => {
		const { cookie } = await setupAdmin();
		const setTheme = await SELF.fetch('http://example.com/theme?set=dark&next=/settings', { redirect: 'manual' });
		expect(setTheme.status).toBe(302);
		expect(setTheme.headers.get('location')).toContain('/settings');
		const themeCookie = (setTheme.headers.getSetCookie?.() ?? []).find((value) => value.startsWith('archive_theme='));
		expect(themeCookie).toMatch(/^archive_theme=dark\b/);

		const settings = await SELF.fetch('http://example.com/settings', {
			headers: { cookie: `${cookie}; archive_theme=dark; archive_lang=en` },
		});
		const html = await settings.text();
		expect(html).toContain('data-theme="dark"');
		expect(html).toContain('theme-switch');
		expect(html).toContain('Light');
		expect(html).toContain('Dark');
		expect(html).toContain('href="/theme?set=light&amp;next=%2Fsettings"');
	});

	it('shows a back-to-archive trail on folders, settings, and users', async () => {
		const { cookie } = await setupAdmin();
		const headers = { cookie: `${cookie}; archive_lang=en` };

		const folders = await (await SELF.fetch('http://example.com/folders', { headers })).text();
		expect(folders).toContain('← Archive');
		expect(folders).toContain('href="/"');
		expect(folders).toContain('aria-current="page">Folders');

		const settings = await (await SELF.fetch('http://example.com/settings', { headers })).text();
		expect(settings).toContain('← Archive');
		expect(settings).toContain('aria-current="page">Settings');

		const users = await (await SELF.fetch('http://example.com/admin/users', { headers })).text();
		expect(users).toContain('← Archive');
		expect(users).toContain('aria-current="page">Users');
	});

	it('renders a custom folder multi-select on list cards and article chrome', async () => {
		const { cookie, token } = await setupAdmin();
		expect((await upload(token, { slug: 'folder-ui', title: 'Folder UI' })).status).toBe(200);
		const created = await SELF.fetch('http://example.com/folders', {
			method: 'POST',
			headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ name: '灵感' }),
		});
		expect(created.status).toBe(200);

		const list = await SELF.fetch('http://example.com/', {
			headers: { cookie: `${cookie}; archive_theme=dark; archive_lang=zh` },
		});
		const listHtml = await list.text();
		expect(listHtml).toContain('data-folder-picker');
		expect(listHtml).toContain('加入文件夹 · 已选 0');
		expect(listHtml).toContain('name="folder_id"');
		expect(listHtml).toContain('灵感');
		expect(listHtml).toContain('>应用<');
		expect(listHtml).toContain('>取消<');
		expect(listHtml).not.toMatch(/<select[^>]*name="folder_id"/);
		expect(listHtml).toContain('data-archive-folder-picker-script');

		const page = await SELF.fetch('http://example.com/a/folder-ui', {
			headers: { cookie: `${cookie}; archive_theme=dark; archive_lang=en` },
		});
		const html = await page.text();
		expect(html).toContain('data-folder-picker');
		expect(html).toContain('data-folder-picker-variant="chrome"');
		expect(html).toContain('Add to folders · 0 selected');
		expect(html).toContain('Choose folders');
		expect(html).toContain('>Apply<');
		expect(html).toContain('>Cancel<');
		expect(html).toContain('灵感');
		expect(html).toContain('name="folder_id"');
		expect(html).toContain('type="checkbox"');
		expect(html).not.toMatch(/<select[^>]*name="folder_id"/);
		expect(html).toContain('data-archive-folder-picker');
		expect(html).toContain('#221e1a');
		expect(html).toContain('#f4f1ea');
	});

	it('adds and removes folder membership in one POST', async () => {
		const { cookie, token } = await setupAdmin();
		expect((await upload(token, { slug: 'multi-fold', title: 'Multi fold' })).status).toBe(200);
		await SELF.fetch('http://example.com/folders', {
			method: 'POST',
			headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ name: 'Inbox' }),
		});
		await SELF.fetch('http://example.com/folders', {
			method: 'POST',
			headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ name: 'Later' }),
		});
		const foldersPage = await SELF.fetch('http://example.com/folders', { headers: { cookie } });
		const ids = [...(await foldersPage.text()).matchAll(/action="\/folders\/([^/]+)\/rename"/g)].map((match) => match[1]);
		expect(ids).toHaveLength(2);
		const [inboxId, laterId] = ids;

		const addBoth = new URLSearchParams({ slug: 'multi-fold', next: '/a/multi-fold' });
		addBoth.append('folder_id', inboxId ?? '');
		addBoth.append('folder_id', laterId ?? '');
		const added = await SELF.fetch('http://example.com/folders/membership', {
			method: 'POST',
			headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
			body: addBoth,
			redirect: 'manual',
		});
		expect(added.status).toBe(303);

		const afterAdd = await (await SELF.fetch('http://example.com/a/multi-fold', { headers: { cookie: `${cookie}; archive_lang=en` } })).text();
		expect(afterAdd).toContain('Add to folders · 2 selected');
		expect(checkedFolderIds(afterAdd).sort()).toEqual([inboxId, laterId].sort());

		const keepInbox = new URLSearchParams({ slug: 'multi-fold', next: '/' });
		keepInbox.append('folder_id', inboxId ?? '');
		const removed = await SELF.fetch('http://example.com/folders/membership', {
			method: 'POST',
			headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
			body: keepInbox,
			redirect: 'manual',
		});
		expect(removed.status).toBe(303);

		const list = await (await SELF.fetch('http://example.com/', { headers: { cookie: `${cookie}; archive_lang=en` } })).text();
		expect(list).toContain('Add to folders · 1 selected');
		expect(checkedFolderIds(list)).toEqual([inboxId]);

		const laterOnly = await (await SELF.fetch(`http://example.com/?folder=${laterId}`, { headers: { cookie } })).text();
		expect(laterOnly).not.toContain('multi-fold');
		const inboxOnly = await (await SELF.fetch(`http://example.com/?folder=${inboxId}`, { headers: { cookie } })).text();
		expect(inboxOnly).toContain('multi-fold');
	});

	it('sorts the home list and JSON API by joined or published time', async () => {
		const { cookie, token } = await setupAdmin();
		expect(
			(
				await upload(token, {
					slug: 'old-pub-new-join',
					title: 'Old pub new join',
					published_at: '2020-01-01T00:00:00.000Z',
					tags: ['ai'],
				})
			).status,
		).toBe(200);
		expect(
			(
				await upload(token, {
					slug: 'new-pub-old-join',
					title: 'New pub old join',
					published_at: '2025-06-01T00:00:00.000Z',
					tags: ['programming'],
				})
			).status,
		).toBe(200);
		expect((await upload(token, { slug: 'no-pub-mid-join', title: 'No pub mid join', tags: ['ai'] })).status).toBe(200);

		await env.DB.prepare('UPDATE articles SET created_at = ? WHERE slug = ?').bind('2026-09-17T12:00:00.000Z', 'old-pub-new-join').run();
		await env.DB.prepare('UPDATE articles SET created_at = ? WHERE slug = ?').bind('2024-01-01T12:00:00.000Z', 'new-pub-old-join').run();
		await env.DB.prepare('UPDATE articles SET created_at = ?, published_at = NULL WHERE slug = ?')
			.bind('2025-01-01T12:00:00.000Z', 'no-pub-mid-join')
			.run();

		const headers = { cookie: `${cookie}; archive_lang=en` };
		const slugsOf = (body: { articles: Array<{ slug: string }> }) => body.articles.map((row) => row.slug);

		const defaultList = (await (await SELF.fetch('http://example.com/api/articles', { headers })).json()) as {
			articles: Array<{ slug: string }>;
		};
		expect(slugsOf(defaultList)).toEqual(['old-pub-new-join', 'no-pub-mid-join', 'new-pub-old-join']);

		const joined = (await (await SELF.fetch('http://example.com/api/articles?sort=joined', { headers })).json()) as {
			articles: Array<{ slug: string }>;
		};
		expect(slugsOf(joined)).toEqual(['old-pub-new-join', 'no-pub-mid-join', 'new-pub-old-join']);

		const published = (await (await SELF.fetch('http://example.com/api/articles?sort=published', { headers })).json()) as {
			articles: Array<{ slug: string }>;
		};
		expect(slugsOf(published)).toEqual(['new-pub-old-join', 'no-pub-mid-join', 'old-pub-new-join']);

		const aliasJoined = (await (await SELF.fetch('http://example.com/api/articles?sort=created_at', { headers })).json()) as {
			articles: Array<{ slug: string }>;
		};
		expect(slugsOf(aliasJoined)).toEqual(['old-pub-new-join', 'no-pub-mid-join', 'new-pub-old-join']);

		const aliasPublished = (await (await SELF.fetch('http://example.com/api/articles?sort=published_at', { headers })).json()) as {
			articles: Array<{ slug: string }>;
		};
		expect(slugsOf(aliasPublished)).toEqual(['new-pub-old-join', 'no-pub-mid-join', 'old-pub-new-join']);

		const cookieSort = (await (
			await SELF.fetch('http://example.com/api/articles', { headers: { cookie: `${cookie}; archive_sort=published` } })
		).json()) as { articles: Array<{ slug: string }> };
		expect(slugsOf(cookieSort)).toEqual(['new-pub-old-join', 'no-pub-mid-join', 'old-pub-new-join']);

		const filtered = (await (
			await SELF.fetch('http://example.com/api/articles?sort=published&tag=ai', { headers })
		).json()) as { articles: Array<{ slug: string }> };
		expect(slugsOf(filtered)).toEqual(['no-pub-mid-join', 'old-pub-new-join']);

		const search = (await (await SELF.fetch('http://example.com/api/articles?sort=joined&q=Old+pub+new', { headers })).json()) as {
			articles: Array<{ slug: string }>;
		};
		expect(slugsOf(search)).toEqual(['old-pub-new-join']);

		const page = await SELF.fetch('http://example.com/?sort=published', { headers });
		expect(page.status).toBe(200);
		const html = await page.text();
		expect(html).toContain('sort-switch');
		expect(html).toContain('Join time');
		expect(html).toContain('Article time');
		expect(html).toContain('name="sort" value="published"');
		expect(html).toContain('href="/?sort=joined"');
		expect(html).toContain('href="/?tag=ai&amp;sort=published"');
		const listed = [...html.matchAll(/class="card"[\s\S]*?href="\/a\/([^"]+)"/g)].map((match) => match[1]);
		expect(listed).toEqual(['new-pub-old-join', 'no-pub-mid-join', 'old-pub-new-join']);
		const setCookie = page.headers.getSetCookie?.() ?? [];
		expect(setCookie.some((value) => value.startsWith('archive_sort=published'))).toBe(true);

		const zhPage = await SELF.fetch('http://example.com/?sort=joined', {
			headers: { cookie: `${cookie}; archive_lang=zh` },
		});
		const zhHtml = await zhPage.text();
		expect(zhHtml).toContain('加入时间');
		expect(zhHtml).toContain('文章时间');
		const zhListed = [...zhHtml.matchAll(/class="card"[\s\S]*?href="\/a\/([^"]+)"/g)].map((match) => match[1]);
		expect(zhListed).toEqual(['old-pub-new-join', 'no-pub-mid-join', 'new-pub-old-join']);
	});

	it('keeps a back-to-archive control on article chrome', async () => {
		const { cookie, token } = await setupAdmin();
		expect((await upload(token, { slug: 'chrome-note', title: 'Chrome note' })).status).toBe(200);
		const page = await SELF.fetch('http://example.com/a/chrome-note', {
			headers: { cookie: `${cookie}; archive_lang=en` },
		});
		const html = await page.text();
		expect(html).toContain('← Archive');
		expect(html).toContain('href="/"');
		expect(html).toContain('/theme?set=light');
	});

	it('injects an image lightbox on article and list pages without rewriting stored HTML', async () => {
		const { cookie, token } = await setupAdmin();
		const png =
			'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
		const storedHtml =
			'<!doctype html><html><head><title>Photo note</title></head><body><h1>Photo note</h1><p><img src="' +
			png +
			'" alt="Garden photo" width="640" height="400"></p></body></html>';
		expect(
			(
				await upload(token, {
					slug: 'photo-note',
					title: 'Photo note',
					html: storedHtml,
					thumbnail_base64: png,
				})
			).status,
		).toBe(200);

		const object = await env.ARTICLES.get('articles/photo-note.html');
		expect(object).toBeTruthy();
		const raw = await object!.text();
		expect(raw).toBe(storedHtml);
		expect(raw).not.toContain('archive-lightbox');

		const download = await SELF.fetch('http://example.com/a/photo-note/download', {
			headers: { cookie: `${cookie}; archive_lang=en` },
		});
		expect(download.status).toBe(200);
		const downloaded = await download.text();
		expect(downloaded).toBe(storedHtml);
		expect(downloaded).not.toContain('archive-lightbox');

		const page = await SELF.fetch('http://example.com/a/photo-note', {
			headers: { cookie: `${cookie}; archive_theme=dark; archive_lang=en` },
		});
		expect(page.status).toBe(200);
		const html = await page.text();
		expect(html).toContain('id="archive-lightbox"');
		expect(html).toContain('aria-modal="true"');
		expect(html).toContain('aria-labelledby="archive-lightbox-title"');
		expect(html).toContain('Image preview');
		expect(html).toContain('>Close<');
		expect(html).toContain('data-theme="dark"');
		expect(html).toContain('data-archive-lightbox');
		expect(html).toContain('Garden photo');
		expect(html).toContain('archive-lightbox-close');

		const zhPage = await SELF.fetch('http://example.com/a/photo-note', {
			headers: { cookie: `${cookie}; archive_lang=zh` },
		});
		const zhHtml = await zhPage.text();
		expect(zhHtml).toContain('图片预览');
		expect(zhHtml).toContain('>关闭<');

		const list = await SELF.fetch('http://example.com/', {
			headers: { cookie: `${cookie}; archive_lang=en` },
		});
		const listHtml = await list.text();
		expect(listHtml).toContain('id="archive-lightbox"');
		expect(listHtml).toContain('class="thumb-zoom"');
		expect(listHtml).toContain('View larger image');
		expect(listHtml).toContain(`/thumb/photo-note`);
		expect(listHtml).toContain('href="/a/photo-note"');
	});
});
