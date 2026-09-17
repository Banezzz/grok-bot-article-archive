import type { FolderSummary } from './folders';
import {
	formatUiDate,
	htmlLang,
	LANG_BOOTSTRAP,
	langSetHref,
	t,
	tagLabel,
	THEME_BOOTSTRAP,
	themeSetHref,
	type Locale,
	type MessageKey,
	type Theme,
} from './i18n';
import type { ArticleView, TagCount } from './store';
import type { SessionUser, UserRow } from './users';
import { escapeHtml, safeHttpUrl } from './util';

export type Chrome = {
	locale: Locale;
	path: string;
	theme: Theme | null;
};

const LIGHT_VARS = `--bg:#f3f0e8; --fg:#1a1814; --muted:#6b645a; --card:#fffdf8; --border:#e4ddd0; --accent:#0c6a52; --accent-fg:#fff; --shadow:0 1px 2px rgba(26,24,20,.05), 0 10px 28px rgba(26,24,20,.05); --ring:color-mix(in srgb, var(--accent) 28%, transparent); --danger:#9b2c20;`;
const DARK_VARS = `--bg:#12100e; --fg:#f4efe6; --muted:#b3aaa0; --card:#1d1a16; --border:#3b342c; --accent:#86d4b0; --accent-fg:#10211a; --shadow:0 1px 2px rgba(0,0,0,.28), 0 14px 32px rgba(0,0,0,.22); --ring:color-mix(in srgb, var(--accent) 32%, transparent); --danger:#e07a70;`;

