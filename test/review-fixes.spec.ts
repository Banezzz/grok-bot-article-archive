import { env, SELF } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { LOGIN_MAX_FAILURES_PER_USERNAME } from '../src/login-throttle';

const ORIGIN = 'http://example.com';
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function cookieFrom(response: Response): string {
	return (response.headers.getSetCookie().find((value) => value.startsWith('archive_session=')) ?? '').split(';', 1)[0] ?? '';
}

async function setupAdmin(): Promise<{ cookie: string; token: string }> {
	const response = await SELF.fetch(`${ORIGIN}/setup`, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({ username: 'admin', password: 'admin-pass-123', confirm: 'admin-pass-123' }),
		redirect: 'manual',
	});
	return { cookie: cookieFrom(response), token: (await response.text()).match(/<code class="token">([^<]+)<\/code>/)?.[1] ?? '' };
}

async function addReader(adminCookie: string): Promise<string> {
	const response = await SELF.fetch(`${ORIGIN}/admin/users`, {
		method: 'POST',
		headers: { cookie: adminCookie, 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({ username: 'reader', password: 'reader-pass-1', role: 'user' }),
	});
	return (await response.text()).match(/<code class="token">([^<]+)<\/code>/)?.[1] ?? '';
}

function upload(token: string, body: Record<string, unknown>) {
	return SELF.fetch(`${ORIGIN}/api/upload`, {
		method: 'POST',
		headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
		body: JSON.stringify({ title: 'Note', source_url: 'https://example.com/n', html: '<!doctype html><html><head></head><body><p>x</p></body></html>', ...body }),
	});
}

beforeEach(async () => {
	for (const table of ['folder_articles', 'article_stars', 'folders', 'article_tags', 'articles', 'login_failures', 'users']) {
		await env.DB.prepare(`DELETE FROM ${table}`).run();
	}
});

describe('redirect targets', () => {
	it('never leaves the site through control characters in next', async () => {
		for (const next of ['/%09/evil.example/phish', '/%0A/evil.example/', '/%0D%0A/evil.example', '/%5C/evil.example']) {
			for (const path of ['/lang?set=en', '/theme?set=dark']) {
				const response = await SELF.fetch(`${ORIGIN}${path}&next=${next}`, { redirect: 'manual' });
				expect(new URL(response.headers.get('location') ?? '').origin, `${path} ${next}`).toBe(ORIGIN);
			}
		}
		await setupAdmin();
		const login = await SELF.fetch(`${ORIGIN}/login`, {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ username: 'admin', password: 'admin-pass-123', next: '/\t/evil.example/after-login' }),
			redirect: 'manual',
		});
		expect(login.status).toBe(303);
		expect(login.headers.get('location')).toBe(`${ORIGIN}/`);
	});
});

describe('published dates', () => {
	it('stores uploads as ISO and pages through legacy free-text dates without losing rows', async () => {
		const { cookie, token } = await setupAdmin();
		expect((await upload(token, { slug: 'rss-date', published_at: 'Wed, 14 Oct 2026 12:00:00 GMT' })).status).toBe(200);
		const stored = await env.DB.prepare("SELECT published_at FROM articles WHERE slug = 'rss-date'").first<{ published_at: string }>();
		expect(stored?.published_at).toBe('2026-10-14T12:00:00.000Z');

		// Rows written before normalisation, in formats SQLite's datetime() cannot read.
		for (const [slug, published] of [
			['legacy-rss', 'Tue, 13 Oct 2026 08:00:00 GMT'],
			['legacy-words', 'October 12, 2026'],
			['legacy-cjk', '2026-10-18 (周日)'],
		]) {
			expect((await upload(token, { slug })).status).toBe(200);
			await env.DB.prepare('UPDATE articles SET published_at = ? WHERE slug = ?').bind(published, slug).run();
		}

		const seen: string[] = [];
		let cursor = '';
		for (let page = 0; page < 10; page++) {
			const response = await SELF.fetch(`${ORIGIN}/api/articles?sort=published&limit=1${cursor ? `&cursor=${cursor}` : ''}`, { headers: { cookie } });
			expect(response.status).toBe(200);
			const body = (await response.json()) as { articles: Array<{ slug: string }>; next_cursor: string | null };
			seen.push(...body.articles.map((row) => row.slug));
			if (!body.next_cursor) {
				break;
			}
			cursor = encodeURIComponent(body.next_cursor);
		}
		expect(seen.sort()).toEqual(['legacy-cjk', 'legacy-rss', 'legacy-words', 'rss-date']);
		expect((await SELF.fetch(`${ORIGIN}/?sort=published&limit=1`, { headers: { cookie } })).status).toBe(200);
	});
});

describe('article shell', () => {
	it('injects the bar, styles and scripts into fragments and head-less documents', async () => {
		const { cookie, token } = await setupAdmin();
		expect((await upload(token, { slug: 'fragment', html: '<h1>Hello</h1><p>world</p>' })).status).toBe(200);
		expect((await upload(token, { slug: 'no-head', html: '<!doctype html><html><body><h1>Hello</h1></body></html>' })).status).toBe(200);
		for (const slug of ['fragment', 'no-head']) {
			const html = await (await SELF.fetch(`${ORIGIN}/a/${slug}`, { headers: { cookie } })).text();
			expect(html, slug).toContain('<nav data-archive-chrome');
			expect(html, slug).toContain('data-archive-chrome-style');
			expect(html, slug).toContain('data-archive-theme-override');
			expect(html, slug).toContain('data-archive-menu-script');
			expect(html, slug).toContain('<h1>Hello</h1>');
			expect(html.indexOf('data-archive-chrome-style'), slug).toBeLessThan(html.indexOf('<body>'));
		}
	});
});

