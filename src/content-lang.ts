import { analyzeArticleLanguage } from './content-lang-detect';
import { t, type Locale } from './i18n';
import { escapeHtml } from './util';

export { analyzeArticleLanguage, classifyTextRole, markRecoveredLanguagePairs, measureContentLang, looksBilingualLegacy } from './content-lang-detect';

export const CONTENT_LANG_STORAGE_KEY = 'archive_content_lang';
export type ContentLang = 'zh' | 'en' | 'both';

const STRUCTURAL_TAGS = new Set(['html', 'head', 'body', 'main', 'article']);
const ZH_CLASS = /(^|\s)(zh|cn|bi-zh|lang-zh)(\s|$)/i;
const EN_CLASS = /(^|\s)(en|tr|orig|bi-en|lang-en)(\s|$)/i;
const PAIR_CLASS = /(^|\s)(pair|bilingual|bi-pair|lang-pair)(\s|$)/i;

export type BilingualScanState = {
	zh: number;
	en: number;
	hasPair: boolean;
};

export function parseContentLangParam(value: string | null | undefined): ContentLang | null {
	if (value === 'zh' || value === 'en' || value === 'both') {
		return value;
	}
	return null;
}

export function contentLangHref(lang: ContentLang, currentPath: string): string {
	const [pathPart = '/', query = ''] = currentPath.split('?');
	const params = new URLSearchParams(query);
	if (lang === 'both') {
		params.delete('lang');
	} else {
		params.set('lang', lang);
	}
	const qs = params.toString();
	return qs ? `${pathPart}?${qs}` : pathPart || '/';
}

export function createBilingualScanState(): BilingualScanState {
	return { zh: 0, en: 0, hasPair: false };
}

export function classifyContentLang(
	tagName: string,
	lang: string | null,
	className: string | null,
	dataLang: string | null = null,
): ContentLang | null {
	const tag = tagName.toLowerCase();
	if (STRUCTURAL_TAGS.has(tag)) {
		return null;
	}
	const langNorm = (dataLang || lang || '').trim().toLowerCase();
	const cls = className || '';
	if (langNorm === 'zh' || langNorm.startsWith('zh-') || ZH_CLASS.test(cls)) {
		return 'zh';
	}
	if (langNorm === 'en' || langNorm.startsWith('en-') || EN_CLASS.test(cls)) {
		return 'en';
	}
	return null;
}

export function observeLangMark(
	state: BilingualScanState,
	tagName: string,
	lang: string | null,
	className: string | null,
	dataLang: string | null = null,
): void {
	if (PAIR_CLASS.test(className || '')) {
		state.hasPair = true;
	}
	const kind = classifyContentLang(tagName, lang, className, dataLang);
	if (kind === 'zh') {
		state.zh += 1;
	} else if (kind === 'en') {
		state.en += 1;
	}
}

export function isBilingualScan(state: BilingualScanState): boolean {
	if (state.zh < 1 || state.en < 1) {
		return false;
	}
	if (state.hasPair) {
		return true;
	}
	if (state.zh >= 2 && state.en >= 2) {
		return true;
	}
	const min = Math.min(state.zh, state.en);
	const max = Math.max(state.zh, state.en);
	return max <= min * 3 + 2;
}

function attr(source: string, name: string): string | null {
	const match = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(source);
	return match ? (match[1] ?? match[2] ?? null) : null;
}

/** Server-side / unit-test scan of stored article HTML. Ignores html/body/main/article lang. */
export function looksBilingual(html: string): boolean {
	return analyzeArticleLanguage(html).bilingual;
}

export function isPairClass(className: string | null | undefined): boolean {
	return PAIR_CLASS.test(className || '');
}

export function isTitleHeader(tagName: string, className: string | null | undefined): boolean {
	if (tagName.toLowerCase() !== 'header') {
		return false;
	}
	return /(^|\s)(meta|title|masthead|article-header|post-header)(\s|$)/i.test(className || '');
}

export function isBylineLike(tagName: string, className: string | null | undefined): boolean {
	const tag = tagName.toLowerCase();
	const cls = className || '';
	if (tag === 'time' || tag === 'address') {
		return true;
	}
	if (/(^|\s)(byline|meta|author|subtitle|kicker|dek|source|date|info|credit)(\s|$)/i.test(cls)) {
		return true;
	}
	return false;
}

