import { env, SELF } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

const ORIGIN = 'http://example.com';

async function setupAdmin(): Promise<{ cookie: string; token: string }> {
	const response = await SELF.fetch(`${ORIGIN}/setup`, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({ username: 'admin', password: 'admin-pass-123', confirm: 'admin-pass-123' }),
		redirect: 'manual',
	});
	const cookie = (response.headers.getSetCookie().find((value) => value.startsWith('archive_session=')) ?? '').split(';', 1)[0] ?? '';
	const token = (await response.text()).match(/<code class="token">([^<]+)<\/code>/)?.[1] ?? '';
	return { cookie, token };
}

function upload(token: string, body: Record<string, unknown>) {
	return SELF.fetch(`${ORIGIN}/api/upload`, {
		method: 'POST',
		headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
		body: JSON.stringify({ title: 'Links', source_url: 'https://source.example/post', ...body }),
	});
}

const ARTICLE = `<!doctype html><html><head><title>Links</title></head><body><main>
<p><a id="ext" href="https://news.example.com/story?id=1">external</a></p>
<p><a id="proto" href="//cdn.example.net/x">protocol-relative</a></p>
<p><a id="local" href="/a/other-note">archive link</a> <a id="frag" href="#notes">footnote</a> <a id="mail" href="mailto:a@b.c">mail</a></p>
<blockquote class="tweet-card"><p class="zh" lang="zh">推文</p><p class="en" lang="en">Tweet</p></blockquote>
</main></body></html>`;

beforeEach(async () => {
	for (const table of ['folder_articles', 'article_stars', 'folders', 'article_tags', 'articles', 'login_failures', 'users']) {
		await env.DB.prepare(`DELETE FROM ${table}`).run();
	}
});

describe('external links', () => {

	it('opens off-site links in a new tab and adds the confirm dialog on article pages', async () => {
		const { cookie, token } = await setupAdmin();
		expect((await upload(token, { slug: 'links', html: ARTICLE })).status).toBe(200);
		const html = await (await SELF.fetch(`${ORIGIN}/a/links`, { headers: { cookie } })).text();

		expect(html).toContain('<a id="ext" href="https://news.example.com/story?id=1" target="_blank" rel="noopener noreferrer">');
		expect(html).toContain('<a id="proto" href="//cdn.example.net/x" target="_blank" rel="noopener noreferrer">');
		for (const id of ['local', 'frag', 'mail']) {
			const tag = html.slice(html.indexOf(`<a id="${id}"`), html.indexOf('>', html.indexOf(`<a id="${id}"`)));
			expect(tag, id).not.toContain('target=');
		}
		expect(html).toContain('id="archive-link-dialog"');
		expect(html).toContain('您将跳转到链接为');
		expect(html).toContain('>确认<');
		expect(html).toContain('>取消<');
		expect(html).toContain('data-archive-link-confirm-script');
		// The archive's own chrome links are not rewritten.
		expect(html).toContain('<a class="ac-back" href="/">');
		// Tweet cards get card styling at serve time.
		expect(html).toContain('html body :is(blockquote.tweet-card, figure.tweet-card, blockquote.twitter-tweet)');
	});

	it('adds the dialog to public shared views and app pages', async () => {
		const { cookie, token } = await setupAdmin();
		expect((await upload(token, { slug: 'links', html: ARTICLE })).status).toBe(200);
		await SELF.fetch(`${ORIGIN}/share`, {
			method: 'POST',
			headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ slug: 'links', shared: '1', next: '/a/links' }),
			redirect: 'manual',
		});
		const shared = await (await SELF.fetch(`${ORIGIN}/a/links`, { headers: { cookie: 'archive_lang=en' } })).text();
		expect(shared).toContain('data-archive-share="public"');
		expect(shared).toContain('You are about to open this link:');

		const list = await (await SELF.fetch(`${ORIGIN}/`, { headers: { cookie } })).text();
		expect(list).toContain('id="archive-link-dialog"');
		expect(list).toContain('href="https://source.example/post" rel="noreferrer noopener" target="_blank"');
	});
});

describe('list dates', () => {
	it('shows the timestamp the list is sorted by', async () => {
		const { cookie, token } = await setupAdmin();
		expect((await upload(token, { slug: 'old-piece', html: '<p>x</p>', published_at: '2020-03-04T00:00:00Z' })).status).toBe(200);
		const created = (await env.DB.prepare("SELECT created_at FROM articles WHERE slug = 'old-piece'").first<{ created_at: string }>())!.created_at;

		const joined = await (await SELF.fetch(`${ORIGIN}/?sort=joined`, { headers: { cookie: `${cookie}; archive_lang=en` } })).text();
		expect(joined).toContain(`<time datetime="${created}" title="Join time">`);
		const published = await (await SELF.fetch(`${ORIGIN}/?sort=published`, { headers: { cookie: `${cookie}; archive_lang=en` } })).text();
		expect(published).toContain('<time datetime="2020-03-04T00:00:00Z" title="Article time">Mar 4, 2020</time>');
	});
});
