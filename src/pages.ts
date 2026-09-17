import type { FolderSummary } from './folders';
import { formatUiDate, htmlLang, LANG_BOOTSTRAP, langSetHref, t, tagLabel, type Locale } from './i18n';
import type { ArticleView, TagCount } from './store';
import type { SessionUser, UserRow } from './users';
import { escapeHtml, safeHttpUrl } from './util';

export type Chrome = {
	locale: Locale;
	path: string;
};

const CHROME_STYLE = `
:root { color-scheme: light dark; --bg:#f6f4ef; --fg:#1c1916; --muted:#5c564e; --card:#fff; --border:#e4dfd6; --accent:#0f6e56; --accent-fg:#fff; }
@media (prefers-color-scheme: dark) {
  :root { --bg:#161411; --fg:#f3efe8; --muted:#b4ada3; --card:#221e1a; --border:#3a342d; --accent:#7dcca8; --accent-fg:#12211b; }
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; background: var(--bg); color: var(--fg); line-height: 1.5; min-height: 100vh; }
a { color: var(--accent); }
main { width: min(960px, calc(100% - 32px)); margin: 0 auto; padding: 24px 0 64px; }
header.site { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 22px; flex-wrap: wrap; }
header.site h1 { font-size: 1.25rem; margin: 0; letter-spacing: -0.02em; }
header.site p { margin: 4px 0 0; color: var(--muted); font-size: 0.9rem; }
nav.site { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
nav.site .who { color: var(--muted); font-size: 0.9rem; }
button, .btn { appearance: none; border: 0; border-radius: 8px; padding: 8px 12px; background: var(--accent); color: var(--accent-fg); font: inherit; cursor: pointer; text-decoration: none; display: inline-flex; }
button.ghost, .btn.ghost { background: transparent; color: var(--fg); border: 1px solid var(--border); }
button.danger { background: transparent; color: inherit; border: 1px solid color-mix(in srgb, #c0392b 45%, var(--border)); }
.search { display: flex; gap: 8px; margin-bottom: 14px; }
.search input { flex: 1; min-width: 0; border: 1px solid var(--border); background: var(--card); color: var(--fg); border-radius: 8px; padding: 10px 12px; font: inherit; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 18px; padding: 0; list-style: none; }
.chip { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--border); border-radius: 999px; padding: 4px 10px; text-decoration: none; color: inherit; font-size: 0.82rem; background: var(--card); }
.chip:hover { border-color: var(--accent); }
.chip.active { background: var(--accent); color: var(--accent-fg); border-color: transparent; }
.chip .count { opacity: 0.7; font-variant-numeric: tabular-nums; }
.list { list-style: none; padding: 0; margin: 0; display: grid; gap: 12px; }
.card { display: grid; grid-template-columns: 132px 1fr; gap: 14px; background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 12px; }
.card-tools { display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-start; margin-top: 10px; }
.star { min-width: 2.4rem; justify-content: center; }
.star.on { border-color: color-mix(in srgb, #d4a017 55%, var(--border)); color: #b8860b; }
.folder-picker { font-size: 0.85rem; }
.folder-picker summary { cursor: pointer; color: var(--muted); }
.folder-picker form { display: grid; gap: 6px; margin-top: 8px; padding: 8px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg); min-width: 200px; }
.folder-picker label { display: flex; gap: 8px; align-items: center; margin: 0; font-size: 0.85rem; }
.folder-picker input[type=checkbox] { width: auto; margin: 0; }
.folder-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 12px; }
.folder-card { display: grid; gap: 10px; background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 14px; }
.folder-card h2 { margin: 0; font-size: 1.05rem; }
.folder-card h2 a { color: inherit; text-decoration: none; }
.folder-card h2 a:hover { color: var(--accent); }
.folder-meta { color: var(--muted); font-size: 0.85rem; margin: 0; }
.rename-row { display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: end; }
.rename-row input { margin: 0; }
.add-folder { display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: end; margin: 0 0 18px; }
.add-folder input { margin: 0; }
.thumb, .thumb-fallback { width: 132px; height: 88px; border-radius: 8px; object-fit: cover; background: color-mix(in srgb, var(--border) 70%, var(--card)); }
.thumb-fallback { display: block; }
.card h2 { margin: 0 0 6px; font-size: 1.05rem; }
.card h2 a { color: inherit; text-decoration: none; }
.card h2 a:hover { color: var(--accent); }
.summary { margin: 0 0 8px; color: var(--muted); font-size: 0.92rem; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.pills { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 8px; }
.pill { display: inline-flex; border: 1px solid var(--border); border-radius: 999px; padding: 1px 8px; font-size: 0.75rem; color: inherit; text-decoration: none; }
.meta { display: flex; flex-wrap: wrap; gap: 8px 12px; color: var(--muted); font-size: 0.85rem; align-items: center; }
.badge { display: inline-flex; border: 1px solid var(--border); border-radius: 999px; padding: 1px 8px; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; }
.empty { border: 1px dashed var(--border); border-radius: 12px; padding: 28px 16px; color: var(--muted); text-align: center; }
.panel { width: min(480px, calc(100% - 32px)); margin: 10vh auto; background: var(--card); border: 1px solid var(--border); border-radius: 16px; padding: 28px; }
.panel.wide { width: min(960px, calc(100% - 32px)); margin: 0 auto; }
.panel h1 { margin: 0 0 8px; font-size: 1.35rem; }
.panel p { margin: 0 0 16px; color: var(--muted); }
label { display: block; font-size: 0.85rem; margin-bottom: 6px; }
input[type=password], input[type=text], select { width: 100%; border: 1px solid var(--border); background: var(--bg); color: var(--fg); border-radius: 8px; padding: 10px 12px; font: inherit; margin-bottom: 14px; }
.error { background: color-mix(in srgb, #c0392b 12%, var(--card)); color: inherit; border: 1px solid color-mix(in srgb, #c0392b 35%, var(--border)); padding: 8px 10px; border-radius: 8px; margin-bottom: 14px; font-size: 0.9rem; }
.notice { background: color-mix(in srgb, var(--accent) 12%, var(--card)); border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border)); padding: 12px; border-radius: 10px; margin-bottom: 16px; }
.notice code, .token { display: block; margin-top: 8px; word-break: break-all; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.85rem; }
.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; background: var(--card); border: 1px solid var(--border); border-radius: 12px; }
th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--border); font-size: 0.92rem; vertical-align: middle; }
th { color: var(--muted); font-weight: 600; }
.actions { display: flex; gap: 6px; flex-wrap: wrap; }
.add-user { display: grid; grid-template-columns: 1fr 1fr 140px auto; gap: 8px; align-items: end; margin: 18px 0; }
.add-user input, .add-user select { margin: 0; }
.not-found { text-align: center; padding: 48px 0; color: var(--muted); }
.lang-switch { display: inline-flex; border: 1px solid var(--border); border-radius: 999px; overflow: hidden; font-size: 0.8rem; line-height: 1.2; }
.lang-switch a { padding: 6px 10px; text-decoration: none; color: inherit; }
.lang-switch a.active { background: var(--accent); color: var(--accent-fg); }
.lang-switch a:hover:not(.active) { background: color-mix(in srgb, var(--accent) 14%, var(--card)); }
.panel-top { display: flex; justify-content: flex-end; margin-bottom: 12px; }
@media (max-width: 720px) {
  .card { grid-template-columns: 1fr; }
  .thumb, .thumb-fallback { width: 100%; height: 160px; }
  .add-user, .add-folder, .rename-row { grid-template-columns: 1fr; }
}
`;

