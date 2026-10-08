import { describe, expect, it } from 'vitest';
import {
	CONTENT_LANG_BOOTSTRAP,
	CONTENT_LANG_SCRIPT,
	classifyTextRole,
	contentLangHref,
	insertSwitchIntoArticleHtml,
	looksBilingual,
	looksBilingualLegacy,
	markRecoveredLanguagePairs,
	measureContentLang,
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

	it('inserts the switch after header.meta, after a title pair, and at the article top when there is no h1', () => {
		const mark = '<nav data-archive-content-lang-switch></nav>';
		const withHeader = insertSwitchIntoArticleHtml(
			'<main><article><header class="meta"><h1>Title</h1><p class="byline">Ada</p></header><section class="pair"><p class="zh" lang="zh">中</p></section></article></main>',
			mark,
		);
		expect(withHeader.indexOf(mark)).toBeGreaterThan(withHeader.indexOf('</header>'));
		expect(withHeader.indexOf(mark)).toBeLessThan(withHeader.indexOf('class="pair"'));

		const withPairTitle = insertSwitchIntoArticleHtml(
			'<article><section class="pair"><h1 class="zh" lang="zh">中文标题</h1><h1 class="en" lang="en">English title</h1></section><section class="pair"><p class="zh" lang="zh">中</p></section></article>',
			mark,
		);
		expect(withPairTitle.indexOf(mark)).toBeGreaterThan(withPairTitle.indexOf('English title'));
		expect(withPairTitle.indexOf(mark)).toBeLessThan(withPairTitle.lastIndexOf('class="pair"'));
		expect(withPairTitle.slice(withPairTitle.indexOf('<section'), withPairTitle.indexOf('</section>'))).not.toContain(mark);

		const noHeading = insertSwitchIntoArticleHtml(
			'<article><section class="pair"><p class="zh" lang="zh">中</p><p class="en" lang="en">En</p></section></article>',
			mark,
		);
		expect(noHeading.indexOf(mark)).toBeGreaterThan(noHeading.indexOf('<article>'));
		expect(noHeading.indexOf(mark)).toBeLessThan(noHeading.indexOf('class="pair"'));
	});

	it('ignores unmarked headings, figures, and code when deciding bilingual', () => {
		expect(
			looksBilingual(
				'<h1>Shared title</h1><figure><img alt="x"><figcaption>unmarked</figcaption></figure><pre><code>ls</code></pre>',
			),
		).toBe(false);
	});

	it('recovers unmarked Chinese siblings of class="en" blocks', () => {
		const unmarkedZh = `<!doctype html><html><body><article>
<p>花园里的番茄已经红了，枝头沉甸甸的。</p>
<p class="en">The tomatoes in the garden have turned red and hang heavy.</p>
<p>下午又去看了一次园子，叶子还是绿的。</p>
<p class="en">Went back to the garden in the afternoon; the leaves were still green.</p>
<p>明天打算把架子修一修。</p>
<p class="en">Tomorrow I plan to mend the trellis.</p>
</article></body></html>`;
		expect(looksBilingualLegacy(unmarkedZh)).toBe(false);
		expect(looksBilingual(unmarkedZh)).toBe(true);
		const marked = markRecoveredLanguagePairs(unmarkedZh);
		expect(marked).toMatch(/<p class="zh" lang="zh">花园里的番茄/);
		expect(marked).toContain('class="en"');
		const measure = measureContentLang(unmarkedZh);
		expect(measure.switchShown).toBe(true);
		expect(measure.chineseLeftInEnPct).toBeLessThan(15);
		expect(measure.englishLeftInZhPct).toBeLessThan(15);
	});

	it('does not treat Chinese-only URL shortcut pages as bilingual', () => {
		const shortcuts = `<!doctype html><html lang="zh-CN"><body><article lang="zh">
<h1>常用快捷入口</h1>
<p>把常用文档和表格放在一起，避免来回找链接。</p>
<p>https://example.com/docs/handbook/intro</p>
<p>表格在这里，打开即可填写当日记录。</p>
<p>https://example.com/sheets/daily-log/view</p>
<p>备用镜像：https://example.org/mirror/handbook</p>
</article></body></html>`;
		expect(classifyTextRole('https://example.com/docs/handbook/intro')).toBe('url');
		expect(looksBilingual(shortcuts)).toBe(false);
		expect(markRecoveredLanguagePairs(shortcuts)).toBe(shortcuts);
		const measure = measureContentLang(shortcuts);
		expect(measure.switchShown).toBe(false);
		expect(measure.chineseLeftInEnPct).toBe(100);
		expect(measure.wronglyHidden).toEqual([]);
	});

	it('does not flip a Chinese article with a single English quote into bilingual', () => {
		const oneQuote = `<article lang="zh">
<p>花园里的番茄已经红了，枝头沉甸甸的。</p>
<p>下午又去看了一次园子，叶子还是绿的。</p>
<p>明天打算把架子修一修，再浇一次水。</p>
<p class="en">A single English quotation does not make this bilingual.</p>
</article>`;
		expect(looksBilingual(oneQuote)).toBe(false);
		expect(measureContentLang(oneQuote).switchShown).toBe(false);
	});

	it('classifies URL and path-only lines as non-English', () => {
		expect(classifyTextRole('https://example.com/a/b/c?x=1')).toBe('url');
		expect(classifyTextRole('www.example.com/docs/page')).toBe('url');
		expect(classifyTextRole('example.com/docs/handbook/intro')).toBe('url');
		expect(classifyTextRole('把链接放在这里 https://example.com/x 继续说明中文内容即可。')).toBe('zh');
		expect(classifyTextRole('The tomatoes in the garden have turned red.')).toBe('en');
	});

	it('does not persist a content-language choice from the head bootstrap', () => {
		expect(CONTENT_LANG_BOOTSTRAP).not.toContain('localStorage.setItem');
		expect(CONTENT_LANG_SCRIPT).toContain('if (persist)');
		expect(CONTENT_LANG_SCRIPT).toContain("apply('both', false)");
	});
});
