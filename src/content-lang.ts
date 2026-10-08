import { t, type Locale } from './i18n';
import { escapeHtml } from './util';

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
	const state = createBilingualScanState();
	const stripped = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
	const tagRe = /<([a-zA-Z][\w:-]*)\b([^>]*)>/g;
	for (let match = tagRe.exec(stripped); match; match = tagRe.exec(stripped)) {
		const attrs = match[2] ?? '';
		observeLangMark(state, match[1] ?? '', attr(attrs, 'lang'), attr(attrs, 'class'), attr(attrs, 'data-lang'));
	}
	return isBilingualScan(state);
}

const CHROME_EXCLUSION =
	':not([data-archive-chrome]):not([data-archive-chrome] *):not(#archive-lightbox):not(#archive-lightbox *):not(#archive-share-dialog):not(#archive-share-dialog *)';

const LANG_BLOCKS = 'p, h1, h2, h3, h4, h5, h6, li, dt, dd, blockquote, figcaption, span, small, em, strong, td, th, div, section';

/** Hide/show language-marked blocks. Unmarked headings, figures, images, and code stay visible. */
export const CONTENT_LANG_STYLE = `
html[data-content-lang="zh"] body :is(.en, .tr, .orig, .bi-en, .lang-en, [data-lang="en"], [data-lang^="en-"])${CHROME_EXCLUSION} { display: none !important; }
html[data-content-lang="zh"] body :is(${LANG_BLOCKS})[lang="en"]${CHROME_EXCLUSION},
html[data-content-lang="zh"] body :is(${LANG_BLOCKS})[lang^="en-"]${CHROME_EXCLUSION} { display: none !important; }
html[data-content-lang="en"] body :is(.zh, .cn, .bi-zh, .lang-zh, [data-lang="zh"], [data-lang^="zh-"])${CHROME_EXCLUSION} { display: none !important; }
html[data-content-lang="en"] body :is(${LANG_BLOCKS})[lang^="zh"]${CHROME_EXCLUSION} { display: none !important; }
[data-archive-chrome] .chrome-prefs { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 8px; }
[data-archive-chrome] .content-lang-switch {
  display: none;
  border: 1px solid rgba(255,255,255,.22);
  border-radius: 999px;
  overflow: hidden;
  font-size: 12px;
  line-height: 1.2;
  background: transparent;
  align-items: stretch;
}
html[data-bilingual] [data-archive-chrome] .content-lang-switch,
html:has(.pair .zh):has(.pair .en) [data-archive-chrome] .content-lang-switch,
html:has(p.zh):has(p.en) [data-archive-chrome] .content-lang-switch,
html:has(p[lang^="zh"]):has(p[lang="en"]) [data-archive-chrome] .content-lang-switch,
html:has(figcaption .zh):has(figcaption .en) [data-archive-chrome] .content-lang-switch,
html:has(.tweet-card .zh):has(.tweet-card .en) [data-archive-chrome] .content-lang-switch,
html:has(blockquote .zh):has(blockquote .en) [data-archive-chrome] .content-lang-switch {
  display: inline-flex;
}
[data-archive-chrome] .content-lang-switch[hidden] { display: none !important; }
[data-archive-chrome] .content-lang-switch-label {
  padding: 4px 8px 4px 10px;
  color: #9fe0c4;
  border-right: 1px solid rgba(255,255,255,.12);
  font-size: 11px;
  letter-spacing: 0.02em;
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
}
[data-archive-chrome] .content-lang-switch a {
  padding: 4px 8px;
  text-decoration: none;
  color: #f4f1ea;
  background: transparent;
  white-space: nowrap;
}
[data-archive-chrome] .content-lang-switch a.active {
  color: #12211b;
  background: #9fe0c4;
}
[data-archive-chrome] .content-lang-switch a:hover:not(.active) {
  background: rgba(159, 224, 196, 0.16);
  color: #f4f1ea;
}
@media (max-width: 420px) {
  [data-archive-chrome] .content-lang-switch { font-size: 11px; }
  [data-archive-chrome] .content-lang-switch-label { padding: 4px 6px 4px 8px; }
  [data-archive-chrome] .content-lang-switch a { padding: 4px 7px; }
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
      localStorage.setItem(key, fromUrl);
    } else if (fromAttr && allowed[fromAttr]) {
      chosen = fromAttr;
      localStorage.setItem(key, fromAttr);
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
    return !!(el && el.closest && el.closest('[data-archive-chrome], #archive-lightbox, #archive-share-dialog'));
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

  function isCjk(text) {
    var cjk = (text.match(/[\\u3400-\\u9FFF\\uF900-\\uFAFF]/g) || []).length;
    var lat = (text.match(/[A-Za-z]/g) || []).length;
    return cjk >= 4 && cjk > lat;
  }

  function isLat(text) {
    var cjk = (text.match(/[\\u3400-\\u9FFF\\uF900-\\uFAFF]/g) || []).length;
    var lat = (text.match(/[A-Za-z]/g) || []).length;
    return lat >= 12 && lat > cjk * 2;
  }

  function detectAndMark() {
    var zh = 0;
    var en = 0;
    var hasPair = false;
    var nodes = document.body ? document.body.getElementsByTagName('*') : [];
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (inChrome(el)) continue;
      if (PAIR_CLASS.test(el.getAttribute('class') || '')) hasPair = true;
      var kind = markOf(el);
      if (kind === 'zh') zh += 1;
      if (kind === 'en') en += 1;
    }

    var blocks = document.body ? document.body.querySelectorAll('p, h2, h3, h4, h5, h6, li, blockquote') : [];
    var candidates = [];
    for (var j = 0; j < blocks.length; j++) {
      var a = blocks[j];
      var b = a.nextElementSibling;
      if (!b || inChrome(a) || inChrome(b) || markOf(a) || markOf(b)) continue;
      if (a.tagName !== b.tagName || a.parentElement !== b.parentElement) continue;
      if (isCjk(textOf(a)) && isLat(textOf(b))) candidates.push([a, b]);
    }
    if (candidates.length >= 2) {
      for (var k = 0; k < candidates.length; k++) {
        candidates[k][0].classList.add('zh');
        if (!candidates[k][0].getAttribute('lang')) candidates[k][0].setAttribute('lang', 'zh');
        candidates[k][1].classList.add('en');
        if (!candidates[k][1].getAttribute('lang')) candidates[k][1].setAttribute('lang', 'en');
        zh += 1;
        en += 1;
      }
    }

    if (zh < 1 || en < 1) return false;
    if (hasPair || candidates.length >= 2) return true;
    if (zh >= 2 && en >= 2) return true;
    return Math.max(zh, en) <= Math.min(zh, en) * 3 + 2;
  }

  var bilingual = root.getAttribute('data-bilingual') === '1' || detectAndMark();
  var switches = document.querySelectorAll('[data-content-lang-switch]');
  if (bilingual) {
    root.setAttribute('data-bilingual', '1');
    for (var s = 0; s < switches.length; s++) switches[s].removeAttribute('hidden');
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
	return `<span class="content-lang-switch" data-content-lang-switch role="group" aria-label="${escapeHtml(t(locale, 'contentLangToggle'))}">
    <span class="content-lang-switch-label">${escapeHtml(t(locale, 'contentLangShort'))}</span>
    ${options
			.map((option) => {
				const isActive = current === option.value;
				return `<a class="${isActive ? 'active' : ''}" href="${escapeHtml(contentLangHref(option.value, path))}" data-content-lang-set="${option.value}"${isActive ? ' aria-current="true"' : ''}>${escapeHtml(t(locale, option.key))}</a>`;
			})
			.join('')}
  </span>`;
}