const CHROME_STYLE = `
html { color-scheme: light; ${LIGHT_VARS} }
@media (prefers-color-scheme: dark) {
  html:not([data-theme="light"]) { color-scheme: dark; ${DARK_VARS} }
}
html[data-theme="dark"] { color-scheme: dark; ${DARK_VARS} }
html[data-theme="light"] { color-scheme: light; ${LIGHT_VARS} }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", "PingFang SC", "Noto Sans SC", sans-serif;
  background: var(--bg); color: var(--fg); line-height: 1.55; min-height: 100vh;
  letter-spacing: -0.011em; -webkit-font-smoothing: antialiased;
}
a { color: var(--accent); }
a:hover { color: color-mix(in srgb, var(--accent) 80%, var(--fg)); }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
main { width: min(920px, calc(100% - 40px)); margin: 0 auto; padding: 28px 0 80px; }
header.site { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px 28px; margin-bottom: 26px; padding-bottom: 20px; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
header.site h1 { font-size: 1.4rem; margin: 0; letter-spacing: -0.03em; font-weight: 650; line-height: 1.25; }
header.site h1.brand::before { content: ""; display: inline-block; width: .52rem; height: .52rem; border-radius: 3px; background: var(--accent); margin-right: .5rem; vertical-align: .12em; }
header.site p { margin: 6px 0 0; color: var(--muted); font-size: 0.92rem; }
nav.site { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
nav.site .who { color: var(--muted); font-size: 0.86rem; padding: 0 4px; }
.chrome-toggles { display: inline-flex; gap: 8px; align-items: center; flex-wrap: wrap; }
button, .btn { appearance: none; border: 0; border-radius: 9px; padding: 8px 13px; background: var(--accent); color: var(--accent-fg); font: inherit; font-weight: 550; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; line-height: 1.25; transition: background .12s ease, border-color .12s ease, box-shadow .12s ease; }
button:hover, .btn:hover { box-shadow: 0 0 0 3px var(--ring); }
button.ghost, .btn.ghost { background: var(--card); color: var(--fg); border: 1px solid var(--border); font-weight: 500; box-shadow: none; }
button.ghost:hover, .btn.ghost:hover { background: color-mix(in srgb, var(--accent) 10%, var(--card)); border-color: color-mix(in srgb, var(--accent) 35%, var(--border)); box-shadow: none; }
button.danger { background: transparent; color: var(--danger); border: 1px solid color-mix(in srgb, var(--danger) 40%, var(--border)); }
button.danger:hover { background: color-mix(in srgb, var(--danger) 10%, var(--card)); }
button:disabled { opacity: .45; cursor: not-allowed; box-shadow: none; }
.search { display: flex; gap: 8px; margin-bottom: 16px; }
.search input { flex: 1; min-width: 0; border: 1px solid var(--border); background: var(--card); color: var(--fg); border-radius: 10px; padding: 11px 13px; font: inherit; box-shadow: var(--shadow); }
.search input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--ring); outline: none; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 16px; padding: 0; list-style: none; }
.chip { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--border); border-radius: 999px; padding: 5px 11px; text-decoration: none; color: inherit; font-size: 0.82rem; background: var(--card); transition: border-color .12s ease, background .12s ease; }
.chip:hover { border-color: var(--accent); color: inherit; }
.chip.active { background: var(--accent); color: var(--accent-fg); border-color: transparent; }
.chip .count { opacity: 0.68; font-variant-numeric: tabular-nums; font-size: 0.75rem; }
.list { list-style: none; padding: 0; margin: 0; display: grid; gap: 14px; }
.card { display: grid; grid-template-columns: 132px 1fr; gap: 16px; background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 14px; box-shadow: var(--shadow); transition: border-color .15s ease; }
.card:hover { border-color: color-mix(in srgb, var(--accent) 32%, var(--border)); }
.card-tools { display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-start; margin-top: 12px; }
.star { min-width: 2.4rem; justify-content: center; }
.star.on { border-color: color-mix(in srgb, #d4a017 55%, var(--border)); color: #b8860b; background: color-mix(in srgb, #d4a017 10%, var(--card)); }
.folder-picker { font-size: 0.85rem; }
.folder-picker summary { cursor: pointer; color: var(--muted); }
.folder-picker form { display: grid; gap: 6px; margin-top: 8px; padding: 10px; border: 1px solid var(--border); border-radius: 10px; background: var(--bg); min-width: 200px; }
.folder-picker label { display: flex; gap: 8px; align-items: center; margin: 0; font-size: 0.85rem; }
.folder-picker input[type=checkbox] { width: auto; margin: 0; }
.folder-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 14px; }
.folder-card { display: grid; gap: 12px; background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 16px; box-shadow: var(--shadow); }
.folder-card h2 { margin: 0; font-size: 1.08rem; letter-spacing: -0.02em; }
.folder-card h2 a { color: inherit; text-decoration: none; }
.folder-card h2 a:hover { color: var(--accent); }
.folder-meta { color: var(--muted); font-size: 0.85rem; margin: 4px 0 0; }
.rename-row { display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: end; }
.rename-row input { margin: 0; }
.add-folder { display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: end; margin: 0 0 20px; padding: 16px; background: var(--card); border: 1px solid var(--border); border-radius: 14px; box-shadow: var(--shadow); }
.add-folder input { margin: 0; }
.thumb, .thumb-fallback { width: 132px; height: 88px; border-radius: 10px; object-fit: cover; background: color-mix(in srgb, var(--border) 70%, var(--card)); }
.thumb-fallback { display: block; }
.card h2 { margin: 0 0 6px; font-size: 1.08rem; letter-spacing: -0.02em; }
.card h2 a { color: inherit; text-decoration: none; }
.card h2 a:hover { color: var(--accent); }
.summary { margin: 0 0 10px; color: var(--muted); font-size: 0.92rem; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.pills { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 8px; }
.pill { display: inline-flex; border: 1px solid var(--border); border-radius: 999px; padding: 2px 9px; font-size: 0.74rem; color: inherit; text-decoration: none; background: color-mix(in srgb, var(--bg) 55%, var(--card)); }
.pill:hover { border-color: var(--accent); color: inherit; }
.meta { display: flex; flex-wrap: wrap; gap: 8px 12px; color: var(--muted); font-size: 0.84rem; align-items: center; }
.badge { display: inline-flex; border: 1px solid var(--border); border-radius: 999px; padding: 1px 8px; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; }
.empty { border: 1px dashed color-mix(in srgb, var(--border) 80%, var(--muted)); border-radius: 16px; padding: 48px 20px; color: var(--muted); text-align: center; background: color-mix(in srgb, var(--card) 72%, transparent); font-size: 0.98rem; }
.panel { width: min(440px, calc(100% - 32px)); margin: 12vh auto; background: var(--card); border: 1px solid var(--border); border-radius: 18px; padding: 32px; box-shadow: var(--shadow); }
.panel.wide { width: min(920px, 100%); margin: 0 auto; }
.panel h1 { margin: 0 0 8px; font-size: 1.4rem; letter-spacing: -0.03em; }
.panel p { margin: 0 0 16px; color: var(--muted); }
label { display: block; font-size: 0.82rem; margin-bottom: 6px; color: var(--muted); font-weight: 550; }
input[type=password], input[type=text], input[type=search], select { width: 100%; border: 1px solid var(--border); background: var(--bg); color: var(--fg); border-radius: 10px; padding: 10px 12px; font: inherit; margin-bottom: 14px; }
input[type=password]:focus, input[type=text]:focus, select:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--ring); outline: none; }
.error { background: color-mix(in srgb, var(--danger) 12%, var(--card)); color: inherit; border: 1px solid color-mix(in srgb, var(--danger) 35%, var(--border)); padding: 10px 12px; border-radius: 10px; margin-bottom: 14px; font-size: 0.9rem; }
.notice { background: color-mix(in srgb, var(--accent) 12%, var(--card)); border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border)); padding: 14px; border-radius: 12px; margin-bottom: 16px; }
.notice code, .token { display: block; margin-top: 8px; word-break: break-all; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.85rem; }
.table-wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: 14px; background: var(--card); box-shadow: var(--shadow); }
table { width: 100%; border-collapse: collapse; background: transparent; }
th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--border); font-size: 0.92rem; vertical-align: middle; }
th { color: var(--muted); font-weight: 600; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.04em; }
tr:last-child td { border-bottom: 0; }
.actions { display: flex; gap: 6px; flex-wrap: wrap; }
.add-user { display: grid; grid-template-columns: 1fr 1fr 140px auto; gap: 10px; align-items: end; margin: 0 0 20px; padding: 16px; background: var(--card); border: 1px solid var(--border); border-radius: 14px; box-shadow: var(--shadow); }
.add-user input, .add-user select { margin: 0; }
.not-found { text-align: center; padding: 64px 0; color: var(--muted); }
.seg-switch { display: inline-flex; border: 1px solid var(--border); border-radius: 999px; overflow: hidden; font-size: 0.78rem; line-height: 1.2; background: var(--card); }
.seg-switch a { padding: 6px 11px; text-decoration: none; color: inherit; }
.seg-switch a.active { background: var(--accent); color: var(--accent-fg); }
.seg-switch a:hover:not(.active) { background: color-mix(in srgb, var(--accent) 12%, var(--card)); color: inherit; }
.panel-top { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
.crumb { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin: 0 0 10px; font-size: 0.86rem; }
.crumb .back { font-weight: 600; text-decoration: none; }
.crumb .back:hover { text-decoration: underline; }
.crumb-sep { color: var(--muted); }
.crumb [aria-current="page"] { color: var(--muted); }
@media (max-width: 720px) {
  main { width: min(920px, calc(100% - 28px)); padding-top: 20px; }
  header.site { gap: 16px; }
  .card { grid-template-columns: 1fr; }
  .thumb, .thumb-fallback { width: 100%; height: 168px; }
  .add-user, .add-folder, .rename-row { grid-template-columns: 1fr; }
}
`;

