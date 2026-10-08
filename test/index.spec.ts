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

	it('injects a theme override so stored article colors follow the site toggle', async () => {
		const { cookie, token } = await setupAdmin();
		const storedHtml = `<!doctype html><html><head><title>Hardcoded dark</title><style>
body { background:#050505; color:#161616; }
main { background:#000; }
.en { color:#1b1b1b; }
.zh { color:#111; }
a { color:#0b3d2e; }
</style></head><body><main><section class="pair"><p class="zh" lang="zh">中文段落</p><p class="en" lang="en">English paragraph</p></section><p><a href="https://example.com/source">source</a></p></main></body></html>`;
		expect((await upload(token, { slug: 'hardcoded-theme', title: 'Hardcoded dark', html: storedHtml })).status).toBe(200);

		const light = await SELF.fetch('http://example.com/a/hardcoded-theme', {
			headers: { cookie: `${cookie}; archive_theme=light; archive_lang=en` },
		});
		expect(light.status).toBe(200);
		const lightHtml = await light.text();
		expect(lightHtml).toContain('data-theme="light"');
		expect(lightHtml).toContain('data-archive-theme-override');
		expect(lightHtml).toContain('html[data-theme="light"]');
		expect(lightHtml).toContain('html[data-theme="dark"]');
		expect(lightHtml).toContain('prefers-color-scheme: dark');
		expect(lightHtml).toContain('html:not([data-theme="light"])');
		expect(lightHtml).toContain('--bg:#f3f0e8');
		expect(lightHtml).toContain('--fg:#1a1814');
		expect(lightHtml).toContain('--muted:#6b645a');
		expect(lightHtml).toContain('--bg:#12100e');
		expect(lightHtml).toContain('--fg:#f4efe6');
		expect(lightHtml).toContain('background: var(--bg) !important');
		expect(lightHtml).toContain('.en');
		expect(lightHtml).toContain('.zh');
		expect(lightHtml).toContain('English paragraph');
		expect(lightHtml).toContain('data-archive-chrome');
		expect(lightHtml).toContain('/theme?set=dark');
		expect(lightHtml).toContain('width=device-width, initial-scale=1');

		const dark = await SELF.fetch('http://example.com/a/hardcoded-theme', {
			headers: { cookie: `${cookie}; archive_theme=dark; archive_lang=en` },
		});
		const darkHtml = await dark.text();
		expect(darkHtml).toContain('data-theme="dark"');
		expect(darkHtml).toContain('data-archive-theme-override');
		expect(darkHtml).toContain('--bg:#12100e');

		const unset = await SELF.fetch('http://example.com/a/hardcoded-theme', {
			headers: { cookie: `${cookie}; archive_lang=en` },
		});
		const unsetHtml = await unset.text();
		expect(unsetHtml).not.toMatch(/<html\b[^>]*\bdata-theme=/);
		expect(unsetHtml).toContain('data-archive-theme-override');
		expect(unsetHtml).toContain('prefers-color-scheme: dark');

		const object = await env.ARTICLES.get('articles/hardcoded-theme.html');
		expect(await object!.text()).toBe(storedHtml);

		const download = await SELF.fetch('http://example.com/a/hardcoded-theme/download', {
			headers: { cookie: `${cookie}; archive_lang=en` },
		});
		expect(download.status).toBe(200);
		const downloaded = await download.text();
		expect(downloaded).toBe(storedHtml);
		expect(downloaded).not.toContain('data-archive-theme-override');

		const enable = await SELF.fetch('http://example.com/share', {
			method: 'POST',
			headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ slug: 'hardcoded-theme', shared: '1', next: '/a/hardcoded-theme' }),
			redirect: 'manual',
		});
		expect(enable.status).toBe(303);

		const shared = await SELF.fetch('http://example.com/a/hardcoded-theme', {
			headers: { cookie: 'archive_theme=dark; archive_lang=en' },
		});
		expect(shared.status).toBe(200);
		const sharedHtml = await shared.text();
		expect(sharedHtml).toContain('data-archive-share="public"');
		expect(sharedHtml).toContain('data-theme="dark"');
		expect(sharedHtml).toContain('data-archive-theme-override');
		expect(sharedHtml).toContain('English paragraph');
		expect(sharedHtml).not.toContain('href="/"');
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

	it('injects a content-language switch on bilingual articles and hides it for Chinese-only', async () => {
		const { cookie, token } = await setupAdmin();
		const bilingualHtml = `<!doctype html><html lang="zh-CN"><head><title>Garden</title></head><body>
<main><article>
<header class="meta">
  <h1>Garden notes</h1>
  <p>Ada · <time datetime="2026-09-14">14 Sep 2026</time></p>
</header>
<section class="pair">
  <p class="zh" lang="zh">花园里的番茄已经红了。</p>
  <p class="en" lang="en">The tomatoes in the garden have turned red.</p>
</section>
<section class="pair">
  <h2 class="zh" lang="zh">收获</h2>
  <h2 class="en" lang="en">Harvest</h2>
</section>
<figure>
  <img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" alt="tomato">
  <figcaption>
    <span class="zh" lang="zh">成熟的番茄</span>
    <span class="en" lang="en">Ripe tomatoes</span>
  </figcaption>
</figure>
<blockquote class="tweet-card">
  <p class="zh" lang="zh">今天去看了园子。</p>
  <p class="en" lang="en">Went to see the garden today.</p>
</blockquote>
<pre><code>npm test</code></pre>
</article></main></body></html>`;
		const chineseHtml = `<!doctype html><html lang="zh-CN"><head><title>笔记</title></head><body>
<main><article lang="zh"><h1>花园笔记</h1><p>花园里的番茄已经红了。</p><figure><img alt="番茄"><figcaption>成熟的番茄</figcaption></figure><pre><code>npm test</code></pre></article></main></body></html>`;

		expect((await upload(token, { slug: 'bilingual-garden', title: 'Bilingual garden', html: bilingualHtml })).status).toBe(
			200,
		);
		expect((await upload(token, { slug: 'chinese-note', title: 'Chinese note', lang: 'zh', html: chineseHtml })).status).toBe(
			200,
		);

		const both = await SELF.fetch('http://example.com/a/bilingual-garden', {
			headers: { cookie: `${cookie}; archive_lang=en` },
		});
		expect(both.status).toBe(200);
		const bothHtml = await both.text();
		expect(bothHtml).toContain('data-archive-content-lang');
		expect(bothHtml).toContain('data-content-lang-switch');
		expect(bothHtml).toContain('data-content-lang-set="zh"');
		expect(bothHtml).toContain('data-content-lang-set="en"');
		expect(bothHtml).toContain('data-content-lang-set="both"');
		expect(bothHtml).toContain('html[data-bilingual][data-content-lang="zh"]');
		expect(bothHtml).toContain('html[data-bilingual][data-content-lang="en"]');
		expect(bothHtml).toContain('archive_content_lang');
		expect(bothHtml).toContain('Article language');
		expect(bothHtml).toContain('Bilingual');
		expect(bothHtml).toContain('Interface language');
		expect(bothHtml).toContain('class="lang-switch"');
		expect(bothHtml).toContain('data-archive-content-lang-hint');
		expect(bothHtml).toContain('data-archive-content-lang-script');
		expect(bothHtml).toContain('<nav data-archive-content-lang-switch');
		const chromeAt = bothHtml.indexOf('<nav data-archive-chrome');
		const chromeNavEnd = bothHtml.indexOf('</nav>', chromeAt);
		expect(bothHtml.slice(chromeAt, chromeNavEnd)).not.toContain('data-archive-content-lang-switch');
		const switchAt = bothHtml.indexOf('<nav data-archive-content-lang-switch');
		expect(switchAt).toBeGreaterThan(bothHtml.indexOf('</header>'));
		expect(switchAt).toBeLessThan(bothHtml.indexOf('花园里的番茄已经红了'));
		expect(bothHtml).toContain('The tomatoes in the garden have turned red.');
		expect(bothHtml).toContain('Ripe tomatoes');
		expect(bothHtml).toContain('Went to see the garden today.');
		expect(bothHtml).toContain('npm test');
		expect(bothHtml).not.toMatch(/<html\b[^>]*\bdata-content-lang=/);
		expect(bothHtml).toMatch(/<html\b[^>]*\bdata-bilingual="1"/);

		const zhOnly = await SELF.fetch('http://example.com/a/bilingual-garden?lang=zh', {
			headers: { cookie: `${cookie}; archive_lang=zh` },
		});
		const zhHtml = await zhOnly.text();
		expect(zhHtml).toMatch(/<html\b[^>]*\bdata-content-lang="zh"/);
		expect(zhHtml).toContain('正文语言');
		expect(zhHtml).toContain('中英对照');
		expect(zhHtml).toContain('href="/a/bilingual-garden?lang=en"');
		expect(zhHtml).toContain('href="/a/bilingual-garden"');

		const enOnly = await SELF.fetch('http://example.com/a/bilingual-garden?lang=en', {
			headers: { cookie: `${cookie}; archive_lang=en` },
		});
		const enHtml = await enOnly.text();
		expect(enHtml).toMatch(/<html\b[^>]*\bdata-content-lang="en"/);

		const chinese = await SELF.fetch('http://example.com/a/chinese-note', {
			headers: { cookie: `${cookie}; archive_lang=en` },
		});
		const chinesePage = await chinese.text();
		expect(chinesePage).toContain('data-content-lang-switch');
		expect(chinesePage).toContain('[data-archive-content-lang-switch][hidden]');
		expect(chinesePage).not.toContain('data-archive-content-lang-hint');
		expect(chinesePage).not.toMatch(/<html\b[^>]*\bdata-bilingual=/);
		expect(chinesePage).toContain('data-archive-content-lang-script');

		const stored = await env.ARTICLES.get('articles/bilingual-garden.html');
		expect(await stored!.text()).toBe(bilingualHtml);

		const download = await SELF.fetch('http://example.com/a/bilingual-garden/download', {
			headers: { cookie },
		});
		expect(await download.text()).toBe(bilingualHtml);

		const enable = await SELF.fetch('http://example.com/share', {
			method: 'POST',
			headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ slug: 'bilingual-garden', shared: '1', next: '/a/bilingual-garden' }),
			redirect: 'manual',
		});
		expect(enable.status).toBe(303);

		const shared = await SELF.fetch('http://example.com/a/bilingual-garden?lang=en', {
			headers: { cookie: 'archive_lang=en; archive_theme=dark' },
		});
		expect(shared.status).toBe(200);
		const sharedHtml = await shared.text();
		expect(sharedHtml).toContain('data-archive-share="public"');
		expect(sharedHtml).toContain('data-content-lang-switch');
		expect(sharedHtml).toMatch(/<html\b[^>]*\bdata-content-lang="en"/);
		expect(sharedHtml).toContain('data-theme="dark"');
		expect(sharedHtml).not.toContain('href="/"');
		const sharedChrome = sharedHtml.indexOf('<nav data-archive-chrome');
		expect(sharedHtml.slice(sharedChrome, sharedHtml.indexOf('</nav>', sharedChrome))).not.toContain('data-archive-content-lang-switch');
	});

	it('places the content-language switch after a bilingual title pair and at the top when there is no h1', async () => {
		const { cookie, token } = await setupAdmin();
		const pairTitle = `<!doctype html><html lang="zh-CN"><head><title>Garden</title></head><body>
<main><article>
<section class="pair">
  <h1 class="zh" lang="zh">花园笔记</h1>
  <h1 class="en" lang="en">Garden notes</h1>
</section>
<section class="pair">
  <p class="zh" lang="zh">花园里的番茄已经红了。</p>
  <p class="en" lang="en">The tomatoes in the garden have turned red.</p>
</section>
</article></main></body></html>`;
		const noH1 = `<!doctype html><html lang="zh-CN"><head><title>Garden</title></head><body>
<main><article>
<section class="pair">
  <p class="zh" lang="zh">花园里的番茄已经红了。</p>
  <p class="en" lang="en">The tomatoes in the garden have turned red.</p>
</section>
</article></main></body></html>`;
		expect((await upload(token, { slug: 'pair-title', title: 'Pair title', html: pairTitle })).status).toBe(200);
		expect((await upload(token, { slug: 'no-h1-note', title: 'No heading', html: noH1 })).status).toBe(200);

		const pairPage = await (await SELF.fetch('http://example.com/a/pair-title', { headers: { cookie } })).text();
		const switchAt = pairPage.indexOf('<nav data-archive-content-lang-switch');
		expect(switchAt).toBeGreaterThan(pairPage.indexOf('Garden notes'));
		expect(switchAt).toBeGreaterThan(pairPage.indexOf('</section>'));
		expect(switchAt).toBeLessThan(pairPage.indexOf('花园里的番茄已经红了'));
		expect(pairPage.slice(pairPage.indexOf('<section class="pair">'), pairPage.indexOf('</section>') + 10)).not.toContain(
			'<nav data-archive-content-lang-switch',
		);

		const noH1Page = await (await SELF.fetch('http://example.com/a/no-h1-note', { headers: { cookie } })).text();
		expect(noH1Page).toContain('<nav data-archive-content-lang-switch');
		const noH1Chrome = noH1Page.indexOf('<nav data-archive-chrome');
		expect(noH1Page.slice(noH1Chrome, noH1Page.indexOf('</nav>', noH1Chrome))).not.toContain('data-archive-content-lang-switch');
		const noH1Switch = noH1Page.indexOf('<nav data-archive-content-lang-switch');
		expect(noH1Switch).toBeGreaterThan(noH1Page.indexOf('<article>'));
		expect(noH1Switch).toBeLessThan(noH1Page.indexOf('花园里的番茄已经红了'));
	});

	it('recovers unmarked Chinese next to class=en siblings and leaves URL-only Chinese pages alone', async () => {
		const { cookie, token } = await setupAdmin();
		const unmarked = `<!doctype html><html lang="zh-CN"><head><title>Garden</title></head><body>
<main><article>
<header class="meta"><h1>Garden notes</h1></header>
<p>花园里的番茄已经红了，枝头沉甸甸的。</p>
<p class="en">The tomatoes in the garden have turned red and hang heavy.</p>
<p>下午又去看了一次园子，叶子还是绿的。</p>
<p class="en">Went back to the garden in the afternoon; the leaves were still green.</p>
<p>明天打算把架子修一修。</p>
<p class="en">Tomorrow I plan to mend the trellis.</p>
<pre><code>npm test</code></pre>
</article></main></body></html>`;
		const shortcuts = `<!doctype html><html lang="zh-CN"><head><title>Shortcuts</title></head><body>
<main><article lang="zh">
<h1>常用快捷入口</h1>
<p>把常用文档和表格放在一起，避免来回找链接。</p>
<p>https://example.com/docs/handbook/intro</p>
<p>表格在这里，打开即可填写当日记录。</p>
<p>https://example.com/sheets/daily-log/view</p>
<p>备用镜像：https://example.org/mirror/handbook</p>
</article></main></body></html>`;
		expect((await upload(token, { slug: 'unmarked-garden', title: 'Unmarked garden', html: unmarked })).status).toBe(200);
		expect((await upload(token, { slug: 'url-shortcuts', title: 'Shortcuts', lang: 'zh', html: shortcuts })).status).toBe(200);

		const page = await (await SELF.fetch('http://example.com/a/unmarked-garden', { headers: { cookie } })).text();
		expect(page).toMatch(/<html\b[^>]*\bdata-bilingual="1"/);
		expect(page).toContain('data-archive-content-lang-hint');
		expect(page).toContain('<nav data-archive-content-lang-switch');
		expect(page).toMatch(/<p class="zh" lang="zh">花园里的番茄/);
		const switchAt = page.indexOf('<nav data-archive-content-lang-switch');
		expect(switchAt).toBeGreaterThan(page.indexOf('</header>'));
		expect(switchAt).toBeLessThan(page.indexOf('花园里的番茄已经红了'));

		const stored = await env.ARTICLES.get('articles/unmarked-garden.html');
		expect(await stored!.text()).toBe(unmarked);
		const download = await SELF.fetch('http://example.com/a/unmarked-garden/download', { headers: { cookie } });
		expect(await download.text()).toBe(unmarked);

		const shortcutPage = await (await SELF.fetch('http://example.com/a/url-shortcuts', { headers: { cookie } })).text();
		expect(shortcutPage).not.toMatch(/<html\b[^>]*\bdata-bilingual=/);
		expect(shortcutPage).not.toContain('data-archive-content-lang-hint');
		expect(shortcutPage).toContain('https://example.com/docs/handbook/intro');
		expect(shortcutPage).toContain('把常用文档和表格放在一起');
	});

	it('lets anyone with the link read a shared article and nothing else', async () => {
		const admin = await setupAdmin();
		const readerToken = await addUser(admin.cookie, READER_USER, READER_PASS);
		const readerCookie = await login(READER_USER, READER_PASS);
		const png =
			'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

		expect((await upload(admin.token, { slug: 'private-note', title: 'Private note' })).status).toBe(200);
		expect(
			(
				await upload(admin.token, {
					slug: 'shared-note',
					title: 'Shared garden',
					html: '<!doctype html><html><head><title>Shared garden</title></head><body><h1>Shared garden</h1><p>Only this page.</p></body></html>',
					thumbnail_base64: png,
				})
			).status,
		).toBe(200);
		expect((await upload(readerToken, { slug: 'reader-private', title: 'Reader private' })).status).toBe(200);

		const metaBefore = (await (
			await SELF.fetch('http://example.com/api/articles/shared-note', { headers: { cookie: admin.cookie } })
		).json()) as { article: { shared: boolean } };
		expect(metaBefore.article.shared).toBe(false);

		const enable = await SELF.fetch('http://example.com/share', {
			method: 'POST',
			headers: { cookie: admin.cookie, 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ slug: 'shared-note', shared: '1', next: '/a/shared-note' }),
			redirect: 'manual',
		});
		expect(enable.status).toBe(303);
		expect(enable.headers.get('location')).toBe('http://example.com/a/shared-note?share=open&slug=shared-note');

		const ownerPage = await SELF.fetch('http://example.com/a/shared-note', {
			headers: { cookie: `${admin.cookie}; archive_lang=en` },
		});
		expect(ownerPage.status).toBe(200);
		const ownerHtml = await ownerPage.text();
		expect(ownerHtml).toContain('action="/share"');
		expect(ownerHtml).toContain('name="shared" value="0"');
		expect(ownerHtml).toContain('Anyone with the link can read this article.');
		expect(ownerHtml).toContain('Stop sharing');
		expect(ownerHtml).toContain('id="archive-share-dialog"');
		expect(ownerHtml).toContain('data-share-copy');
		expect(ownerHtml).toContain('Copy link');
		expect(ownerHtml).toContain('data-share-open');
		expect(ownerHtml).toContain('Public link');

		const list = await SELF.fetch('http://example.com/', { headers: { cookie: `${admin.cookie}; archive_lang=en` } });
		const listHtml = await list.text();
		expect(listHtml).toContain('Shared');
		expect(listHtml).toContain('id="archive-share-dialog"');
		expect(listHtml).toContain('data-share-copy');
		expect(listHtml).toContain('Copy link');
		expect(listHtml).toContain('data-share-open');
		expect(listHtml).toContain('data-share-slug="shared-note"');

		const anonymousArticle = await SELF.fetch('http://example.com/a/shared-note', {
			headers: { cookie: 'archive_lang=en' },
			redirect: 'manual',
		});
		expect(anonymousArticle.status).toBe(200);
		const sharedHtml = await anonymousArticle.text();
		expect(sharedHtml).toContain('Shared garden');
		expect(sharedHtml).toContain('Only this page.');
		expect(sharedHtml).toContain('data-archive-share="public"');
		expect(sharedHtml).toContain('Shared article');
		expect(sharedHtml).not.toContain('id="archive-share-dialog"');
		expect(sharedHtml).not.toContain('data-share-copy');
		expect(sharedHtml).not.toContain('href="/"');
		expect(sharedHtml).not.toContain('/folders');
		expect(sharedHtml).not.toContain('/settings');
		expect(sharedHtml).not.toContain('/admin');
		expect(sharedHtml).not.toContain('action="/star"');
		expect(sharedHtml).not.toContain('action="/share"');
		expect(sharedHtml).not.toContain('/a/shared-note/download');
		expect(sharedHtml).not.toContain('private-note');
		expect(sharedHtml).not.toContain('reader-private');

		const anonymousThumb = await SELF.fetch('http://example.com/thumb/shared-note', { redirect: 'manual' });
		expect(anonymousThumb.status).toBe(200);
		expect(anonymousThumb.headers.get('content-type')).toContain('image/png');

		const denied = [
			'http://example.com/',
			'http://example.com/?q=garden',
			'http://example.com/folders',
			'http://example.com/settings',
			'http://example.com/admin/users',
			'http://example.com/a/private-note',
			'http://example.com/a/reader-private',
			'http://example.com/a/shared-note/download',
			'http://example.com/thumb/private-note',
		];
		for (const url of denied) {
			const response = await SELF.fetch(url, { redirect: 'manual' });
			expect(response.status, url).toBe(302);
			expect(response.headers.get('location'), url).toContain('/login');
		}

		expect((await SELF.fetch('http://example.com/api/articles')).status).toBe(401);
		expect((await SELF.fetch('http://example.com/api/articles?q=Shared')).status).toBe(401);
		expect((await SELF.fetch('http://example.com/api/articles/shared-note')).status).toBe(401);
		expect((await SELF.fetch('http://example.com/api/tags')).status).toBe(401);

		const shareDenied = await SELF.fetch('http://example.com/share', {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ slug: 'shared-note', shared: '0', next: '/a/shared-note' }),
			redirect: 'manual',
		});
		expect(shareDenied.status).toBe(302);
		expect(shareDenied.headers.get('location')).toContain('/login');

		const readerList = (await (
			await SELF.fetch('http://example.com/api/articles', { headers: { cookie: readerCookie } })
		).json()) as { articles: Array<{ slug: string }> };
		expect(readerList.articles.map((row) => row.slug)).toEqual(['reader-private']);

		const readerShared = await SELF.fetch('http://example.com/a/shared-note', {
			headers: { cookie: `${readerCookie}; archive_lang=en` },
		});
		expect(readerShared.status).toBe(200);
		const readerSharedHtml = await readerShared.text();
		expect(readerSharedHtml).toContain('Shared garden');
		expect(readerSharedHtml).toContain('data-archive-share="public"');
		expect(readerSharedHtml).not.toContain('action="/share"');

		const readerCannotShare = await SELF.fetch('http://example.com/share', {
			method: 'POST',
			headers: { cookie: readerCookie, 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ slug: 'shared-note', shared: '0', next: '/a/shared-note' }),
			redirect: 'manual',
		});
		expect(readerCannotShare.status).toBe(404);

		const disable = await SELF.fetch('http://example.com/share', {
			method: 'POST',
			headers: { cookie: admin.cookie, 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ slug: 'shared-note', shared: '0', next: '/a/shared-note' }),
			redirect: 'manual',
		});
		expect(disable.status).toBe(303);
		expect(disable.headers.get('location')).toBe('http://example.com/a/shared-note');

		const afterOff = await SELF.fetch('http://example.com/a/shared-note', { redirect: 'manual' });
		expect(afterOff.status).toBe(302);
		expect(afterOff.headers.get('location')).toContain('/login');
		expect((await SELF.fetch('http://example.com/thumb/shared-note', { redirect: 'manual' })).status).toBe(302);
	});

	it('lets an admin share another user article and keeps new articles private', async () => {
		const admin = await setupAdmin();
		const readerToken = await addUser(admin.cookie, READER_USER, READER_PASS);
		const readerCookie = await login(READER_USER, READER_PASS);
		expect((await upload(readerToken, { slug: 'reader-share', title: 'Reader share' })).status).toBe(200);

		const created = (await (
			await SELF.fetch('http://example.com/api/articles/reader-share', { headers: { cookie: readerCookie } })
		).json()) as { article: { shared: boolean } };
		expect(created.article.shared).toBe(false);

		expect((await SELF.fetch('http://example.com/a/reader-share', { redirect: 'manual' })).status).toBe(302);

		const enable = await SELF.fetch('http://example.com/share', {
			method: 'POST',
			headers: { cookie: admin.cookie, 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ slug: 'reader-share', shared: '1', next: '/a/reader-share' }),
			redirect: 'manual',
		});
		expect(enable.status).toBe(303);

		const anonymous = await SELF.fetch('http://example.com/a/reader-share', { redirect: 'manual' });
		expect(anonymous.status).toBe(200);
		expect(await anonymous.text()).toContain('Garden');

		const ownerToggle = await SELF.fetch('http://example.com/a/reader-share', {
			headers: { cookie: `${readerCookie}; archive_lang=en` },
		});
		expect(await ownerToggle.text()).toContain('action="/share"');
	});

	it('opens the share dialog from the article list after enabling share', async () => {
		const admin = await setupAdmin();
		expect((await upload(admin.token, { slug: 'list-share', title: 'List share' })).status).toBe(200);

		const enable = await SELF.fetch('http://example.com/share', {
			method: 'POST',
			headers: { cookie: admin.cookie, 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ slug: 'list-share', shared: '1', next: '/?q=List' }),
			redirect: 'manual',
		});
		expect(enable.status).toBe(303);
		expect(enable.headers.get('location')).toBe('http://example.com/?q=List&share=open&slug=list-share');

		const list = await SELF.fetch('http://example.com/?q=List', { headers: { cookie: admin.cookie } });
		const html = await list.text();
		expect(html).toContain('id="archive-share-dialog"');
		expect(html).toContain('复制链接');
		expect(html).toContain('已复制');
		expect(html).toContain('公开链接');
		expect(html).toContain('data-share-copy');
		expect(html).toContain('data-share-slug="list-share"');
		expect(html).toContain('取消分享');
	});
});