const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

function findMatchingClose(html: string, tag: string, from: number): number {
	const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi');
	re.lastIndex = from;
	let depth = 1;
	for (let match = re.exec(html); match; match = re.exec(html)) {
		const raw = match[0];
		if (match[1]) {
			depth -= 1;
			if (depth === 0) {
				return match.index + raw.length;
			}
		} else if (!raw.endsWith('/>')) {
			depth += 1;
		}
	}
	return -1;
}

function framesAt(html: string, pos: number): Array<{ tag: string; attrs: string }> {
	const stack: Array<{ tag: string; attrs: string }> = [];
	const re = /<\/?([a-zA-Z][\w:-]*)\b([^>]*)>/g;
	for (let match = re.exec(html); match && match.index < pos; match = re.exec(html)) {
		const tag = (match[1] ?? '').toLowerCase();
		const raw = match[0];
		if (VOID_TAGS.has(tag) || raw.endsWith('/>')) {
			continue;
		}
		if (raw.startsWith('</')) {
			for (let i = stack.length - 1; i >= 0; i -= 1) {
				if (stack[i]?.tag === tag) {
					stack.length = i;
					break;
				}
			}
			continue;
		}
		stack.push({ tag, attrs: match[2] ?? '' });
	}
	return stack;
}

function firstH1(html: string): { index: number; end: number; attrs: string } | null {
	const re = /<h1\b([^>]*)>/i;
	const match = re.exec(html);
	if (!match) {
		return null;
	}
	const close = findMatchingClose(html, 'h1', match.index + match[0].length);
	return { index: match.index, end: close === -1 ? match.index + match[0].length : close, attrs: match[1] ?? '' };
}

function skipWhitespace(html: string, pos: number): number {
	let index = pos;
	while (index < html.length) {
		const ch = html[index];
		if (ch && /\s/.test(ch)) {
			index += 1;
			continue;
		}
		if (html.startsWith('<!--', index)) {
			const end = html.indexOf('-->', index + 4);
			index = end === -1 ? html.length : end + 3;
			continue;
		}
		break;
	}
	return index;
}

function nextElement(html: string, pos: number): { tag: string; attrs: string; start: number; end: number } | null {
	const index = skipWhitespace(html, pos);
	const match = /^<([a-zA-Z][\w:-]*)\b([^>]*)>/.exec(html.slice(index));
	if (!match) {
		return null;
	}
	const tag = (match[1] ?? '').toLowerCase();
	const endOpen = index + match[0].length;
	const close = VOID_TAGS.has(tag) || match[0].endsWith('/>') ? endOpen : findMatchingClose(html, tag, endOpen);
	return { tag, attrs: match[2] ?? '', start: index, end: close === -1 ? endOpen : close };
}

function insertAfterOpenTag(html: string, pattern: RegExp, switchHtml: string): string | null {
	const match = pattern.exec(html);
	if (!match) {
		return null;
	}
	const at = match.index + match[0].length;
	return `${html.slice(0, at)}${switchHtml}${html.slice(at)}`;
}

/** Place the serve-time switch after the title (or a sensible fallback). Used by tests and mirrors the client mover. */
export function insertSwitchIntoArticleHtml(html: string, switchHtml: string): string {
	const title = firstH1(html);
	if (!title) {
		return (
			insertAfterOpenTag(html, /<article\b[^>]*>/i, switchHtml) ??
			insertAfterOpenTag(html, /<main\b[^>]*>/i, switchHtml) ??
			insertAfterOpenTag(html, /<body\b[^>]*>/i, switchHtml) ??
			`${switchHtml}${html}`
		);
	}

	const frames = framesAt(html, title.index);
	for (let i = frames.length - 1; i >= 0; i -= 1) {
		const frame = frames[i];
		if (!frame) {
			continue;
		}
		if (isPairClass(attr(frame.attrs, 'class')) || isTitleHeader(frame.tag, attr(frame.attrs, 'class'))) {
			const close = findMatchingClose(html, frame.tag, title.end);
			if (close !== -1) {
				return `${html.slice(0, close)}${switchHtml}${html.slice(close)}`;
			}
		}
	}

	let pos = title.end;
	const twin = nextElement(html, pos);
	if (twin?.tag === 'h1' && classifyContentLang('h1', attr(twin.attrs, 'lang'), attr(twin.attrs, 'class'), attr(twin.attrs, 'data-lang'))) {
		pos = twin.end;
	}
	for (;;) {
		const sibling = nextElement(html, pos);
		if (!sibling || !isBylineLike(sibling.tag, attr(sibling.attrs, 'class'))) {
			break;
		}
		pos = sibling.end;
	}
	return `${html.slice(0, pos)}${switchHtml}${html.slice(pos)}`;
}