function layout(title: string, body: string, chrome: Chrome): string {
	const themeAttr = chrome.theme ? ` data-theme="${chrome.theme}"` : '';
	return `<!doctype html>
<html lang="${htmlLang(chrome.locale)}"${themeAttr}>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>${escapeHtml(title)}</title>
  <style>${CHROME_STYLE}</style>
  ${LANG_BOOTSTRAP}
  ${THEME_BOOTSTRAP}
</head>
<body>
${body}
</body>
</html>`;
}

function htmlPage(title: string, body: string, chrome: Chrome, status = 200, headers?: HeadersInit): Response {
	const extra = new Headers(headers);
	extra.set('content-type', 'text/html; charset=utf-8');
	extra.set('cache-control', 'private, no-store');
	extra.set('x-robots-tag', 'noindex, nofollow');
	extra.set('x-content-type-options', 'nosniff');
	extra.set('referrer-policy', 'same-origin');
	return new Response(layout(title, body, chrome), { status, headers: extra });
}

function segSwitch(
	chrome: Chrome,
	ariaKey: MessageKey,
	options: Array<{ value: string; href: string; label: string; active: boolean; dataAttr?: string }>,
	className: string,
): string {
	return `<span class="seg-switch ${className}" role="group" aria-label="${escapeHtml(t(chrome.locale, ariaKey))}">
    ${options
			.map((option) => {
				const data = option.dataAttr ? ` ${option.dataAttr}` : '';
				return `<a class="${option.active ? 'active' : ''}" href="${escapeHtml(option.href)}"${option.active ? ' aria-current="true"' : ''}${data}>${escapeHtml(option.label)}</a>`;
			})
			.join('')}
  </span>`;
}

export function langSwitch(chrome: Chrome): string {
	return segSwitch(
		chrome,
		'langToggle',
		[
			{ value: 'zh', href: langSetHref('zh', chrome.path), label: t(chrome.locale, 'langZh'), active: chrome.locale === 'zh' },
			{ value: 'en', href: langSetHref('en', chrome.path), label: t(chrome.locale, 'langEn'), active: chrome.locale === 'en' },
		],
		'lang-switch',
	);
}

export function themeSwitch(chrome: Chrome): string {
	return segSwitch(
		chrome,
		'themeToggle',
		[
			{
				value: 'light',
				href: themeSetHref('light', chrome.path),
				label: t(chrome.locale, 'themeLight'),
				active: chrome.theme === 'light',
				dataAttr: 'data-theme-set="light"',
			},
			{
				value: 'dark',
				href: themeSetHref('dark', chrome.path),
				label: t(chrome.locale, 'themeDark'),
				active: chrome.theme === 'dark',
				dataAttr: 'data-theme-set="dark"',
			},
		],
		'theme-switch',
	);
}

function chromeToggles(chrome: Chrome): string {
	return `<div class="chrome-toggles">${langSwitch(chrome)}${themeSwitch(chrome)}</div>`;
}

function crumbNav(chrome: Chrome, currentKey: MessageKey): string {
	return `<nav class="crumb" aria-label="${escapeHtml(t(chrome.locale, 'crumbAria'))}">
    <a class="back" href="/">${escapeHtml(t(chrome.locale, 'backArchive'))}</a>
    <span class="crumb-sep" aria-hidden="true">/</span>
    <span aria-current="page">${escapeHtml(t(chrome.locale, currentKey))}</span>
  </nav>`;
}

function siteNav(viewer: SessionUser, chrome: Chrome, extra = ''): string {
	const locale = chrome.locale;
	return `<nav class="site">
    ${chromeToggles(chrome)}
    ${viewer.role === 'admin' ? `<a class="btn ghost" href="/admin/users">${escapeHtml(t(locale, 'users'))}</a>` : ''}
    <a class="btn ghost" href="/folders">${escapeHtml(t(locale, 'folders'))}</a>
    <a class="btn ghost" href="/settings">${escapeHtml(t(locale, 'settings'))}</a>
    ${extra}
    <span class="who">${escapeHtml(viewer.username)}${viewer.role === 'admin' ? ` · ${escapeHtml(t(locale, 'adminBadge'))}` : ''}</span>
    <form method="post" action="/logout"><button class="ghost" type="submit">${escapeHtml(t(locale, 'signOut'))}</button></form>
  </nav>`;
}

