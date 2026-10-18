import { env, SELF } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { inlineScriptBodies, scriptHashSource } from '../src/csp';
import { LOGIN_MAX_FAILURES_PER_IP, LOGIN_MAX_FAILURES_PER_USERNAME } from '../src/login-throttle';
import { MAX_THUMB_BYTES, readBodyUpTo } from '../src/thumbnail';

const ORIGIN = 'http://example.com';
const ADMIN_PASS = 'admin-pass-123';
const READER_PASS = 'reader-pass-123';

function cookieFrom(response: Response): string {
	const session = response.headers.getSetCookie().find((value) => value.startsWith('archive_session='));
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

function form(path: string, cookie: string, fields: Record<string, string>, headers: Record<string, string> = {}) {
	return SELF.fetch(`${ORIGIN}${path}`, {
		method: 'POST',
		headers: { cookie, 'content-type': 'application/x-www-form-urlencoded', ...headers },
		body: new URLSearchParams(fields),
		redirect: 'manual',
	});
}

async function setupAdmin(): Promise<{ cookie: string; token: string; id: string }> {
	const response = await form('/setup', '', { username: 'admin', password: ADMIN_PASS, confirm: ADMIN_PASS });
	expect(response.status).toBe(200);
	const user = await env.DB.prepare("SELECT id FROM users WHERE username = 'admin'").first<{ id: string }>();
	return { cookie: cookieFrom(response), token: tokenFromHtml(await response.text()), id: user!.id };
}

async function addReader(adminCookie: string): Promise<{ token: string; id: string }> {
	const response = await form('/admin/users', adminCookie, { username: 'reader', password: READER_PASS, role: 'user' });
	expect(response.status).toBe(200);
	const user = await env.DB.prepare("SELECT id FROM users WHERE username = 'reader'").first<{ id: string }>();
	return { token: tokenFromHtml(await response.text()), id: user!.id };
}

function login(username: string, password: string, headers: Record<string, string> = {}) {
	return form('/login', '', { username, password, next: '/' }, headers);
}

function upload(token: string, overrides: Record<string, unknown> = {}) {
	return SELF.fetch(`${ORIGIN}/api/upload`, {
		method: 'POST',
		headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
		body: JSON.stringify({
			title: 'Security note',
			source_url: 'https://example.com/security',
			html: '<!doctype html><html><head><title>Note</title></head><body><h1>Note</h1><p>original</p></body></html>',
			...overrides,
		}),
	});
}

async function r2Keys(prefix: string): Promise<string[]> {
	return (await env.ARTICLES.list({ prefix })).objects.map((object) => object.key).sort();
}

async function storedHtml(slug: string): Promise<string | null> {
	const row = await env.DB.prepare('SELECT r2_key FROM articles WHERE slug = ?').bind(slug).first<{ r2_key: string }>();
	const object = row ? await env.ARTICLES.get(row.r2_key) : null;
	return object ? object.text() : null;
}

/** Every inline script in the page must be allowed by the CSP header's hashes, and nothing else. */
function expectScriptsCoveredByCsp(html: string, csp: string | null): void {
	expect(csp).toBeTruthy();
	const bodies = inlineScriptBodies(html);
	expect(bodies.length).toBeGreaterThan(0);
	for (const body of bodies) {
		expect(csp).toContain(scriptHashSource(body));
	}
}

const ATTACK_HTML = `<!doctype html><html><head><title>x</title></head><body>
<h1>Totally normal article</h1>
<script>fetch('/admin/users',{method:'POST'})</script>
<form id="evil" action="/admin/users" method="post" target="_top"><input name="username" value="pwn"><button>Read more</button></form>
<button formaction="/settings/token" formmethod="post" form="evil">Continue</button>
</body></html>`;

describe('security hardening', () => {
	beforeEach(async () => {
		for (const table of ['folder_articles', 'article_stars', 'folders', 'article_tags', 'articles', 'login_failures', 'users']) {
			await env.DB.prepare(`DELETE FROM ${table}`).run();
		}
		const keys = (await env.ARTICLES.list()).objects.map((object) => object.key);
		if (keys.length > 0) {
			await env.ARTICLES.delete(keys);
		}
	});

	describe('upload ownership', () => {
		it("refuses to overwrite another user's slug and leaves no stray objects", async () => {
			const admin = await setupAdmin();
			const reader = await addReader(admin.cookie);
			expect((await upload(admin.token, { slug: 'admin-post' })).status).toBe(200);
			const before = await r2Keys('articles/admin-post/');

			const hijack = await upload(reader.token, { slug: 'admin-post', html: ATTACK_HTML, thumbnail_base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' });
			expect(hijack.status).toBe(409);
			expect(await storedHtml('admin-post')).toContain('original');
			expect(await r2Keys('articles/admin-post/')).toEqual(before);
			expect(await r2Keys('thumbs/admin-post/')).toEqual([]);
		});

		it('lets the owner and an admin replace an article and drops the superseded objects', async () => {
			const admin = await setupAdmin();
			const reader = await addReader(admin.cookie);
			expect((await upload(reader.token, { slug: 'reader-post', tags: ['ai'] })).status).toBe(200);
			const first = await r2Keys('articles/reader-post/');
			expect(first).toHaveLength(1);

			const own = await upload(reader.token, { slug: 'reader-post', html: '<html><body><p>second</p></body></html>', tags: ['markets'] });
			expect(own.status).toBe(200);
			expect(((await own.json()) as { tags: Array<{ slug: string }> }).tags.map((tag) => tag.slug)).toEqual(['markets']);
			const second = await r2Keys('articles/reader-post/');
			expect(second).toHaveLength(1);
			expect(second).not.toEqual(first);

			const byAdmin = await upload(admin.token, { slug: 'reader-post', html: '<html><body><p>third</p></body></html>' });
			expect(byAdmin.status).toBe(200);
			expect(((await byAdmin.json()) as { owner_username: string }).owner_username).toBe('reader');
			expect(await storedHtml('reader-post')).toContain('third');
			expect(await r2Keys('articles/reader-post/')).toHaveLength(1);
		});

		it('gives concurrent uploads of the same title distinct slugs', async () => {
			const admin = await setupAdmin();
			const responses = await Promise.all(Array.from({ length: 4 }, () => upload(admin.token, { title: 'Same title' })));
			const slugs = await Promise.all(responses.map(async (response) => ((await response.json()) as { slug: string }).slug));
			expect(responses.map((response) => response.status)).toEqual([200, 200, 200, 200]);
			expect(new Set(slugs).size).toBe(4);
			const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM articles').first<{ n: number }>();
			expect(count?.n).toBe(4);
		});

		it('deletes the D1 rows and R2 objects of an article together', async () => {
			const admin = await setupAdmin();
			expect((await upload(admin.token, { slug: 'gone', tags: ['ai'], thumbnail_base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' })).status).toBe(200);
			expect(await form('/star', admin.cookie, { slug: 'gone', next: '/' })).toHaveProperty('status', 303);
			const removed = await SELF.fetch(`${ORIGIN}/api/articles/gone`, { method: 'DELETE', headers: { authorization: `Bearer ${admin.token}` } });
			expect(removed.status).toBe(200);
			for (const table of ['articles', 'article_tags', 'article_stars']) {
				const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>();
				expect(row?.n, table).toBe(0);
			}
			expect(await r2Keys('articles/gone/')).toEqual([]);
			expect(await r2Keys('thumbs/gone/')).toEqual([]);
		});
	});

	describe('content security policy', () => {
		it('blocks scripts and live forms inside archived HTML while the archive chrome keeps working', async () => {
			const admin = await setupAdmin();
			expect((await upload(admin.token, { slug: 'attack', html: ATTACK_HTML })).status).toBe(200);
			const page = await SELF.fetch(`${ORIGIN}/a/attack`, { headers: { cookie: admin.cookie } });
			expect(page.status).toBe(200);
			const csp = page.headers.get('content-security-policy');
			const html = await page.text();

			expect(csp).toContain("frame-ancestors 'none'");
			expect(csp).toContain("object-src 'none'");
			expect(csp).toContain("base-uri 'none'");
			expect(csp).not.toContain('unsafe-inline');
			expect(csp).not.toContain(scriptHashSource("fetch('/admin/users',{method:'POST'})"));
			const archiveScripts = inlineScriptBodies(html).filter((body) => !body.includes("fetch('/admin/users'"));
			for (const body of archiveScripts) {
				expect(csp).toContain(scriptHashSource(body));
			}
			expect(page.headers.get('x-frame-options')).toBe('DENY');

			expect(html).toMatch(/<form id="evil" method="dialog">/);
			expect(html).not.toContain('action="/admin/users"');
			expect(html).not.toContain('formaction=');
			expect(html).not.toContain('form="evil"');
			expect(html).toContain('<form method="post" action="/star"');
			expect(html).toContain('<form method="post" action="/share"');
			// Stored bytes are untouched.
			expect(await storedHtml('attack')).toBe(ATTACK_HTML);
		});

		it('applies the same lockdown to shared public views and sandboxes downloads and thumbnails', async () => {
			const admin = await setupAdmin();
			expect((await upload(admin.token, { slug: 'public-one', thumbnail_base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' })).status).toBe(200);
			expect((await form('/share', admin.cookie, { slug: 'public-one', shared: '1', next: '/a/public-one' })).status).toBe(303);
			const publicView = await SELF.fetch(`${ORIGIN}/a/public-one`);
			expect(publicView.status).toBe(200);
			expectScriptsCoveredByCsp(await publicView.text(), publicView.headers.get('content-security-policy'));

			const download = await SELF.fetch(`${ORIGIN}/a/public-one/download`, { headers: { cookie: admin.cookie } });
			expect(download.headers.get('content-security-policy')).toContain('sandbox');
			const thumb = await SELF.fetch(`${ORIGIN}/thumb/public-one`);
			expect(thumb.status).toBe(200);
			expect(thumb.headers.get('content-security-policy')).toContain('sandbox');
		});

		it('sends a hash-only CSP and frame denial on every app page', async () => {
			const admin = await setupAdmin();
			expect((await upload(admin.token, { slug: 'listed' })).status).toBe(200);
			for (const path of ['/', '/settings', '/admin/users', '/folders']) {
				const response = await SELF.fetch(`${ORIGIN}${path}`, { headers: { cookie: admin.cookie } });
				expect(response.status, path).toBe(200);
				const csp = response.headers.get('content-security-policy');
				expect(csp, path).toContain("frame-ancestors 'none'");
				expect(csp, path).toContain("default-src 'self'");
				expect(response.headers.get('x-frame-options'), path).toBe('DENY');
				expectScriptsCoveredByCsp(await response.text(), csp);
			}
			const loginPage = await SELF.fetch(`${ORIGIN}/login`);
			expectScriptsCoveredByCsp(await loginPage.text(), loginPage.headers.get('content-security-policy'));
		});
	});

	describe('cross-site form posts', () => {
		it('rejects cookie-authenticated POSTs from another origin but not bearer APIs', async () => {
			const admin = await setupAdmin();
			expect((await upload(admin.token, { slug: 'csrf-target' })).status).toBe(200);

			expect((await form('/star', admin.cookie, { slug: 'csrf-target', next: '/' }, { origin: 'https://evil.example' })).status).toBe(403);
			expect((await form('/star', admin.cookie, { slug: 'csrf-target', next: '/' }, { origin: 'null' })).status).toBe(403);
			expect((await form('/star', admin.cookie, { slug: 'csrf-target', next: '/' }, { 'sec-fetch-site': 'cross-site' })).status).toBe(403);
			expect((await form('/admin/users', admin.cookie, { username: 'x-user', password: 'x-pass-1234' }, { origin: 'https://evil.example' })).status).toBe(403);
			expect((await login('admin', ADMIN_PASS, { origin: 'https://evil.example' })).status).toBe(403);
			const starred = await env.DB.prepare('SELECT COUNT(*) AS n FROM article_stars').first<{ n: number }>();
			expect(starred?.n).toBe(0);

			expect((await form('/star', admin.cookie, { slug: 'csrf-target', next: '/' }, { origin: ORIGIN })).status).toBe(303);
			expect((await form('/star', admin.cookie, { slug: 'csrf-target', next: '/' }, { 'sec-fetch-site': 'same-origin' })).status).toBe(303);

			const botUpload = await SELF.fetch(`${ORIGIN}/api/upload`, {
				method: 'POST',
				headers: { authorization: `Bearer ${admin.token}`, 'content-type': 'application/json', origin: 'https://bot.example' },
				body: JSON.stringify({ title: 'Bot', source_url: 'https://example.com/bot', html: '<p>bot</p>' }),
			});
			expect(botUpload.status).toBe(200);
		});
	});

	describe('login throttling', () => {
		it('locks a username after repeated failures, even for the right password', async () => {
			await setupAdmin();
			for (let i = 0; i < LOGIN_MAX_FAILURES_PER_USERNAME; i++) {
				expect((await login('admin', 'wrong-password')).status).toBe(200);
			}
			const blocked = await login('admin', ADMIN_PASS);
			expect(blocked.status).toBe(429);
			expect(blocked.headers.getSetCookie().some((value) => value.startsWith('archive_session='))).toBe(false);

			// The window expires.
			await env.DB.prepare('UPDATE login_failures SET window_start = window_start - 3600').run();
			expect((await login('admin', ADMIN_PASS)).status).toBe(303);
		});

		it('limits one IP spraying many usernames and resets a username after success', async () => {
			const admin = await setupAdmin();
			await addReader(admin.cookie);
			const ip = { 'cf-connecting-ip': '203.0.113.7' };
			expect((await login('reader', 'wrong-password', ip)).status).toBe(200);
			expect((await login('reader', READER_PASS, ip)).status).toBe(303);
			const readerKey = await env.DB.prepare("SELECT count FROM login_failures WHERE key = 'user:reader'").first();
			expect(readerKey).toBeNull();

			for (let i = 1; i < LOGIN_MAX_FAILURES_PER_IP; i++) {
				expect((await login(`ghost-${i}`, 'wrong-password', ip)).status).toBe(200);
			}
			expect((await login('reader', READER_PASS, ip)).status).toBe(429);
			expect((await login('reader', READER_PASS, { 'cf-connecting-ip': '198.51.100.1' })).status).toBe(303);
		});
	});

	describe('passwords and sessions', () => {
		it('changes the password, keeps this device signed in, and signs out the rest', async () => {
			const admin = await setupAdmin();
			const otherDevice = cookieFrom(await login('admin', ADMIN_PASS));

			const wrong = await form('/settings/password', admin.cookie, { current_password: 'nope-nope-nope', new_password: 'next-pass-456', confirm: 'next-pass-456' });
			expect(await wrong.text()).toContain('当前密码不正确');

			const changed = await form('/settings/password', admin.cookie, { current_password: ADMIN_PASS, new_password: 'next-pass-456', confirm: 'next-pass-456' });
			expect(changed.status).toBe(200);
			const thisDevice = cookieFrom(changed);

			expect((await SELF.fetch(`${ORIGIN}/settings`, { headers: { cookie: thisDevice } })).status).toBe(200);
			expect((await SELF.fetch(`${ORIGIN}/settings`, { headers: { cookie: otherDevice }, redirect: 'manual' })).status).toBe(302);
			expect((await SELF.fetch(`${ORIGIN}/settings`, { headers: { cookie: admin.cookie }, redirect: 'manual' })).status).toBe(302);
			expect((await login('admin', ADMIN_PASS)).status).toBe(200);
			expect((await login('admin', 'next-pass-456')).status).toBe(303);
		});

		it('signs out every device on request', async () => {
			const admin = await setupAdmin();
			const otherDevice = cookieFrom(await login('admin', ADMIN_PASS));
			const revoked = await form('/settings/sessions/revoke', admin.cookie, {});
			expect(revoked.status).toBe(303);
			expect(revoked.headers.get('location')).toBe(`${ORIGIN}/login`);
			for (const cookie of [admin.cookie, otherDevice]) {
				expect((await SELF.fetch(`${ORIGIN}/`, { headers: { cookie }, redirect: 'manual' })).status).toBe(302);
			}
		});

		it('lets an admin reset a password, which signs that user out', async () => {
			const admin = await setupAdmin();
			const reader = await addReader(admin.cookie);
			const readerSession = cookieFrom(await login('reader', READER_PASS));

			const short = await form(`/admin/users/${reader.id}/password`, admin.cookie, { password: 'short' });
			expect(await short.text()).toContain('密码长度须为 8–200 个字符');

			const reset = await form(`/admin/users/${reader.id}/password`, admin.cookie, { password: 'reset-pass-789' });
			expect(reset.status).toBe(200);
			expect(await reset.text()).toContain('已重置 reader 的密码');
			expect((await SELF.fetch(`${ORIGIN}/`, { headers: { cookie: readerSession }, redirect: 'manual' })).status).toBe(302);
			expect((await login('reader', 'reset-pass-789')).status).toBe(303);

			// Regular users cannot reach the reset action.
			const readerNow = cookieFrom(await login('reader', 'reset-pass-789'));
			expect((await form(`/admin/users/${admin.id}/password`, readerNow, { password: 'taken-over-1' })).status).toBe(404);
			expect((await login('admin', ADMIN_PASS)).status).toBe(303);
		});

		it('still accepts session cookies issued before session versions existed', async () => {
			const admin = await setupAdmin();
			const [body] = admin.cookie.slice('archive_session='.length).split('.');
			const payload = JSON.parse(atob(body!.replace(/-/g, '+').replace(/_/g, '/')));
			expect(payload.sv).toBe(0);
			expect((await SELF.fetch(`${ORIGIN}/`, { headers: { cookie: admin.cookie } })).status).toBe(200);
		});
	});

	describe('deleting users who own articles', () => {
		const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

		async function seedReaderLibrary(admin: { cookie: string }) {
			const reader = await addReader(admin.cookie);
			expect((await upload(reader.token, { slug: 'reader-a', tags: ['ai'], thumbnail_base64: PNG })).status).toBe(200);
			expect((await upload(reader.token, { slug: 'reader-b' })).status).toBe(200);
			// The admin stars one of the reader's articles and files it in the admin's own folder.
			expect((await form('/star', admin.cookie, { slug: 'reader-a', next: '/' })).status).toBe(303);
			expect((await form('/folders', admin.cookie, { name: 'Admin picks' })).status).toBe(200);
			const folder = await env.DB.prepare("SELECT id FROM folders WHERE name = 'Admin picks'").first<{ id: string }>();
			expect((await form('/folders/membership', admin.cookie, { slug: 'reader-a', next: '/', folder_id: folder!.id })).status).toBe(303);
			// The reader has a folder of their own.
			const readerCookie = cookieFrom(await login('reader', READER_PASS));
			expect((await form('/folders', readerCookie, { name: 'Reader stuff' })).status).toBe(200);
			return reader;
		}

		async function count(sql: string): Promise<number> {
			return Number((await env.DB.prepare(sql).first<{ n: number }>())?.n ?? 0);
		}

		it('requires an explicit choice and changes nothing without one', async () => {
			const admin = await setupAdmin();
			const reader = await seedReaderLibrary(admin);
			const page = await SELF.fetch(`${ORIGIN}/admin/users`, { headers: { cookie: admin.cookie } });
			const html = await page.text();
			expect(html).toContain('<select name="articles" required');
			expect(html).toContain('2 篇文章如何处理');

			for (const choice of [undefined, '', 'keep']) {
				const fields: Record<string, string> = choice === undefined ? {} : { articles: choice };
				const response = await form(`/admin/users/${reader.id}/delete`, admin.cookie, fields);
				expect(response.status).toBe(200);
				expect(await response.text()).toContain('请选择转给你还是一并删除');
			}
			expect(await count('SELECT COUNT(*) AS n FROM users')).toBe(2);
			expect(await count('SELECT COUNT(*) AS n FROM articles')).toBe(2);
			expect(await count('SELECT COUNT(*) AS n FROM folders')).toBe(2);
		});

		it('transfers the articles to the acting admin', async () => {
			const admin = await setupAdmin();
			const reader = await seedReaderLibrary(admin);
			const keysBefore = await r2Keys('');

			const response = await form(`/admin/users/${reader.id}/delete`, admin.cookie, { articles: 'transfer' });
			expect(response.status).toBe(200);
			expect(await response.text()).toContain('其 2 篇文章已转到你名下');

			expect(await count(`SELECT COUNT(*) AS n FROM users WHERE id = '${reader.id}'`)).toBe(0);
			expect(await count(`SELECT COUNT(*) AS n FROM articles WHERE owner_id = '${admin.id}'`)).toBe(2);
			expect(await count('SELECT COUNT(*) AS n FROM article_tags')).toBe(1);
			// The admin's star and folder survive; the reader's folder is gone.
			expect(await count('SELECT COUNT(*) AS n FROM article_stars')).toBe(1);
			expect(await count('SELECT COUNT(*) AS n FROM folder_articles')).toBe(1);
			expect(await count("SELECT COUNT(*) AS n FROM folders WHERE name = 'Reader stuff'")).toBe(0);
			expect(await r2Keys('')).toEqual(keysBefore);
			expect((await login('reader', READER_PASS)).status).toBe(200);
			expect((await SELF.fetch(`${ORIGIN}/a/reader-a`, { headers: { cookie: admin.cookie } })).status).toBe(200);
		});

		it('deletes the articles with the user, including every reference and R2 object', async () => {
			const admin = await setupAdmin();
			const reader = await seedReaderLibrary(admin);
			expect((await upload(admin.token, { slug: 'admin-own', tags: ['ai'] })).status).toBe(200);

			const response = await form(`/admin/users/${reader.id}/delete`, admin.cookie, { articles: 'delete' });
			expect(response.status).toBe(200);
			expect(await response.text()).toContain('已删除用户 reader 及其 2 篇文章');

			expect(await count(`SELECT COUNT(*) AS n FROM users WHERE id = '${reader.id}'`)).toBe(0);
			const remaining = await env.DB.prepare('SELECT slug FROM articles').all<{ slug: string }>();
			expect(remaining.results.map((row) => row.slug)).toEqual(['admin-own']);
			expect(await count('SELECT COUNT(*) AS n FROM article_tags')).toBe(1);
			expect(await count('SELECT COUNT(*) AS n FROM article_stars')).toBe(0);
			expect(await count('SELECT COUNT(*) AS n FROM folder_articles')).toBe(0);
			expect(await count("SELECT COUNT(*) AS n FROM folders WHERE name = 'Admin picks'")).toBe(1);
			expect(await r2Keys('articles/reader-')).toEqual([]);
			expect(await r2Keys('thumbs/reader-')).toEqual([]);
			expect(await r2Keys('articles/admin-own/')).toHaveLength(1);
		});

		it('lets an admin delete their own account only by deleting its articles', async () => {
			const admin = await setupAdmin();
			expect((await form('/admin/users', admin.cookie, { username: 'second', password: 'second-pass-1', role: 'admin' })).status).toBe(200);
			expect((await upload(admin.token, { slug: 'mine' })).status).toBe(200);
			const page = await (await SELF.fetch(`${ORIGIN}/admin/users`, { headers: { cookie: admin.cookie } })).text();
			const selfForm = page.slice(page.indexOf(`/admin/users/${admin.id}/delete`));
			expect(selfForm.slice(0, selfForm.indexOf('</form>'))).not.toContain('value="transfer"');

			const refused = await form(`/admin/users/${admin.id}/delete`, admin.cookie, { articles: 'transfer' });
			expect(await refused.text()).toContain('不能把文章转给正在删除的账号');
			expect(await count('SELECT COUNT(*) AS n FROM articles')).toBe(1);

			const removed = await form(`/admin/users/${admin.id}/delete`, admin.cookie, { articles: 'delete' });
			expect(removed.status).toBe(303);
			expect(await count('SELECT COUNT(*) AS n FROM articles')).toBe(0);
			expect(await count("SELECT COUNT(*) AS n FROM users WHERE username = 'admin'")).toBe(0);
		});

		it('deletes a user without articles with no choice needed', async () => {
			const admin = await setupAdmin();
			const reader = await addReader(admin.cookie);
			const page = await (await SELF.fetch(`${ORIGIN}/admin/users`, { headers: { cookie: admin.cookie } })).text();
			const readerForm = page.slice(page.indexOf(`/admin/users/${reader.id}/delete`));
			expect(readerForm.slice(0, readerForm.indexOf('</form>'))).not.toContain('<select');
			const response = await form(`/admin/users/${reader.id}/delete`, admin.cookie, {});
			expect(response.status).toBe(200);
			expect(await response.text()).toContain('已删除用户 reader。');
			expect(await count('SELECT COUNT(*) AS n FROM users')).toBe(1);
		});
	});

	describe('thumbnails', () => {
		it('caps remote thumbnail downloads at 20MB while streaming', async () => {
			expect(MAX_THUMB_BYTES).toBe(20 * 1024 * 1024);
			const declaredTooBig = new Response('x', { headers: { 'content-length': String(MAX_THUMB_BYTES + 1) } });
			expect(await readBodyUpTo(declaredTooBig, MAX_THUMB_BYTES)).toBeNull();

			let pulled = 0;
			const chunk = new Uint8Array(1024 * 1024);
			const endless = new ReadableStream<Uint8Array>({
				pull(controller) {
					pulled++;
					controller.enqueue(chunk);
				},
			});
			expect(await readBodyUpTo(new Response(endless), MAX_THUMB_BYTES)).toBeNull();
			expect(pulled).toBeLessThanOrEqual(22);

			const ok = await readBodyUpTo(new Response(new Uint8Array(3 * 1024 * 1024)), MAX_THUMB_BYTES);
			expect(ok?.byteLength).toBe(3 * 1024 * 1024);
		});

		it('accepts a base64 thumbnail above the old 2MB limit', async () => {
			const admin = await setupAdmin();
			const png = new Uint8Array(3 * 1024 * 1024);
			png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
			let binary = '';
			for (let i = 0; i < png.length; i += 0x8000) {
				binary += String.fromCharCode(...png.subarray(i, i + 0x8000));
			}
			const response = await upload(admin.token, { slug: 'big-thumb', thumbnail_base64: btoa(binary) });
			expect(response.status).toBe(200);
			const thumb = await SELF.fetch(`${ORIGIN}/thumb/big-thumb`, { headers: { cookie: admin.cookie } });
			expect(thumb.status).toBe(200);
			expect((await thumb.arrayBuffer()).byteLength).toBe(png.length);
		});
	});
});