const SWITCH_EXCLUSION =
	':not([data-archive-chrome]):not([data-archive-chrome] *):not([data-archive-content-lang-switch]):not([data-archive-content-lang-switch] *):not(#archive-lightbox):not(#archive-lightbox *):not(#archive-share-dialog):not(#archive-share-dialog *)';

const CHROME_EXCLUSION = SWITCH_EXCLUSION;

const LANG_BLOCKS = 'p, h1, h2, h3, h4, h5, h6, li, dt, dd, blockquote, figcaption, span, small, em, strong, td, th, div, section';

const BILINGUAL_ROOT = 'html[data-bilingual]';

/** Hide/show language-marked blocks. Only when the page is bilingual so Chinese-only never loses content. */
export const CONTENT_LANG_STYLE = `
${BILINGUAL_ROOT}[data-content-lang="zh"] body :is(.en, .tr, .orig, .bi-en, .lang-en, [data-lang="en"], [data-lang^="en-"])${CHROME_EXCLUSION} { display: none !important; }
${BILINGUAL_ROOT}[data-content-lang="zh"] body :is(${LANG_BLOCKS})[lang="en"]${CHROME_EXCLUSION},
${BILINGUAL_ROOT}[data-content-lang="zh"] body :is(${LANG_BLOCKS})[lang^="en-"]${CHROME_EXCLUSION} { display: none !important; }
${BILINGUAL_ROOT}[data-content-lang="en"] body :is(.zh, .cn, .bi-zh, .lang-zh, [data-lang="zh"], [data-lang^="zh-"])${CHROME_EXCLUSION} { display: none !important; }
${BILINGUAL_ROOT}[data-content-lang="en"] body :is(${LANG_BLOCKS})[lang^="zh"]${CHROME_EXCLUSION} { display: none !important; }
${BILINGUAL_ROOT}[data-content-lang="en"] body p:has(+ p.en)${CHROME_EXCLUSION},
${BILINGUAL_ROOT}[data-content-lang="en"] body h1:has(+ h1.en)${CHROME_EXCLUSION},
${BILINGUAL_ROOT}[data-content-lang="en"] body h2:has(+ h2.en)${CHROME_EXCLUSION},
${BILINGUAL_ROOT}[data-content-lang="en"] body h3:has(+ h3.en)${CHROME_EXCLUSION},
${BILINGUAL_ROOT}[data-content-lang="en"] body li:has(+ li.en)${CHROME_EXCLUSION},
${BILINGUAL_ROOT}[data-content-lang="en"] body blockquote:has(+ blockquote.en)${CHROME_EXCLUSION} { display: none !important; }
[data-archive-chrome] .chrome-prefs { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 8px; }
nav[data-archive-content-lang-switch],
[data-archive-content-lang-switch] {
  display: none;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  margin: 0.15em 0 1.05em;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--fg, #1a1814);
  font: 12px/1.25 ui-sans-serif, system-ui, -apple-system, "Segoe UI", "PingFang SC", "Noto Sans SC", sans-serif;
  letter-spacing: 0;
  text-align: left;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
@media (prefers-color-scheme: dark) {
  html:not([data-theme="light"]) [data-archive-content-lang-switch] { color: var(--fg, #f4efe6); }
}
html[data-theme="dark"] [data-archive-content-lang-switch] { color: var(--fg, #f4efe6); }
html[data-theme="light"] [data-archive-content-lang-switch] { color: var(--fg, #1a1814); }
html[data-bilingual] [data-archive-content-lang-switch] {
  display: flex !important;
}
[data-archive-content-lang-switch][hidden] { display: none !important; }
[data-archive-content-lang-switch] .archive-content-lang-label {
  color: var(--muted, #6b645a) !important;
  font-size: 11px !important;
  font-weight: 550;
  letter-spacing: 0.02em;
  white-space: nowrap;
}
[data-archive-content-lang-switch] .archive-content-lang-seg {
  display: inline-flex;
  flex-wrap: wrap;
  border: 1px solid var(--border, #e4ddd0) !important;
  border-radius: 999px;
  overflow: hidden;
  background: var(--card, #fffdf8) !important;
  color: inherit !important;
}
[data-archive-content-lang-switch] .archive-content-lang-seg a {
  padding: 4px 10px !important;
  text-decoration: none !important;
  color: var(--fg, #1a1814) !important;
  background: transparent !important;
  white-space: nowrap;
  border: 0 !important;
  font: inherit !important;
}
html[data-theme="dark"] [data-archive-content-lang-switch] .archive-content-lang-seg a {
  color: var(--fg, #f4efe6) !important;
}
@media (prefers-color-scheme: dark) {
  html:not([data-theme="light"]) [data-archive-content-lang-switch] .archive-content-lang-seg a { color: var(--fg, #f4efe6) !important; }
}
[data-archive-content-lang-switch] .archive-content-lang-seg a.active {
  color: var(--accent-fg, #fff) !important;
  background: var(--accent, #0c6a52) !important;
}
[data-archive-content-lang-switch] .archive-content-lang-seg a:hover:not(.active) {
  background: color-mix(in srgb, var(--accent, #0c6a52) 12%, var(--card, #fffdf8)) !important;
}
@media (max-width: 420px) {
  [data-archive-content-lang-switch] { font-size: 11px; margin-bottom: 0.9em; }
  [data-archive-content-lang-switch] .archive-content-lang-seg a { padding: 4px 8px !important; }
}
`;