function layout(title: string, body: string, locale: Locale): string {
	return `<!doctype html>
<html lang="${htmlLang(locale)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>${escapeHtml(title)}</title>
  <style>${CHROME_STYLE}</style>
  ${LANG_BOOTSTRAP}
</head>
<body>
${body}
</body>
</html>`;
}

function htmlPage(title: string, body: string, locale: Locale, status = 200, headers?: HeadersInit): Response {
	const extra = new Headers(headers);
	extra.set('content-type', 'text/html; charset=utf-8');
	extra.set('cache-control', 'private, no-store');
	extra.set('x-robots-tag', 'noindex, nofollow');
	extra.set('x-content-type-options', 'nosniff');
	extra.set('referrer-policy', 'same-origin');
	return new Response(layout(title, body, locale), { status, headers: extra });
}

export function langSwitch(chrome: Chrome): string {
	const zh = langSetHref('zh', chrome.path);
	const en = langSetHref('en', chrome.path);
	return `<span class="lang-switch" role="group" aria-label="${escapeHtml(t(chrome.locale, 'langToggle'))}">
    <a class="${chrome.locale === 'zh' ? 'active' : ''}" href="${escapeHtml(zh)}"${chrome.locale === 'zh' ? ' aria-current="true"' : ''}>${escapeHtml(t(chrome.locale, 'langZh'))}</a>
    <a class="${chrome.locale === 'en' ? 'active' : ''}" href="${escapeHtml(en)}"${chrome.locale === 'en' ? ' aria-current="true"' : ''}>${escapeHtml(t(chrome.locale, 'langEn'))}</a>
  </span>`;
}

function siteNav(viewer: SessionUser, chrome: Chrome, extra = ''): string {
	const locale = chrome.locale;
	return `<nav class="site">
    ${langSwitch(chrome)}
    ${viewer.role === 'admin' ? `<a class="btn ghost" href="/admin/users">${escapeHtml(t(locale, 'users'))}</a>` : ''}
    <a class="btn ghost" href="/folders">${escapeHtml(t(locale, 'folders'))}</a>
    <a class="btn ghost" href="/settings">${escapeHtml(t(locale, 'settings'))}</a>
    ${extra}
    <span class="who">${escapeHtml(viewer.username)}${viewer.role === 'admin' ? ` · ${escapeHtml(t(locale, 'adminBadge'))}` : ''}</span>
    <form method="post" action="/logout"><button class="ghost" type="submit">${escapeHtml(t(locale, 'signOut'))}</button></form>
  </nav>`;
}

