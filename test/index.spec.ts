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
			headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ role: 'user' }),
		});
		expect(await demote.text()).toContain('Cannot demote the last remaining admin.');

		const removed = await SELF.fetch(`http://example.com/admin/users/${adminId}/delete`, {
			method: 'POST',
			headers: { cookie },
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
		expect(await readerFolders.text()).toContain('Reader box');
		expect(await readerFolders.text()).not.toContain('Admin box');

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
});