export function contentLangStyleTag(): string {
	return `<style data-archive-content-lang>${CONTENT_LANG_STYLE}</style>`;
}

export const CONTENT_LANG_BOOTSTRAP = `<script>
(function () {
  var key = '${CONTENT_LANG_STORAGE_KEY}';
  var root = document.documentElement;
  var allowed = { zh: 1, en: 1, both: 1 };
  var chosen = null;
  try {
    var fromUrl = new URLSearchParams(location.search).get('lang');
    var fromAttr = root.getAttribute('data-content-lang');
    if (fromUrl && allowed[fromUrl]) {
      chosen = fromUrl;
    } else if (fromAttr && allowed[fromAttr]) {
      chosen = fromAttr;
    } else {
      var stored = localStorage.getItem(key);
      if (stored && allowed[stored]) chosen = stored;
    }
  } catch (err) {}
  root.setAttribute('data-content-lang', chosen || 'both');
})();
</script>`;

export const CONTENT_LANG_SCRIPT = `<script data-archive-content-lang-script>
(function () {
  var key = '${CONTENT_LANG_STORAGE_KEY}';
  var root = document.documentElement;
  var allowed = { zh: 1, en: 1, both: 1 };
  var ZH_CLASS = /(^|\\s)(zh|cn|bi-zh|lang-zh)(\\s|$)/i;
  var EN_CLASS = /(^|\\s)(en|tr|orig|bi-en|lang-en)(\\s|$)/i;
  var PAIR_CLASS = /(^|\\s)(pair|bilingual|bi-pair|lang-pair)(\\s|$)/i;
  var STRUCT = { html: 1, head: 1, body: 1, main: 1, article: 1 };

  function current() {
    var value = root.getAttribute('data-content-lang');
    return allowed[value] ? value : 'both';
  }

  function sync(value) {
    var links = document.querySelectorAll('[data-content-lang-set]');
    for (var i = 0; i < links.length; i++) {
      var link = links[i];
      var on = link.getAttribute('data-content-lang-set') === value;
      if (on) {
        link.classList.add('active');
        link.setAttribute('aria-current', 'true');
      } else {
        link.classList.remove('active');
        link.removeAttribute('aria-current');
      }
    }
  }

  function apply(value, persist) {
    if (!allowed[value]) value = 'both';
    root.setAttribute('data-content-lang', value);
    if (persist) {
      try { localStorage.setItem(key, value); } catch (err) {}
      try {
        var url = new URL(location.href);
        if (value === 'both') url.searchParams.delete('lang');
        else url.searchParams.set('lang', value);
        history.replaceState(null, '', url.pathname + url.search + url.hash);
      } catch (err) {}
    }
    sync(value);
  }

  function inChrome(el) {
    return !!(el && el.closest && el.closest('[data-archive-chrome], [data-archive-content-lang-switch], #archive-lightbox, #archive-share-dialog'));
  }

  function isByline(el) {
    if (!el || !el.tagName) return false;
    var tag = String(el.tagName).toLowerCase();
    var cls = el.getAttribute('class') || '';
    if (tag === 'time' || tag === 'address') return true;
    if (/(^|\\s)(byline|meta|author|subtitle|kicker|dek|source|date|info|credit)(\\s|$)/i.test(cls)) return true;
    if (tag === 'p' && el.querySelector && el.querySelector('time')) return true;
    return false;
  }

  function firstTitleH1() {
    var nodes = document.querySelectorAll('h1');
    for (var i = 0; i < nodes.length; i++) {
      if (inChrome(nodes[i])) continue;
      return nodes[i];
    }
    return null;
  }

  function placeSwitch(sw) {
    if (!sw || !sw.parentNode) return;
    var h1 = firstTitleH1();
    if (h1) {
      var pair = h1.closest && h1.closest('.pair, .bilingual, .bi-pair, .lang-pair');
      var header = h1.closest && h1.closest('header.meta, header.title, header.masthead, header.article-header, header.post-header');
      var node = pair || header || h1;
      if (!pair && !header) {
        var twin = h1.nextElementSibling;
        if (twin && String(twin.tagName).toLowerCase() === 'h1' && markOf(twin)) node = twin;
        while (node.nextElementSibling && isByline(node.nextElementSibling)) node = node.nextElementSibling;
      }
      if (node.nextElementSibling !== sw) node.after(sw);
      return;
    }
    var root = document.querySelector('article, main');
    if (root) {
      if (sw.parentNode === root && root.firstElementChild === sw) return;
      root.insertBefore(sw, root.firstChild);
      return;
    }
    var chrome = document.querySelector('[data-archive-chrome]');
    if (chrome && chrome.nextElementSibling !== sw) chrome.after(sw);
  }

  function markOf(el) {
    if (!el || !el.tagName || STRUCT[String(el.tagName).toLowerCase()] || inChrome(el)) return null;
    var lang = String(el.getAttribute('data-lang') || el.getAttribute('lang') || '').toLowerCase();
    var cls = el.getAttribute('class') || '';
    if (lang === 'zh' || lang.indexOf('zh-') === 0 || ZH_CLASS.test(cls)) return 'zh';
    if (lang === 'en' || lang.indexOf('en-') === 0 || EN_CLASS.test(cls)) return 'en';
    return null;
  }

  function textOf(el) {
    return String(el.textContent || '').replace(/\\s+/g, ' ').trim();
  }

  function classifyText(text) {
    var raw = String(text || '').replace(/\\s+/g, ' ').trim();
    if (!raw) return 'neutral';
    var cjk = (raw.match(/[\\u3400-\\u9FFF\\uF900-\\uFAFF]/g) || []).length;
    var stripped = raw.replace(/https?:\\/\\/[^\\s<>"']+|www\\.[^\\s<>"']+|\\b[a-z0-9][a-z0-9.-]*\\.[a-z]{2,}(?:\\/[^\\s<>"']*)?/gi, ' ');
    stripped = stripped.replace(/\\b[\\w.+-]+@[\\w.-]+\\.[a-z]{2,}\\b/gi, ' ');
    var lat = (stripped.match(/[A-Za-z]/g) || []).length;
    var latAll = (raw.match(/[A-Za-z]/g) || []).length;
    if (cjk >= 4 && cjk >= lat) return 'zh';
    if (lat < 8 && cjk < 4) {
      if (latAll >= 8 || /https?:\\/\\/|www\\.|\\.[a-z]{2,}\\//i.test(raw)) return 'url';
      return 'neutral';
    }
    if (lat >= 12 && lat > cjk * 2) return 'en';
    if (cjk >= 4) return 'zh';
    return 'neutral';
  }

  function roleOf(el) {
    var marked = markOf(el);
    if (marked) return marked;
    return classifyText(textOf(el));
  }

  function transparent(el) {
    if (!el || !el.tagName) return false;
    return /^(FIGURE|IMG|HR|BR|SCRIPT|STYLE|PICTURE|SVG|IFRAME|VIDEO|AUDIO)$/.test(el.tagName);
  }

  function nextPartner(el) {
    var n = el.nextElementSibling;
    while (n && transparent(n)) n = n.nextElementSibling;
    return n;
  }

  function canPair(a, b) {
    if (!a || !b || inChrome(a) || inChrome(b)) return false;
    if (a.parentElement !== b.parentElement) return false;
    var aMark = markOf(a);
    var bMark = markOf(b);
    if (String(a.tagName) !== String(b.tagName) && !aMark && !bMark) return false;
    var aRole = roleOf(a);
    var bRole = roleOf(b);
    if (aRole === 'url' || aRole === 'code' || bRole === 'url' || bRole === 'code') return false;
    if ((aRole === 'zh' && bRole === 'en') || (aRole === 'en' && bRole === 'zh')) return true;
    return false;
  }

  function markPair(el, lang) {
    if (markOf(el)) return;
    el.classList.add(lang);
    if (!el.getAttribute('lang')) el.setAttribute('lang', lang);
  }

  function detectAndMark() {
    var zh = 0;
    var en = 0;
    var hasPair = false;
    var pairable = 0;
    var nodes = document.body ? document.body.getElementsByTagName('*') : [];
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (inChrome(el)) continue;
      if (PAIR_CLASS.test(el.getAttribute('class') || '')) hasPair = true;
      var kind = markOf(el);
      if (kind === 'zh') zh += 1;
      if (kind === 'en') en += 1;
    }

    var blocks = document.body ? document.body.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, dt, dd, blockquote, figcaption') : [];
    var candidates = [];
    var used = [];
    function taken(node) {
      for (var u = 0; u < used.length; u++) if (used[u] === node) return true;
      return false;
    }
    for (var j = 0; j < blocks.length; j++) {
      var a = blocks[j];
      if (inChrome(a) || taken(a)) continue;
      var role = roleOf(a);
      if (role === 'zh' || role === 'en' || markOf(a)) pairable += 1;
      var b = nextPartner(a);
      if (!b || taken(b) || !canPair(a, b)) continue;
      candidates.push([a, b]);
      used.push(a);
      used.push(b);
    }

    var recovered = candidates.length;
    var bilingual = false;
    if (hasPair && zh >= 1 && en >= 1) bilingual = true;
    else if (zh >= 1 && en >= 1 && (zh >= 2 && en >= 2 || Math.max(zh, en) <= Math.min(zh, en) * 3 + 2)) bilingual = true;
    else if (recovered >= 2 && recovered >= Math.max(2, Math.ceil(pairable / 6))) bilingual = true;

    if (!bilingual) return false;
    for (var k = 0; k < candidates.length; k++) {
      var left = candidates[k][0];
      var right = candidates[k][1];
      if (roleOf(left) === 'zh') markPair(left, 'zh');
      if (roleOf(left) === 'en') markPair(left, 'en');
      if (roleOf(right) === 'zh') markPair(right, 'zh');
      if (roleOf(right) === 'en') markPair(right, 'en');
    }
    return true;
  }

  var detected = detectAndMark();
  var bilingual = root.getAttribute('data-bilingual') === '1' || detected;
  var switches = document.querySelectorAll('[data-archive-content-lang-switch], [data-content-lang-switch]');
  for (var p = 0; p < switches.length; p++) placeSwitch(switches[p]);
  if (bilingual) {
    root.setAttribute('data-bilingual', '1');
    for (var s = 0; s < switches.length; s++) switches[s].removeAttribute('hidden');
    var fromUrl = null;
    try { fromUrl = new URLSearchParams(location.search).get('lang'); } catch (err) {}
    if (fromUrl && allowed[fromUrl]) apply(fromUrl, true);
  } else {
    root.removeAttribute('data-bilingual');
    apply('both', false);
    for (var h = 0; h < switches.length; h++) switches[h].setAttribute('hidden', '');
  }

  sync(current());

  document.addEventListener('click', function (event) {
    var target = event.target;
    var link = target && target.closest ? target.closest('[data-content-lang-set]') : null;
    if (!link) return;
    event.preventDefault();
    apply(link.getAttribute('data-content-lang-set'), true);
  });
})();
</script>`;