function siteHeader(
	viewer: SessionUser,
	chrome: Chrome,
	title: string,
	leadHtml: string,
	extraNav = '',
	crumbKey?: MessageKey,
): string {
	return `<header class="site">
    <div>
      ${crumbKey ? crumbNav(chrome, crumbKey) : ''}
      <h1${crumbKey ? '' : ' class="brand"'}>${escapeHtml(title)}</h1>
      <p>${leadHtml}</p>
    </div>
    ${siteNav(viewer, chrome, extraNav)}
  </header>`;
}

export function loginPage(chrome: Chrome, nextPath: string, error?: string, setupAvailable = false): Response {
	const locale = chrome.locale;
	const body = `
  <main>
    <form class="panel" method="post" action="/login">
      <div class="panel-top">${chromeToggles(chrome)}</div>
      <h1>${escapeHtml(t(locale, 'signInHeading'))}</h1>
      <p>${escapeHtml(t(locale, 'signInLead'))}</p>
      ${error ? `<div class="error" role="alert">${escapeHtml(error)}</div>` : ''}
      ${setupAvailable ? `<p><a href="/setup">${escapeHtml(t(locale, 'createFirstAdmin'))}</a></p>` : ''}
      <input type="hidden" name="next" value="${escapeHtml(nextPath)}">
      <label for="username">${escapeHtml(t(locale, 'username'))}</label>
      <input id="username" name="username" type="text" autocomplete="username" required autofocus>
      <label for="password">${escapeHtml(t(locale, 'password'))}</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required>
      <button type="submit">${escapeHtml(t(locale, 'signIn'))}</button>
    </form>
  </main>`;
	return htmlPage(t(locale, 'signInTitle'), body, chrome);
}

export function setupPage(chrome: Chrome, error?: string): Response {
	const locale = chrome.locale;
	const body = `
  <main>
    <form class="panel" method="post" action="/setup">
      <div class="panel-top">${chromeToggles(chrome)}</div>
      <h1>${escapeHtml(t(locale, 'setupHeading'))}</h1>
      <p>${escapeHtml(t(locale, 'setupLead'))}</p>
      ${error ? `<div class="error" role="alert">${escapeHtml(error)}</div>` : ''}
      <label for="username">${escapeHtml(t(locale, 'username'))}</label>
      <input id="username" name="username" type="text" autocomplete="username" required autofocus>
      <label for="password">${escapeHtml(t(locale, 'password'))}</label>
      <input id="password" name="password" type="password" autocomplete="new-password" required>
      <label for="confirm">${escapeHtml(t(locale, 'confirmPassword'))}</label>
      <input id="confirm" name="confirm" type="password" autocomplete="new-password" required>
      <button type="submit">${escapeHtml(t(locale, 'createAdmin'))}</button>
    </form>
  </main>`;
	return htmlPage(t(locale, 'setupTitle'), body, chrome);
}

export function setupCompletePage(
	chrome: Chrome,
	username: string,
	uploadToken: string,
	assigned: number,
	headers: HeadersInit,
): Response {
	const locale = chrome.locale;
	const body = `
  <main>
    <div class="panel">
      <div class="panel-top">${chromeToggles(chrome)}</div>
      <h1>${escapeHtml(t(locale, 'setupCompleteHeading'))}</h1>
      <p>${t(locale, 'setupCompleteLead', { user: escapeHtml(username), n: assigned })}</p>
      <div class="notice">
        ${escapeHtml(t(locale, 'copyTokenOnce'))}
        <code class="token">${escapeHtml(uploadToken)}</code>
      </div>
      <p>${escapeHtml(t(locale, 'setupTokenHint'))}</p>
      <a class="btn" href="/">${escapeHtml(t(locale, 'goToArchive'))}</a>
    </div>
  </main>`;
	return htmlPage(t(locale, 'setupCompleteTitle'), body, chrome, 200, headers);
}

export type ListFilters = {
	q?: string;
	tag?: string | null;
	mine?: boolean;
	folder?: string | null;
	starred?: boolean;
};

export function listHref(filters: ListFilters): string {
	const params = new URLSearchParams();
	if (filters.q) {
		params.set('q', filters.q);
	}
	if (filters.tag) {
		params.set('tag', filters.tag);
	}
	if (filters.mine) {
		params.set('mine', '1');
	}
	if (filters.folder) {
		params.set('folder', filters.folder);
	}
	if (filters.starred) {
		params.set('starred', '1');
	}
	const qs = params.toString();
	return qs ? `/?${qs}` : '/';
}

export type ListPageModel = {
	articles: ArticleView[];
	tags: TagCount[];
	folders: FolderSummary[];
	query: string;
	activeTag: string | null;
	activeFolderId: string | null;
	starred: boolean;
	viewer: SessionUser;
	mine: boolean;
};