export function loginPage(chrome: Chrome, nextPath: string, error?: string, setupAvailable = false): Response {
	const locale = chrome.locale;
	const body = `
  <main>
    <form class="panel" method="post" action="/login">
      <div class="panel-top">${langSwitch(chrome)}</div>
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
	return htmlPage(t(locale, 'signInTitle'), body, locale);
}

export function setupPage(chrome: Chrome, error?: string): Response {
	const locale = chrome.locale;
	const body = `
  <main>
    <form class="panel" method="post" action="/setup">
      <div class="panel-top">${langSwitch(chrome)}</div>
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
	return htmlPage(t(locale, 'setupTitle'), body, locale);
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
      <div class="panel-top">${langSwitch(chrome)}</div>
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
	return htmlPage(t(locale, 'setupCompleteTitle'), body, locale, 200, headers);
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
    <header class="site">
      <div>
        <h1>${escapeHtml(t(locale, 'siteTitle'))}</h1>
        <p>${escapeHtml(countLabel)}${filterNote ? ` ${filterNote}` : ''}</p>
      </div>
      ${siteNav(viewer, chrome, extras)}
    </header>
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
	return htmlPage(t(locale, 'siteTitle'), body, locale);
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
    <header class="site">
      <div>
        <h1>${escapeHtml(t(locale, 'foldersHeading'))}</h1>
        <p>${escapeHtml(t(locale, 'foldersLead'))} ${escapeHtml(countLabel)}</p>
      </div>
      ${siteNav(viewer, chrome)}
    </header>
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
	return htmlPage(t(locale, 'foldersTitle'), body, locale);
}

export function settingsPage(chrome: Chrome, viewer: SessionUser, prefix: string | null, issuedToken?: string, error?: string): Response {
	const locale = chrome.locale;
	const body = `
  <main>
    <header class="site">
      <div>
        <h1>${escapeHtml(t(locale, 'settingsHeading'))}</h1>
        <p>${escapeHtml(t(locale, 'settingsLead'))}</p>
      </div>
      ${siteNav(viewer, chrome)}
    </header>
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
	return htmlPage(t(locale, 'settingsTitle'), body, locale);
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
    <header class="site">
      <div>
        <h1>${escapeHtml(t(locale, 'usersHeading'))}</h1>
        <p>${escapeHtml(t(locale, 'usersLead'))}</p>
      </div>
      ${siteNav(viewer, chrome)}
    </header>
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
	return htmlPage(t(locale, 'usersTitle'), body, locale);
}

export function notFoundPage(chrome: Chrome): Response {
	const locale = chrome.locale;
	return htmlPage(
		t(locale, 'notFoundTitle'),
		`<main>
      <div class="panel-top" style="width:min(960px,calc(100% - 32px));margin:24px auto 0">${langSwitch(chrome)}</div>
      <p class="not-found">${escapeHtml(t(locale, 'notFound'))} <a href="/">${escapeHtml(t(locale, 'backToList'))}</a></p>
    </main>`,
		locale,
		404,
	);
}

function archiveBar(article: ArticleView, folders: FolderSummary[], locale: Locale): string {
	const source = safeHttpUrl(article.source_url);
	const articlePath = `/a/${encodeURIComponent(article.slug)}`;
	const downloadHref = `${articlePath}/download`;
	const zh = langSetHref('zh', articlePath);
	const en = langSetHref('en', articlePath);
	const sourceLink = source
		? `<a href="${escapeHtml(source)}" rel="noreferrer noopener" style="color:#9fe0c4;text-decoration:none">${escapeHtml(t(locale, 'source'))}</a>`
		: '';
	const lang = `<span role="group" aria-label="${escapeHtml(t(locale, 'langToggle'))}" style="display:inline-flex;border:1px solid rgba(255,255,255,.22);border-radius:999px;overflow:hidden;font-size:12px">
    <a href="${escapeHtml(zh)}" style="padding:4px 8px;text-decoration:none;color:${locale === 'zh' ? '#12211b' : '#f4f1ea'};background:${locale === 'zh' ? '#9fe0c4' : 'transparent'}">${escapeHtml(t(locale, 'langZh'))}</a>
    <a href="${escapeHtml(en)}" style="padding:4px 8px;text-decoration:none;color:${locale === 'en' ? '#12211b' : '#f4f1ea'};background:${locale === 'en' ? '#9fe0c4' : 'transparent'}">${escapeHtml(t(locale, 'langEn'))}</a>
  </span>`;
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
  ${sourceLink}
  ${download}
</nav>`;
}

export function injectArchiveChrome(htmlResponse: Response, article: ArticleView, folders: FolderSummary[], locale: Locale): Response {
	return new HTMLRewriter()
		.on('body', {
			element(element) {
				element.prepend(archiveBar(article, folders, locale), { html: true });
			},
		})
		.transform(htmlResponse);
}