export const CONTENT_LANG_HINT = `<script data-archive-content-lang-hint>document.documentElement.setAttribute('data-bilingual','1');</script>`;

export function contentLangSwitch(locale: Locale, path: string, active: ContentLang | null): string {
	const current = active ?? 'both';
	const options: Array<{ value: ContentLang; key: 'contentLangZh' | 'contentLangEn' | 'contentLangBoth' }> = [
		{ value: 'zh', key: 'contentLangZh' },
		{ value: 'en', key: 'contentLangEn' },
		{ value: 'both', key: 'contentLangBoth' },
	];
	return `<nav data-archive-content-lang-switch data-content-lang-switch role="group" aria-label="${escapeHtml(t(locale, 'contentLangToggle'))}">
    <span class="archive-content-lang-label">${escapeHtml(t(locale, 'contentLangShort'))}</span>
    <span class="archive-content-lang-seg">${options
			.map((option) => {
				const isActive = current === option.value;
				return `<a class="${isActive ? 'active' : ''}" href="${escapeHtml(contentLangHref(option.value, path))}" data-content-lang-set="${option.value}"${isActive ? ' aria-current="true"' : ''}>${escapeHtml(t(locale, option.key))}</a>`;
			})
			.join('')}</span>
  </nav>`;
}

export type PlacementState = {
	placed: boolean;
	sawH1: boolean;
	titleInPair: boolean;
	pairDepth: number;
	headerDepth: number;
	pendingAfterTitle: boolean;
	articleDepth: number;
	mainDepth: number;
};