function articleTools(article: ArticleView, folders: FolderSummary[], nextPath: string, locale: Locale): string {
	const memberIds = new Set(article.folders.map((folder) => folder.id));
	const starLabel = article.starred ? t(locale, 'unstar') : t(locale, 'star');
	const picker =
		folders.length === 0
			? `<a class="btn ghost" href="/folders">${escapeHtml(t(locale, 'createFirstFolder'))}</a>`
			: `<details class="folder-picker">
        <summary>${escapeHtml(t(locale, 'addToFolders'))}</summary>
        <form method="post" action="/folders/membership">
          <input type="hidden" name="slug" value="${escapeHtml(article.slug)}">
          <input type="hidden" name="next" value="${escapeHtml(nextPath)}">
          ${folders
						.map(
							(folder) =>
								`<label><input type="checkbox" name="folder_id" value="${escapeHtml(folder.id)}"${memberIds.has(folder.id) ? ' checked' : ''}>${escapeHtml(folder.name)}</label>`,
						)
						.join('')}
          <button type="submit">${escapeHtml(t(locale, 'saveFolders'))}</button>
        </form>
      </details>`;
	return `<div class="card-tools">
    <form method="post" action="/star">
      <input type="hidden" name="slug" value="${escapeHtml(article.slug)}">
      <input type="hidden" name="next" value="${escapeHtml(nextPath)}">
      <button class="ghost star${article.starred ? ' on' : ''}" type="submit" aria-label="${escapeHtml(t(locale, 'starAria'))}" aria-pressed="${article.starred ? 'true' : 'false'}">${article.starred ? '★' : '☆'} ${escapeHtml(starLabel)}</button>
    </form>
    ${picker}
  </div>`;
}

export function listPage(chrome: Chrome, model: ListPageModel): Response {
	const locale = chrome.locale;
	const { articles, tags, folders, query, activeTag, activeFolderId, starred, viewer, mine } = model;
	const filters: ListFilters = { q: query, tag: activeTag, mine, folder: activeFolderId, starred };
	const current = listHref(filters);
	const hrefFor = (patch: Partial<ListFilters>) => listHref({ ...filters, ...patch });

	const folderChips = `<ul class="chips" aria-label="${escapeHtml(t(locale, 'foldersAria'))}">
    <li><a class="chip${activeFolderId ? '' : ' active'}" href="${escapeHtml(hrefFor({ folder: null }))}">${escapeHtml(t(locale, 'allFolders'))}</a></li>
    ${folders
			.map((folder) => {
				const active = folder.id === activeFolderId;
				return `<li><a class="chip${active ? ' active' : ''}" href="${escapeHtml(hrefFor({ folder: active ? null : folder.id }))}">${escapeHtml(folder.name)}<span class="count">${folder.article_count}</span></a></li>`;
			})
			.join('')}
    <li><a class="chip${starred ? ' active' : ''}" href="${escapeHtml(hrefFor({ starred: !starred }))}">${escapeHtml(t(locale, 'starred'))}</a></li>
  </ul>`;

	const chips = `<ul class="chips" aria-label="${escapeHtml(t(locale, 'tagsAria'))}">
    <li><a class="chip${activeTag ? '' : ' active'}" href="${escapeHtml(hrefFor({ tag: null }))}">${escapeHtml(t(locale, 'allTags'))}</a></li>
    ${tags
			.map((tag) => {
				const active = tag.slug === activeTag;
				return `<li><a class="chip${active ? ' active' : ''}" href="${escapeHtml(hrefFor({ tag: active ? null : tag.slug }))}">${escapeHtml(tagLabel(locale, tag))}<span class="count">${tag.article_count}</span></a></li>`;
			})
			.join('')}
  </ul>`;

	const emptyReason =
		starred && activeFolderId
			? escapeHtml(t(locale, 'noStarredInFolder'))
			: starred
				? escapeHtml(t(locale, 'noStarredArticles'))
				: activeFolderId
					? escapeHtml(t(locale, 'noFolderArticles'))
					: activeTag
						? t(locale, 'noArticlesTagged', { tag: escapeHtml(activeTag) })
						: query
							? t(locale, 'noArticlesMatch', { q: escapeHtml(query) })
							: escapeHtml(t(locale, 'noArticles'));

	const cards =
		articles.length === 0
			? `<div class="empty">${emptyReason}</div>`
			: `<ul class="list">${articles
					.map((article) => {
						const source = safeHttpUrl(article.source_url);
						const when = formatUiDate(article.published_at ?? article.created_at, locale);
						const thumb = article.thumbnail_key
							? `<img class="thumb" src="/thumb/${encodeURIComponent(article.slug)}" alt="" width="132" height="88">`
							: `<span class="thumb-fallback" aria-hidden="true"></span>`;
						const summary = article.summary_zh ? `<p class="summary" lang="zh">${escapeHtml(article.summary_zh)}</p>` : '';
						const pills =
							article.tags.length > 0
								? `<div class="pills">${article.tags
										.map((tag) => `<a class="pill" href="${escapeHtml(hrefFor({ tag: tag.slug }))}">${escapeHtml(tagLabel(locale, tag))}</a>`)
										.join('')}</div>`
								: '';
						const owner = viewer.role === 'admin' && article.owner_username ? `<span>@${escapeHtml(article.owner_username)}</span>` : '';
						const folderPills =
							article.folders.length > 0
								? `<div class="pills">${article.folders
										.map((folder) => `<a class="pill" href="${escapeHtml(hrefFor({ folder: folder.id }))}">${escapeHtml(folder.name)}</a>`)
										.join('')}</div>`
								: '';
						return `<li class="card">
            ${thumb}
            <div>
              <h2><a href="/a/${encodeURIComponent(article.slug)}">${escapeHtml(article.title)}</a></h2>
              ${summary}
              ${pills}
              ${folderPills}
              <div class="meta">
                ${article.author ? `<span>${escapeHtml(article.author)}</span>` : ''}
                ${owner}
                ${when ? `<time datetime="${escapeHtml(article.published_at ?? article.created_at)}">${escapeHtml(when)}</time>` : ''}
                ${article.lang ? `<span class="badge">${escapeHtml(article.lang)}</span>` : ''}
                ${source ? `<a href="${escapeHtml(source)}" rel="noreferrer noopener">${escapeHtml(t(locale, 'source'))}</a>` : ''}
              </div>
              ${articleTools(article, folders, current, locale)}
            </div>
          </li>`;
					})
					.join('')}</ul>`;

	const countLabel = articles.length === 1 ? t(locale, 'articleOne') : t(locale, 'articleMany', { n: articles.length });
	const activeFolder = folders.find((folder) => folder.id === activeFolderId);
	const filterNote = [
		mine ? t(locale, 'yours') : '',
		starred ? t(locale, 'starredNote') : '',
		activeFolder ? t(locale, 'inFolderName', { folder: escapeHtml(activeFolder.name) }) : '',
		query ? t(locale, 'matching', { q: escapeHtml(query) }) : '',
		activeTag ? t(locale, 'inTag', { tag: escapeHtml(activeTag) }) : '',
	]
		.filter(Boolean)
		.join(' · ');
	const extras = [
		`<a class="btn ghost" href="${escapeHtml(hrefFor({ starred: !starred }))}">${escapeHtml(t(locale, starred ? 'allTags' : 'starred'))}</a>`,
		viewer.role === 'admin'
			? `<a class="btn ghost" href="${escapeHtml(hrefFor({ mine: !mine }))}">${escapeHtml(t(locale, mine ? 'everyone' : 'mine'))}</a>`
			: '',
	]
		.filter(Boolean)
		.join('');

	const body = `
  <main>
    ${siteHeader(viewer, chrome, t(locale, 'siteTitle'), `${escapeHtml(countLabel)}${filterNote ? ` ${filterNote}` : ''}`, extras)}
    <form class="search" method="get" action="/" role="search">
      ${activeTag ? `<input type="hidden" name="tag" value="${escapeHtml(activeTag)}">` : ''}
      ${activeFolderId ? `<input type="hidden" name="folder" value="${escapeHtml(activeFolderId)}">` : ''}
      ${starred ? '<input type="hidden" name="starred" value="1">' : ''}
      ${mine ? '<input type="hidden" name="mine" value="1">' : ''}
      <input type="search" name="q" value="${escapeHtml(query)}" placeholder="${escapeHtml(t(locale, 'searchPlaceholder'))}" aria-label="${escapeHtml(t(locale, 'searchAria'))}">
      <button type="submit">${escapeHtml(t(locale, 'search'))}</button>
    </form>
    ${folderChips}
    ${chips}
    ${cards}
  </main>`;
	return htmlPage(t(locale, 'siteTitle'), body, chrome);
}

