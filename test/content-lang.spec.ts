import { describe, expect, it } from 'vitest';
import {
	CONTENT_LANG_BOOTSTRAP,
	CONTENT_LANG_SCRIPT,
	CONTENT_LANG_STYLE,
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

	it('does not mark header meta, bylines, or Source / 原文 lines', () => {
		const page = `<!doctype html><html><body>
<header class="meta">
  <h1>花园笔记<span class="en" lang="en">Garden notes</span></h1>
  <p class="byline"><img alt="avatar">Ada · <time datetime="2026-09-14">14 Sep 2026</time></p>
  <p>56 likes · 11 reposts · 25 bookmarks · 2208 views（存档时 / at archive time）</p>
  <p><a href="https://example.com/source">Source / 原文</a> · X Article</p>
</header>
<article>
<p>花园里的番茄已经红了，枝头沉甸甸的。</p>
<p class="en">The tomatoes in the garden have turned red and hang heavy.</p>
<p>下午又去看了一次园子，叶子还是绿的。</p>
<p class="en">Went back to the garden in the afternoon; the leaves were still green.</p>
<p>明天打算把架子修一修。</p>
<p class="en">Tomorrow I plan to mend the trellis.</p>
</article></body></html>`;
		expect(looksBilingual(page)).toBe(true);
		const marked = markRecoveredLanguagePairs(page);
		expect(marked).toContain('class="byline"');
		expect(marked).toContain('Source / 原文');
		expect(marked).not.toMatch(/<p class="byline"[^>]*\bzh\b/);
		expect(marked).not.toMatch(/Source \/ 原文<\/a>[^<]*<\/p>/.source && /<p class="[^"]*\bzh\b[^"]*"[^>]*>[\s\S]*Source \/ 原文/);
		expect(CONTENT_LANG_STYLE).not.toContain(':has(+ p.en)');
		expect(CONTENT_LANG_STYLE).toContain('p.byline');
		expect(CONTENT_LANG_STYLE).toContain('header.meta > p:has(a)');
		expect(CONTENT_LANG_STYLE).toContain('footer');
	});

	it('keeps Chinese inside an English-marked parent visible in zh mode', () => {
		const caption = `<article>
<section class="pair"><p class="zh" lang="zh">花园里的番茄已经红了，枝头沉甸甸的。</p><p class="en" lang="en">The tomatoes in the garden have turned red and hang heavy.</p></section>
<section class="pair"><p class="zh" lang="zh">下午又去看了一次园子，叶子还是绿的。</p><p class="en" lang="en">Went back to the garden in the afternoon; the leaves were still green.</p></section>
<figcaption lang="en">Cover image of the trellis in late summer.<span class="zh" lang="zh">夏末架子上的封面图。</span></figcaption>
</article>`;
		expect(looksBilingual(caption)).toBe(true);
		const marked = markRecoveredLanguagePairs(caption);
		expect(marked).toMatch(/<span class="en" lang="en">Cover image of the trellis in late summer\.<\/span>/);
		expect(marked).toContain('<span class="zh" lang="zh">夏末架子上的封面图。</span>');
		expect(CONTENT_LANG_STYLE).toContain(':not(:has(.zh, .zh-inline, .zh-list, [lang^="zh"]))');
	});

	it('wraps bare Chinese text that shares a list item with an English sibling', () => {
		const list = `<article>
<p>花园里的番茄已经红了，枝头沉甸甸的。</p>
<p class="en">The tomatoes in the garden have turned red and hang heavy.</p>
<ul>
<li>产品特定的事<br/><br/>我们要确保用户不会害怕 agent 操作。<div class="en">Product specific things. Make sure users are not afraid of the agent.</div></li>
<li>仓库里的工具必须可发现。<div class="en">Tools in the repo must be discoverable.</div></li>
</ul>
</article>`;
		expect(looksBilingual(list)).toBe(true);
		const marked = markRecoveredLanguagePairs(list);
		expect(marked).toMatch(/<span class="zh" lang="zh">产品特定的事/);
		expect(marked).toContain('<div class="en">Product specific things.');
	});

	it('pairs zh-list/en-list, ol+div.en lists, strong+span.en, and zh-inline/en-inline', () => {
		const lists = `<article>
<ol class="zh-list"><li>先浇水再收番茄。</li><li>把最沉的果子先摘下来。</li></ol>
<ol class="en en-list"><li>Water first, then harvest tomatoes.</li><li>Pick the heaviest fruit first.</li></ol>
<ol><li>2023 — 收益挖矿与全链叙事</li><li>2024 — 稳定币收益与金库</li></ol>
<div class="en"><ol><li>2023 — Yield farming and an omnichain thesis</li><li>2024 — Stablecoin yield and vaults</li></ol></div>
<ul>
<li><strong>获得即时满足的能力</strong><span class="en">The ability to get instant gratification</span></li>
<li><strong>把花园记录写下来</strong><span class="en">Write the garden notes down</span></li>
</ul>
<h2><span class="zh-inline">基础篇</span><span class="en-inline"> / Foundation</span></h2>
<p class="zh">开源模型是什么、怎么跑、以及相关风险。</p>
<p class="en">What open models are, how to run them, and the related risks.</p>
</article>`;
		expect(looksBilingual(lists)).toBe(true);
		const marked = markRecoveredLanguagePairs(lists);
		expect(marked).toMatch(/<ol class="zh-list"/);
		expect(marked).toMatch(/<ol class="zh" lang="zh">/);
		expect(marked).toMatch(/<strong class="zh" lang="zh">获得即时满足的能力<\/strong>/);
		expect(marked).toContain('class="zh-inline"');
		expect(marked).toContain('class="en-inline"');
		expect(CONTENT_LANG_STYLE).toContain('.zh-inline');
		expect(CONTENT_LANG_STYLE).toContain('.en-inline');
		expect(CONTENT_LANG_STYLE).toContain('.zh-list');
		expect(CONTENT_LANG_STYLE).toContain('--archive-cl-active-bg');
		expect(CONTENT_LANG_STYLE).not.toContain('var(--accent, #0c6a52)');
	});
});