describe('thumbnails', () => {
	it('stores the article with a warning when the thumbnail cannot be used', async () => {
		const { cookie, token } = await setupAdmin();
		const unreachable = await upload(token, { slug: 'thumb-down', thumbnail_url: 'http://127.0.0.1:1/cover.jpg' });
		expect(unreachable.status).toBe(200);
		expect(((await unreachable.json()) as { warnings?: string[] }).warnings).toEqual(['Could not fetch thumbnail_url']);

		const notImage = await upload(token, { slug: 'thumb-html', thumbnail_base64: btoa('<html><body>not an image</body></html>') });
		expect(notImage.status).toBe(200);
		const body = (await notImage.json()) as { warnings?: string[]; thumbnail_url: string | null };
		expect(body.warnings).toEqual(['thumbnail_base64 is not a valid image']);
		expect(body.thumbnail_url).toBeNull();

		// A failed replacement keeps the thumbnail the article already had.
		expect((await upload(token, { slug: 'thumb-keep', thumbnail_base64: PNG })).status).toBe(200);
		const retry = await upload(token, { slug: 'thumb-keep', thumbnail_url: 'http://127.0.0.1:1/new.jpg' });
		expect(((await retry.json()) as { thumbnail_url: string | null }).thumbnail_url).toBe('/thumb/thumb-keep');
		expect((await SELF.fetch(`${ORIGIN}/thumb/thumb-keep`, { headers: { cookie } })).status).toBe(200);
	});
});

describe('login throttle under concurrency', () => {
	it('allows no more password checks than the limit, however many arrive at once', async () => {
		await setupAdmin();
		const attempts = await Promise.all(
			Array.from({ length: 30 }, () =>
				SELF.fetch(`${ORIGIN}/login`, {
					method: 'POST',
					headers: { 'content-type': 'application/x-www-form-urlencoded' },
					body: new URLSearchParams({ username: 'admin', password: 'wrong-password', next: '/' }),
					redirect: 'manual',
				}),
			),
		);
		const checked = attempts.filter((response) => response.status === 200).length;
		expect(checked).toBeLessThanOrEqual(LOGIN_MAX_FAILURES_PER_USERNAME);
		expect(attempts.filter((response) => response.status === 429).length).toBe(30 - checked);
	});
});

describe('visibility and robustness', () => {
	it("hides other users' tags from /api/tags", async () => {
		const { cookie, token } = await setupAdmin();
		const readerToken = await addReader(cookie);
		expect((await upload(token, { slug: 'admin-secret', tags: ['acme-layoffs-2027'] })).status).toBe(200);
		expect((await upload(readerToken, { slug: 'reader-note', tags: ['ai'] })).status).toBe(200);
		const readerCookie = cookieFrom(
			await SELF.fetch(`${ORIGIN}/login`, {
				method: 'POST',
				headers: { 'content-type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams({ username: 'reader', password: 'reader-pass-1', next: '/' }),
				redirect: 'manual',
			}),
		);
		const tags = ((await (await SELF.fetch(`${ORIGIN}/api/tags`, { headers: { cookie: readerCookie } })).json()) as { tags: Array<{ slug: string }> }).tags;
		expect(tags.map((tag) => tag.slug)).toEqual(['ai']);
		const adminTags = ((await (await SELF.fetch(`${ORIGIN}/api/tags`, { headers: { cookie } })).json()) as { tags: Array<{ slug: string }> }).tags;
		expect(adminTags.map((tag) => tag.slug)).toContain('acme-layoffs-2027');
	});

	it('sets membership in many folders in one request', async () => {
		const { cookie, token } = await setupAdmin();
		expect((await upload(token, { slug: 'busy' })).status).toBe(200);
		const now = new Date().toISOString();
		const user = await env.DB.prepare("SELECT id FROM users WHERE username = 'admin'").first<{ id: string }>();
		const ids = Array.from({ length: 60 }, () => crypto.randomUUID());
		await env.DB.batch(ids.map((id, i) => env.DB.prepare('INSERT INTO folders (id, user_id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').bind(id, user!.id, `Folder ${i}`, i, now, now)));
		const form = new URLSearchParams({ slug: 'busy', next: '/' });
		for (const id of ids) {
			form.append('folder_id', id);
		}
		const response = await SELF.fetch(`${ORIGIN}/folders/membership`, {
			method: 'POST',
			headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
			body: form,
			redirect: 'manual',
		});
		expect(response.status).toBe(303);
		const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM folder_articles').first<{ n: number }>();
		expect(count?.n).toBe(60);
	});

	it('answers malformed percent-escapes with 404, not 500', async () => {
		const { cookie } = await setupAdmin();
		expect((await SELF.fetch(`${ORIGIN}/a/%E0%A4`, { headers: { cookie } })).status).toBe(404);
		expect((await SELF.fetch(`${ORIGIN}/thumb/%ZZ`)).status).toBe(404);
		expect((await SELF.fetch(`${ORIGIN}/api/articles/%E0%A4`, { headers: { cookie } })).status).toBe(404);
	});
});