export function foldersPage(chrome: Chrome, viewer: SessionUser, folders: FolderSummary[], error?: string): Response {
	const locale = chrome.locale;
	const countLabel = folders.length === 1 ? t(locale, 'folderOne') : t(locale, 'folderMany', { n: folders.length });
	const cards =
		folders.length === 0
			? `<div class="empty">${escapeHtml(t(locale, 'noFolders'))}</div>`
			: `<ul class="folder-list">${folders
					.map((folder, index) => {
						const articleLabel = folder.article_count === 1 ? t(locale, 'articleOne') : t(locale, 'articleMany', { n: folder.article_count });
						return `<li class="folder-card">
            <div>
              <h2><a href="${escapeHtml(listHref({ folder: folder.id }))}">${escapeHtml(folder.name)}</a></h2>
              <p class="folder-meta">${escapeHtml(articleLabel)}</p>
            </div>
            <form class="rename-row" method="post" action="/folders/${encodeURIComponent(folder.id)}/rename">
              <div>
                <label for="name-${escapeHtml(folder.id)}">${escapeHtml(t(locale, 'folderName'))}</label>
                <input id="name-${escapeHtml(folder.id)}" name="name" type="text" value="${escapeHtml(folder.name)}" maxlength="80" required>
              </div>
              <button class="ghost" type="submit">${escapeHtml(t(locale, 'rename'))}</button>
            </form>
            <div class="actions">
              <a class="btn ghost" href="${escapeHtml(listHref({ folder: folder.id }))}">${escapeHtml(t(locale, 'openFolder'))}</a>
              <form method="post" action="/folders/${encodeURIComponent(folder.id)}/move">
                <input type="hidden" name="direction" value="up">
                <button class="ghost" type="submit" ${index === 0 ? 'disabled' : ''}>${escapeHtml(t(locale, 'moveUp'))}</button>
              </form>
              <form method="post" action="/folders/${encodeURIComponent(folder.id)}/move">
                <input type="hidden" name="direction" value="down">
                <button class="ghost" type="submit" ${index === folders.length - 1 ? 'disabled' : ''}>${escapeHtml(t(locale, 'moveDown'))}</button>
              </form>
              <form method="post" action="/folders/${encodeURIComponent(folder.id)}/delete">
                <button class="danger" type="submit">${escapeHtml(t(locale, 'delete'))}</button>
              </form>
            </div>
          </li>`;
					})
					.join('')}</ul>`;

	const body = `
  <main>
    ${siteHeader(viewer, chrome, t(locale, 'foldersHeading'), `${escapeHtml(t(locale, 'foldersLead'))} ${escapeHtml(countLabel)}`, '', 'folders')}
    ${error ? `<div class="error" role="alert">${escapeHtml(error)}</div>` : ''}
    <form class="add-folder" method="post" action="/folders">
      <div>
        <label for="folder-name">${escapeHtml(t(locale, 'folderName'))}</label>
        <input id="folder-name" name="name" type="text" maxlength="80" required>
      </div>
      <button type="submit">${escapeHtml(t(locale, 'createFolder'))}</button>
    </form>
    ${cards}
  </main>`;
	return htmlPage(t(locale, 'foldersTitle'), body, chrome);
}