export function createPlacementState(): PlacementState {
	return {
		placed: false,
		sawH1: false,
		titleInPair: false,
		pairDepth: 0,
		headerDepth: 0,
		pendingAfterTitle: false,
		articleDepth: 0,
		mainDepth: 0,
	};
}

export function handlePlacementElement(state: PlacementState, element: Element, markup: string): void {
	const tag = element.tagName.toLowerCase();
	const className = element.getAttribute('class');

	const afterEnd = (end: { after: (content: string, options: { html: boolean }) => void }) => {
		if (state.placed) {
			return;
		}
		end.after(markup, { html: true });
		state.placed = true;
		state.pendingAfterTitle = false;
	};

	const beforeEl = () => {
		if (state.placed) {
			return;
		}
		element.before(markup, { html: true });
		state.placed = true;
		state.pendingAfterTitle = false;
	};

	if (isPairClass(className)) {
		state.pairDepth += 1;
		element.onEndTag((end) => {
			state.pairDepth -= 1;
			if (!state.placed && state.sawH1 && state.titleInPair && state.pairDepth === 0) {
				afterEnd(end);
			}
		});
	}

	if (isTitleHeader(tag, className)) {
		state.headerDepth += 1;
		element.onEndTag((end) => {
			state.headerDepth -= 1;
			if (!state.placed && state.sawH1 && !state.titleInPair && state.headerDepth === 0) {
				afterEnd(end);
			}
		});
	}

	if (tag === 'article') {
		state.articleDepth += 1;
		element.onEndTag((end) => {
			state.articleDepth -= 1;
			if (!state.placed && state.pendingAfterTitle && state.articleDepth === 0) {
				end.before(markup, { html: true });
				state.placed = true;
				state.pendingAfterTitle = false;
			}
		});
	}

	if (tag === 'main') {
		state.mainDepth += 1;
		element.onEndTag((end) => {
			state.mainDepth -= 1;
			if (!state.placed && state.pendingAfterTitle && state.mainDepth === 0) {
				end.before(markup, { html: true });
				state.placed = true;
				state.pendingAfterTitle = false;
			}
		});
	}

	if (tag === 'h1') {
		if (!state.sawH1) {
			state.sawH1 = true;
			if (state.pairDepth > 0) {
				state.titleInPair = true;
			}
			element.onEndTag(() => {
				if (state.placed || state.titleInPair || state.headerDepth > 0) {
					return;
				}
				state.pendingAfterTitle = true;
			});
			return;
		}
		if (state.pendingAfterTitle) {
			element.onEndTag(() => {
				state.pendingAfterTitle = true;
			});
		}
		return;
	}

	if (state.placed || !state.pendingAfterTitle) {
		return;
	}
	if (isBylineLike(tag, className)) {
		return;
	}
	beforeEl();
}

export function finishPlacement(state: PlacementState, end: { before: (content: string, options: { html: boolean }) => void }, markup: string): void {
	if (state.placed) {
		return;
	}
	end.before(markup, { html: true });
	state.placed = true;
	state.pendingAfterTitle = false;
}

