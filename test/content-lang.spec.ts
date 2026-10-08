import { describe, expect, it } from 'vitest';
import {
	contentLangHref,
	looksBilingual,
	parseContentLangParam,
} from '../src/content-lang';

const BILINGUAL_PAIR = `<!doctype html><html lang="zh-CN"><head><title>Garden</title></head><body>
<main><article>
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

const CHINESE_ONLY = `<!doctype html><html lang="zh-CN"><head><title>笔记</title></head><body>
<main><article lang="zh">
<h1>花园笔记</h1>
<p>花园里的番茄已经红了。</p>
<figure>
  <img alt="番茄">
  <figcaption>成熟的番茄</figcaption>
</figure>
<pre><code>npm test</code></pre>
</article></main></body></html>`;

describe('content language helpers', () => {
	it('parses ?lang=zh|en|both and ignores other values', () => {
		expect(parseContentLangParam('zh')).toBe('zh');
		expect(parseContentLangParam('en')).toBe('en');
		expect(parseContentLangParam('both')).toBe('both');
		expect(parseContentLangParam('zh-CN')).toBeNull();
		expect(parseContentLangParam('light')).toBeNull();
		expect(parseContentLangParam(null)).toBeNull();
	});

	it('builds article content-lang hrefs without touching other query params', () => {
		expect(contentLangHref('zh', '/a/garden')).toBe('/a/garden?lang=zh');
		expect(contentLangHref('en', '/a/garden?lang=zh')).toBe('/a/garden?lang=en');
		expect(contentLangHref('both', '/a/garden?lang=en')).toBe('/a/garden');
		expect(contentLangHref('zh', '/a/garden?x=1')).toBe('/a/garden?x=1&lang=zh');
	});

	it('detects canonical pair markup and common generator variants', () => {
		expect(looksBilingual(BILINGUAL_PAIR)).toBe(true);
		expect(
			looksBilingual(
				'<p lang="zh">中文一段。</p><p lang="en">English paragraph.</p><p lang="zh">又一段中文。</p><p lang="en">Another English paragraph.</p>',
			),
		).toBe(true);
		expect(looksBilingual('<p class="cn">中文一段。</p><p class="en">English paragraph.</p>')).toBe(true);
		expect(looksBilingual('<p class="bi-zh">中文一段。</p><p class="bi-en">English paragraph.</p>')).toBe(true);
		expect(looksBilingual('<p class="zh">中文一段。</p><p class="tr">English paragraph.</p>')).toBe(true);
		expect(looksBilingual('<p class="zh">中文一段。</p><p class="orig">English paragraph.</p>')).toBe(true);
		expect(looksBilingual('<p data-lang="zh">中文一段。</p><p data-lang="en">English paragraph.</p>')).toBe(true);
		expect(looksBilingual('<p lang="zh-CN">中文一段。</p><p lang="en-US">English paragraph.</p>')).toBe(true);
	});

	it('does not treat Chinese-only or English-only pages as bilingual', () => {
		expect(looksBilingual(CHINESE_ONLY)).toBe(false);
		expect(looksBilingual('<html lang="zh-CN"><body><article lang="zh"><p>只有中文。</p></article></body></html>')).toBe(
			false,
		);
		expect(looksBilingual('<html lang="en"><body><p>English only article.</p></body></html>')).toBe(false);
		expect(
			looksBilingual(
				'<article lang="zh"><p lang="zh">一段中文。</p><p lang="zh">又一段中文。</p><p lang="zh">第三段中文。</p><p lang="zh">第四段中文。</p><p lang="zh">第五段中文。</p><p lang="zh">第六段中文。</p><blockquote lang="en">A single English quote.</blockquote></article>',
			),
		).toBe(false);
	});

	it('ignores unmarked headings, figures, and code when deciding bilingual', () => {
		expect(
			looksBilingual(
				'<h1>Shared title</h1><figure><img alt="x"><figcaption>unmarked</figcaption></figure><pre><code>ls</code></pre>',
			),
		).toBe(false);
	});
});