export function settingsPage(chrome: Chrome, viewer: SessionUser, prefix: string | null, issuedToken?: string, error?: string): Response {
	const locale = chrome.locale;
	const body = `
  <main>
    ${siteHeader(viewer, chrome, t(locale, 'settingsHeading'), escapeHtml(t(locale, 'settingsLead')), '', 'settings')}
    <section class="panel wide">
      ${error ? `<div class="error" role="alert">${escapeHtml(error)}</div>` : ''}
      ${
				issuedToken
					? `<div class="notice">${escapeHtml(t(locale, 'copyTokenAgain'))}<code class="token">${escapeHtml(issuedToken)}</code></div>`
					: ''
			}
      <p>${escapeHtml(t(locale, 'currentPrefix'))} <code>${escapeHtml(prefix ?? t(locale, 'none'))}</code></p>
      <form method="post" action="/settings/token">
        <button type="submit">${escapeHtml(t(locale, 'rotateToken'))}</button>
      </form>
    </section>
  </main>`;
	return htmlPage(t(locale, 'settingsTitle'), body, chrome);
}

export function adminUsersPage(
	chrome: Chrome,
	viewer: SessionUser,
	users: UserRow[],
	issued?: { username: string; token: string },
	error?: string,
): Response {
	const locale = chrome.locale;
	const rows = users
		.map((user) => {
			const isSelf = user.id === viewer.id;
			const demoteDisabled = user.role === 'admin' && users.filter((item) => item.role === 'admin').length <= 1;
			const roleLabel = user.role === 'admin' ? t(locale, 'roleAdmin') : t(locale, 'roleUser');
			return `<tr>
        <td>${escapeHtml(user.username)}${isSelf ? escapeHtml(t(locale, 'you')) : ''}</td>
        <td>${escapeHtml(roleLabel)}</td>
        <td><code>${escapeHtml(user.upload_token_prefix ?? '—')}</code></td>
        <td>${escapeHtml(formatUiDate(user.created_at, locale))}</td>
        <td class="actions">
          <form method="post" action="/admin/users/${encodeURIComponent(user.id)}/role">
            <input type="hidden" name="role" value="${user.role === 'admin' ? 'user' : 'admin'}">
            <button class="ghost" type="submit" ${demoteDisabled && user.role === 'admin' ? 'disabled' : ''}>${escapeHtml(t(locale, user.role === 'admin' ? 'demote' : 'promote'))}</button>
          </form>
          <form method="post" action="/admin/users/${encodeURIComponent(user.id)}/token">
            <button class="ghost" type="submit">${escapeHtml(t(locale, 'rotateTokenShort'))}</button>
          </form>
          <form method="post" action="/admin/users/${encodeURIComponent(user.id)}/delete">
            <button class="danger" type="submit" ${demoteDisabled && user.role === 'admin' ? 'disabled' : ''}>${escapeHtml(t(locale, 'delete'))}</button>
          </form>
        </td>
      </tr>`;
		})
		.join('');

	const body = `
  <main>
    ${siteHeader(viewer, chrome, t(locale, 'usersHeading'), escapeHtml(t(locale, 'usersLead')), '', 'users')}
    ${error ? `<div class="error" role="alert">${escapeHtml(error)}</div>` : ''}
    ${
			issued
				? `<div class="notice">${t(locale, 'tokenForUser', { user: escapeHtml(issued.username) })}<code class="token">${escapeHtml(issued.token)}</code></div>`
				: ''
		}
    <form class="add-user" method="post" action="/admin/users">
      <div>
        <label for="username">${escapeHtml(t(locale, 'username'))}</label>
        <input id="username" name="username" type="text" required>
      </div>
      <div>
        <label for="password">${escapeHtml(t(locale, 'password'))}</label>
        <input id="password" name="password" type="password" required>
      </div>
      <div>
        <label for="role">${escapeHtml(t(locale, 'role'))}</label>
        <select id="role" name="role">
          <option value="user">${escapeHtml(t(locale, 'roleUser'))}</option>
          <option value="admin">${escapeHtml(t(locale, 'roleAdmin'))}</option>
        </select>
      </div>
      <button type="submit">${escapeHtml(t(locale, 'addUser'))}</button>
    </form>
    <div class="table-wrap">
      <table>
        <thead><tr><th>${escapeHtml(t(locale, 'username'))}</th><th>${escapeHtml(t(locale, 'role'))}</th><th>${escapeHtml(t(locale, 'tokenPrefix'))}</th><th>${escapeHtml(t(locale, 'created'))}</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </main>`;
	return htmlPage(t(locale, 'usersTitle'), body, chrome);
}

export function notFoundPage(chrome: Chrome): Response {
	const locale = chrome.locale;
	return htmlPage(
		t(locale, 'notFoundTitle'),
		`<main>
      <div class="panel-top" style="width:min(920px,calc(100% - 40px));margin:24px auto 0">${chromeToggles(chrome)}</div>
      <p class="not-found">${escapeHtml(t(locale, 'notFound'))} <a href="/">${escapeHtml(t(locale, 'backToList'))}</a></p>
    </main>`,
		chrome,
		404,
	);
}

function overlaySeg(
	aria: string,
	options: Array<{ href: string; label: string; active: boolean }>,
): string {
	return `<span role="group" aria-label="${escapeHtml(aria)}" style="display:inline-flex;border:1px solid rgba(255,255,255,.22);border-radius:999px;overflow:hidden;font-size:12px">
    ${options
			.map(
				(option) =>
					`<a href="${escapeHtml(option.href)}" style="padding:4px 8px;text-decoration:none;color:${option.active ? '#12211b' : '#f4f1ea'};background:${option.active ? '#9fe0c4' : 'transparent'}">${escapeHtml(option.label)}</a>`,
			)
			.join('')}
  </span>`;
}

function archiveBar(article: ArticleView, folders: FolderSummary[], chrome: Chrome): string {
	const locale = chrome.locale;
	const source = safeHttpUrl(article.source_url);
	const articlePath = `/a/${encodeURIComponent(article.slug)}`;
	const downloadHref = `${articlePath}/download`;
	const sourceLink = source
		? `<a href="${escapeHtml(source)}" rel="noreferrer noopener" style="color:#9fe0c4;text-decoration:none">${escapeHtml(t(locale, 'source'))}</a>`
		: '';
	const lang = overlaySeg(t(locale, 'langToggle'), [
		{ href: langSetHref('zh', articlePath), label: t(locale, 'langZh'), active: locale === 'zh' },
		{ href: langSetHref('en', articlePath), label: t(locale, 'langEn'), active: locale === 'en' },
	]);
	const theme = overlaySeg(t(locale, 'themeToggle'), [
		{ href: themeSetHref('light', articlePath), label: t(locale, 'themeLight'), active: chrome.theme === 'light' },
		{ href: themeSetHref('dark', articlePath), label: t(locale, 'themeDark'), active: chrome.theme === 'dark' },
	]);
	const download = `<a href="${escapeHtml(downloadHref)}" style="color:#12211b;background:#9fe0c4;text-decoration:none;border-radius:8px;padding:6px 10px">${escapeHtml(t(locale, 'downloadHtml'))}</a>`;
	const starLabel = article.starred ? t(locale, 'unstar') : t(locale, 'star');
	const star = `<form method="post" action="/star" style="margin:0">
    <input type="hidden" name="slug" value="${escapeHtml(article.slug)}">
    <input type="hidden" name="next" value="${escapeHtml(articlePath)}">
    <button type="submit" style="appearance:none;border:1px solid rgba(255,255,255,.22);background:transparent;color:${article.starred ? '#f5d76e' : '#f4f1ea'};border-radius:8px;padding:6px 10px;font:inherit;cursor:pointer">${article.starred ? '★' : '☆'} ${escapeHtml(starLabel)}</button>
  </form>`;
	const memberIds = new Set(article.folders.map((folder) => folder.id));
	const folderForm =
		folders.length === 0
			? `<a href="/folders" style="color:#9fe0c4;text-decoration:none">${escapeHtml(t(locale, 'createFirstFolder'))}</a>`
			: `<form method="post" action="/folders/membership" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:0">
    <input type="hidden" name="slug" value="${escapeHtml(article.slug)}">
    <input type="hidden" name="next" value="${escapeHtml(articlePath)}">
    <label style="display:flex;gap:6px;align-items:center;margin:0">${escapeHtml(t(locale, 'addToFolders'))}
      <select name="folder_id" multiple size="${Math.min(folders.length, 4)}" style="max-width:16rem;background:#221e1a;color:#f4f1ea;border:1px solid rgba(255,255,255,.22);border-radius:6px">
        ${folders.map((folder) => `<option value="${escapeHtml(folder.id)}"${memberIds.has(folder.id) ? ' selected' : ''}>${escapeHtml(folder.name)}</option>`).join('')}
      </select>
    </label>
    <button type="submit" style="appearance:none;border:0;background:#9fe0c4;color:#12211b;border-radius:8px;padding:6px 10px;font:inherit;cursor:pointer">${escapeHtml(t(locale, 'saveFolders'))}</button>
  </form>`;
	return `<nav data-archive-chrome style="position:sticky;top:0;z-index:2147483647;display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;padding:8px 14px;font:13px/1.4 ui-sans-serif,system-ui,-apple-system,sans-serif;background:color-mix(in srgb,#111 82%,transparent);color:#f4f1ea;border-bottom:1px solid rgba(255,255,255,.12);backdrop-filter:blur(10px)">
  <a href="/" style="color:#9fe0c4;text-decoration:none">${escapeHtml(t(locale, 'backArchive'))}</a>
  <span style="flex:1;min-width:12ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(article.title)}</span>
  ${star}
  ${folderForm}
  ${lang}
  ${theme}
  ${sourceLink}
  ${download}
</nav>`;
}

export function injectArchiveChrome(htmlResponse: Response, article: ArticleView, folders: FolderSummary[], chrome: Chrome): Response {
	return new HTMLRewriter()
		.on('body', {
			element(element) {
				element.prepend(archiveBar(article, folders, chrome), { html: true });
			},
		})
		.transform(htmlResponse);
}
