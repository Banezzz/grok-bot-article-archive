import {
	CONTENT_LANG_BOOTSTRAP,
	CONTENT_LANG_HINT,
	CONTENT_LANG_SCRIPT,
	contentLangStyleTag,
	contentLangSwitch,
	insertSwitchIntoArticleHtml,
	prepareArticleLanguage,
	type ContentLang,
} from './content-lang';
import { appPagePolicy, articlePagePolicy, scriptHashSources } from './csp';
import { isAbsoluteHttpHref, LINK_CONFIRM_SCRIPT, LINK_CONFIRM_STYLE, linkConfirmInjection, linkConfirmMarkup, linkConfirmStyleTag } from './link-confirm';
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
import { FOLDER_PICKER_STYLE, folderPickerMarkup, folderPickerStyleTag } from './folder-picker';
import { icon, MENU_SCRIPT, MENU_STYLE, menuStyleTag } from './menu';
import { LIGHTBOX_SCRIPT, LIGHTBOX_STYLE, lightboxInjection, lightboxMarkup, lightboxStyleTag } from './lightbox';
import { SHARE_DIALOG_SCRIPT, SHARE_DIALOG_STYLE, shareDialogInjection, shareDialogMarkup, shareDialogStyleTag } from './share-dialog';
import { isArticleShared, type ArticleSort, type ArticleView, type TagCount } from './store';
import type { SessionUser, UserListRow } from './users';
import { escapeHtml, safeHttpUrl } from './util';

export type Chrome = {
	locale: Locale;
	path: string;
	theme: Theme | null;
	contentLang: ContentLang | null;
};

const LIGHT_VARS = `--bg:#f3f0e8; --fg:#1a1814; --muted:#6b645a; --card:#fffdf8; --border:#e4ddd0; --accent:#0c6a52; --accent-fg:#fff; --shadow:0 1px 2px rgba(26,24,20,.05), 0 10px 28px rgba(26,24,20,.05); --ring:color-mix(in srgb, var(--accent) 28%, transparent); --danger:#9b2c20;`;
const DARK_VARS = `--bg:#12100e; --fg:#f4efe6; --muted:#b3aaa0; --card:#1d1a16; --border:#3b342c; --accent:#86d4b0; --accent-fg:#10211a; --shadow:0 1px 2px rgba(0,0,0,.28), 0 14px 32px rgba(0,0,0,.22); --ring:color-mix(in srgb, var(--accent) 32%, transparent); --danger:#e07a70;`;
const THEME_TOKEN_ALIASES = `--link:var(--accent); --panel:var(--card);`;

/** Late-injected onto /a/:slug so stored articles follow the site theme toggle. Not written to R2. */
const ARTICLE_THEME_OVERRIDE = `
html { color-scheme: light; ${LIGHT_VARS} ${THEME_TOKEN_ALIASES} }
@media (prefers-color-scheme: dark) {
  html:not([data-theme="light"]) { color-scheme: dark; ${DARK_VARS} ${THEME_TOKEN_ALIASES} }
}
html[data-theme="dark"] { color-scheme: dark; ${DARK_VARS} ${THEME_TOKEN_ALIASES} }
html[data-theme="light"] { color-scheme: light; ${LIGHT_VARS} ${THEME_TOKEN_ALIASES} }
html body {
  background: var(--bg) !important;
  background-color: var(--bg) !important;
  color: var(--fg) !important;
}
html body > :not([data-archive-chrome]):not([data-archive-content-lang-switch]):not(#archive-lightbox):not(#archive-share-dialog):not(#archive-link-dialog):not(script):not(style) {
  background-color: transparent !important;
  color: var(--fg) !important;
}
html body :is(main, article, header, footer, section, .pair, .page, .wrapper, .container, .content, .post, .markdown-body):not([data-archive-chrome]):not([data-archive-chrome] *):not([data-archive-content-lang-switch]):not([data-archive-content-lang-switch] *):not(#archive-lightbox):not(#archive-lightbox *):not(#archive-share-dialog):not(#archive-share-dialog *):not(#archive-link-dialog):not(#archive-link-dialog *) {
  background-color: transparent !important;
  color: var(--fg) !important;
}
html body :is(p, h1, h2, h3, h4, h5, h6, li, dt, dd, td, th, .zh, .pair):not([data-archive-chrome] *):not([data-archive-content-lang-switch] *):not(#archive-lightbox *):not(#archive-share-dialog *):not(#archive-link-dialog *) {
  color: var(--fg) !important;
}
html body :is(.en, .muted, blockquote, figcaption, .gap, header.meta p):not([data-archive-chrome] *):not([data-archive-content-lang-switch] *):not(#archive-lightbox *):not(#archive-share-dialog *):not(#archive-link-dialog *) {
  color: var(--muted) !important;
}
html body :is(main, article, header, footer, section, .pair, p, li, figcaption) a:not([data-archive-chrome] *):not([data-archive-content-lang-switch] *):not(#archive-lightbox *):not(#archive-share-dialog *):not(#archive-link-dialog *) {
  color: var(--accent) !important;
}
html body :is(hr, header.meta, .pair, table, th, td, figure, blockquote, pre, .gap):not([data-archive-chrome] *):not([data-archive-content-lang-switch] *):not(#archive-lightbox *):not(#archive-share-dialog *):not(#archive-link-dialog *) {
  border-color: var(--border) !important;
}
html body :is(pre, code, .gap):not([data-archive-chrome] *):not(#archive-lightbox *):not(#archive-share-dialog *):not(#archive-link-dialog *) {
  background: var(--card) !important;
  background-color: var(--card) !important;
  color: var(--fg) !important;
}
html body blockquote:not([data-archive-chrome] *):not(#archive-lightbox *):not(#archive-share-dialog *):not(#archive-link-dialog *) {
  border-left-color: var(--border) !important;
}
/* Tweets: the bot's static card (see templates/), older text-only cards, and Twitter's own
   embed markup, which never upgrades here because widgets.js is blocked by the CSP. */
html body :is(blockquote.tweet-card, figure.tweet-card, blockquote.twitter-tweet) {
  max-width: 560px; margin: 1.5em 0 !important; padding: 14px 16px !important;
  border: 1px solid var(--border) !important; border-radius: 14px !important; background: var(--card) !important;
}
html body .tweet-card .tweet-head { display: flex; align-items: center; gap: 10px; margin: 0 0 8px; }
html body .tweet-card .tweet-avatar { flex: 0 0 auto; width: 40px !important; height: 40px !important; margin: 0 !important; border-radius: 50% !important; object-fit: cover; }
html body .tweet-card .tweet-author { display: flex; flex-direction: column; min-width: 0; line-height: 1.3; }
html body .tweet-card .tweet-author strong { color: var(--fg) !important; font-weight: 650; }
html body .tweet-card .tweet-handle { color: var(--muted) !important; font-size: 0.88em; }
html body :is(.tweet-card, .twitter-tweet) p { margin: 0.35em 0 !important; }
html body .tweet-card .tweet-media { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 4px; margin: 10px 0 4px; border-radius: 12px; overflow: hidden; }
html body .tweet-card .tweet-media img { display: block; width: 100%; height: 100%; max-height: 420px; margin: 0 !important; border-radius: 0 !important; object-fit: cover; }
html body .tweet-card .tweet-foot { margin: 8px 0 0 !important; font-size: 0.85em; }
html body :is(.tweet-card .tweet-foot, .twitter-tweet) a { color: var(--muted) !important; }
`;

export function articleThemeOverrideStyleTag(): string {
	return `<style data-archive-theme-override>${ARTICLE_THEME_OVERRIDE}</style>`;
}

const CHROME_STYLE = `
html { color-scheme: light; ${LIGHT_VARS} }
@media (prefers-color-scheme: dark) {
  html:not([data-theme="light"]) { color-scheme: dark; ${DARK_VARS} }
}
html[data-theme="dark"] { color-scheme: dark; ${DARK_VARS} }
html[data-theme="light"] { color-scheme: light; ${LIGHT_VARS} }
:root { --control-h: 36px; --radius: 10px; --hover: color-mix(in srgb, var(--accent) 9%, transparent); }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", "PingFang SC", "Noto Sans SC", sans-serif;
  background: var(--bg); color: var(--fg); line-height: 1.55; min-height: 100vh; font-size: 15px;
  letter-spacing: -0.006em; -webkit-font-smoothing: antialiased;
}
a { color: var(--accent); }
a:hover { color: color-mix(in srgb, var(--accent) 80%, var(--fg)); }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
main { width: min(860px, calc(100% - 32px)); margin: 0 auto; padding: 0 0 72px; }

/* Header: brand or breadcrumb on the left, scope tabs, account menu on the right. */
header.site { margin: 0 0 22px; }
.site-bar { display: flex; align-items: center; gap: 16px; min-height: 60px; border-bottom: 1px solid var(--border); }
.brand { display: inline-flex; align-items: center; gap: 9px; color: var(--fg); text-decoration: none; font-weight: 650; font-size: 1.02rem; letter-spacing: -0.02em; white-space: nowrap; }
.brand::before { content: ""; width: 9px; height: 9px; border-radius: 3px; background: var(--accent); }
.brand:hover { color: var(--fg); }
.tabs { display: flex; gap: 2px; align-self: stretch; margin-left: 8px; }
.tabs a { display: inline-flex; align-items: center; padding: 0 12px; color: var(--muted); text-decoration: none; font-size: 0.9rem; font-weight: 500; border-bottom: 2px solid transparent; margin-bottom: -1px; }
.tabs a:hover { color: var(--fg); }
.tabs a[aria-current="page"] { color: var(--fg); border-bottom-color: var(--fg); }
.site-bar .account { margin-left: auto; }
.account > summary { display: inline-flex; align-items: center; gap: 8px; height: var(--control-h); padding: 0 8px 0 4px; border-radius: 999px; color: var(--fg); font-size: 0.88rem; }
.account > summary:hover { background: var(--hover); }
.avatar { display: inline-grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; background: color-mix(in srgb, var(--accent) 16%, var(--card)); color: var(--accent); font-weight: 650; font-size: 0.8rem; text-transform: uppercase; }
.account .who-name { max-width: 12ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.account .icon { color: var(--muted); }
.page-head { padding: 22px 0 0; }
.page-head h1 { margin: 0; font-size: 1.35rem; letter-spacing: -0.025em; font-weight: 650; line-height: 1.25; }
.page-head p { margin: 6px 0 0; color: var(--muted); font-size: 0.9rem; max-width: 40rem; }
.crumb { display: inline-flex; align-items: center; gap: 8px; font-size: 0.9rem; min-width: 0; }
.crumb .back { font-weight: 600; text-decoration: none; color: var(--fg); white-space: nowrap; }
.crumb .back:hover { color: var(--accent); }
.crumb-sep { color: var(--border); }
.crumb [aria-current] { color: var(--muted); white-space: nowrap; }

/* Controls: one height, one radius. Primary is filled; everything else is quiet. */
/* :where() keeps these at zero specificity so any component class (lightbox, share sheet, menus) wins outright. */
:where(button, .btn) { appearance: none; border: 1px solid transparent; border-radius: var(--radius); height: var(--control-h); padding: 0 14px; background: var(--accent); color: var(--accent-fg); font: inherit; font-size: 0.9rem; font-weight: 550; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; gap: 6px; line-height: 1; white-space: nowrap; transition: background .12s ease, border-color .12s ease, color .12s ease; }
:where(button, .btn):hover { background: color-mix(in srgb, var(--accent) 88%, var(--fg)); color: var(--accent-fg); }
:where(button, .btn).ghost { background: transparent; color: var(--fg); border-color: var(--border); font-weight: 500; }
:where(button, .btn).ghost:hover { background: var(--hover); border-color: color-mix(in srgb, var(--accent) 30%, var(--border)); color: var(--fg); }
:where(button, .btn).danger { background: transparent; color: var(--danger); border-color: color-mix(in srgb, var(--danger) 35%, var(--border)); font-weight: 500; }
:where(button, .btn).danger:hover { background: color-mix(in srgb, var(--danger) 9%, transparent); color: var(--danger); }
:where(button):disabled, :where(button):disabled:hover { opacity: .45; cursor: not-allowed; }
.thumb-zoom { height: auto; }
.icon-btn { width: 32px; height: 32px; padding: 0; border-radius: 8px; background: transparent; color: var(--muted); border: 0; display: inline-grid; place-items: center; cursor: pointer; }
.icon-btn:hover { background: var(--hover); color: var(--fg); }
summary.icon-btn { list-style: none; }
.star.on, .star.on:hover { color: #c8921a; }
label { display: block; font-size: 0.8rem; margin-bottom: 6px; color: var(--muted); font-weight: 550; }
input[type=password], input[type=text], input[type=search], select { width: 100%; height: var(--control-h); border: 1px solid var(--border); background: var(--card); color: var(--fg); border-radius: var(--radius); padding: 0 12px; font: inherit; font-size: 0.92rem; margin-bottom: 14px; }
input[type=password]:focus, input[type=text]:focus, input[type=search]:focus, select:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--ring); outline: none; }
.field-row { display: flex; gap: 8px; align-items: flex-end; flex-wrap: wrap; }
.field-row > div { flex: 1 1 160px; min-width: 0; }
.field-row input, .field-row select { margin: 0; }

/* Seg switch (language / theme / content language). */
.seg-switch { display: inline-flex; padding: 2px; gap: 2px; border-radius: 8px; background: color-mix(in srgb, var(--border) 55%, transparent); font-size: 0.78rem; line-height: 1.2; }
.seg-switch a { padding: 4px 10px; border-radius: 6px; text-decoration: none; color: var(--muted); }
.seg-switch a.active { background: var(--card); color: var(--fg); box-shadow: 0 1px 2px color-mix(in srgb, var(--fg) 12%, transparent); }
.seg-switch a:hover:not(.active) { color: var(--fg); }
.chrome-toggles { display: inline-flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.panel-top { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; margin-bottom: 18px; }

/* List toolbar: search plus three filter menus, then the result line. */
.toolbar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin: 0 0 10px; }
.search { position: relative; flex: 1 1 260px; min-width: 0; display: flex; }
.search > .icon { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); color: var(--muted); pointer-events: none; }
.search input { margin: 0; padding-left: 34px; background: var(--card); }
.filters { display: flex; gap: 6px; flex-wrap: wrap; }
.filter-btn { display: inline-flex; align-items: center; gap: 6px; height: var(--control-h); padding: 0 10px 0 12px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--card); color: var(--fg); font-size: 0.86rem; white-space: nowrap; }
.filter-btn:hover { border-color: color-mix(in srgb, var(--accent) 35%, var(--border)); }
.filter-btn.active { border-color: color-mix(in srgb, var(--accent) 55%, var(--border)); background: color-mix(in srgb, var(--accent) 8%, var(--card)); }
.filter-btn .value { max-width: 12ch; overflow: hidden; text-overflow: ellipsis; color: var(--accent); font-weight: 550; }
.filter-btn .icon { color: var(--muted); }
.menu-panel.scroll { max-height: min(60vh, 22rem); overflow: auto; }
.results { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 8px; min-height: 30px; margin: 0 0 6px; color: var(--muted); font-size: 0.84rem; }
.chip { display: inline-flex; align-items: center; gap: 4px; height: 26px; padding: 0 6px 0 10px; border-radius: 999px; background: color-mix(in srgb, var(--accent) 10%, var(--card)); color: var(--fg); text-decoration: none; font-size: 0.8rem; }
.chip:hover { background: color-mix(in srgb, var(--accent) 18%, var(--card)); color: var(--fg); }
.chip .icon { color: var(--muted); }
.clear-filters { font-size: 0.8rem; color: var(--muted); }

/* Article rows. */
.list { list-style: none; padding: 0; margin: 0; }
.card { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) auto auto; grid-template-areas: "main thumb actions"; gap: 0 16px; padding: 16px 0; border-bottom: 1px solid var(--border); }
.card:last-child { border-bottom: 0; }
.card-main { grid-area: main; min-width: 0; }
.card h2 { margin: 0 0 4px; font-size: 1.02rem; font-weight: 600; letter-spacing: -0.015em; line-height: 1.4; }
.card h2 a { color: inherit; text-decoration: none; }
.card h2 a:hover { color: var(--accent); }
.summary { margin: 0 0 8px; color: var(--muted); font-size: 0.9rem; line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.meta { display: flex; flex-wrap: wrap; gap: 4px 0; color: var(--muted); font-size: 0.8rem; align-items: center; }
.meta > * + *::before { content: "·"; margin: 0 7px; color: color-mix(in srgb, var(--muted) 60%, transparent); }
.meta a { color: var(--muted); text-decoration: none; }
.meta a:hover { color: var(--accent); text-decoration: underline; }
.badge { display: inline-flex; align-items: center; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; }
.share-open.badge { appearance: none; height: auto; padding: 0; border: 0; background: none; color: var(--accent); font: inherit; font-size: 0.7rem; font-weight: 600; cursor: pointer; }
.share-open.badge:hover { background: none; text-decoration: underline; color: var(--accent); }
.pills { display: flex; flex-wrap: wrap; gap: 4px 6px; margin: 8px 0 0; }
.pill { display: inline-flex; align-items: center; gap: 4px; padding: 1px 8px; border-radius: 6px; font-size: 0.75rem; color: var(--muted); text-decoration: none; background: color-mix(in srgb, var(--border) 45%, transparent); }
.pill:hover { color: var(--fg); background: color-mix(in srgb, var(--accent) 14%, transparent); }
.pill.folder { background: transparent; border: 1px solid var(--border); }
.thumb-zoom { grid-area: thumb; align-self: start; }
.thumb { display: block; width: 112px; height: 74px; border-radius: 8px; object-fit: cover; background: color-mix(in srgb, var(--border) 70%, var(--card)); }
.thumb-zoom .thumb { width: 112px; height: 74px; }
.card-actions { grid-area: actions; display: flex; align-items: flex-start; gap: 2px; margin-top: -4px; }
.card-actions form { margin: 0; }
.list-more { display: flex; flex-direction: column; align-items: center; gap: 10px; margin: 20px 0 0; }
.list-more .btn { min-width: min(14rem, 100%); }
.list-more[hidden], .list-more .btn[hidden], [hidden] { display: none !important; }
.list-more-status { margin: 0; color: var(--muted); font-size: 0.88rem; text-align: center; }
.empty { border: 1px dashed var(--border); border-radius: 14px; padding: 48px 20px; color: var(--muted); text-align: center; font-size: 0.95rem; margin-top: 8px; }

/* Rows for folders and users. */
.rows { list-style: none; padding: 0; margin: 0; border-top: 1px solid var(--border); }
.row { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--border); min-height: 60px; }
.row-main { flex: 1 1 auto; min-width: 0; }
.row-title { color: var(--fg); font-weight: 600; text-decoration: none; overflow-wrap: anywhere; }
a.row-title:hover { color: var(--accent); }
.row-sub { color: var(--muted); font-size: 0.8rem; margin-top: 2px; display: flex; flex-wrap: wrap; gap: 2px 0; }
.row-sub > * + *::before { content: "·"; margin: 0 7px; }
.row-sub code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.78rem; }
.row-actions { display: flex; align-items: center; gap: 2px; flex: 0 0 auto; }
.row-actions form { margin: 0; }
.role-badge { display: inline-flex; margin-left: 8px; padding: 1px 7px; border-radius: 6px; font-size: 0.7rem; font-weight: 600; vertical-align: 2px; color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent); }
.you { color: var(--muted); font-weight: 400; font-size: 0.85rem; margin-left: 6px; }
.inline-create { display: flex; gap: 8px; margin: 0 0 18px; }
.inline-create input { margin: 0; flex: 1 1 auto; min-width: 0; }
.section-title { margin: 28px 0 10px; font-size: 0.8rem; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }

/* Panels: sign-in, setup, settings sections. */
.panel { width: min(400px, calc(100% - 32px)); margin: 12vh auto; background: var(--card); border: 1px solid var(--border); border-radius: 16px; padding: 28px; }
.panel h1 { margin: 0 0 6px; font-size: 1.3rem; letter-spacing: -0.025em; }
.panel > p { margin: 0 0 20px; color: var(--muted); font-size: 0.92rem; }
.panel button[type=submit] { width: 100%; margin-top: 4px; }
.settings { display: grid; gap: 14px; max-width: 680px; margin-top: 20px; }
.panel.wide { width: 100%; margin: 0; padding: 20px 22px; }
.panel.wide h2 { margin: 0 0 4px; font-size: 1rem; font-weight: 600; }
.panel.wide > p { margin: 0 0 14px; font-size: 0.88rem; }
.panel.wide form { max-width: 26rem; }
.panel.wide button[type=submit] { width: auto; }
.error { background: color-mix(in srgb, var(--danger) 10%, var(--card)); color: inherit; border: 1px solid color-mix(in srgb, var(--danger) 30%, var(--border)); padding: 10px 12px; border-radius: var(--radius); margin-bottom: 14px; font-size: 0.88rem; }
.notice { background: color-mix(in srgb, var(--accent) 10%, var(--card)); border: 1px solid color-mix(in srgb, var(--accent) 30%, var(--border)); padding: 12px 14px; border-radius: var(--radius); margin-bottom: 14px; font-size: 0.9rem; }
.notice code, .token { display: block; margin-top: 8px; word-break: break-all; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.84rem; }
code.prefix { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.85rem; padding: 2px 6px; border-radius: 6px; background: color-mix(in srgb, var(--border) 50%, transparent); }
.not-found { text-align: center; padding: 64px 0; color: var(--muted); }

@media (max-width: 640px) {
  main { width: calc(100% - 32px); }
  .site-bar { gap: 8px; min-height: 54px; }
  .tabs { margin-left: 0; }
  .tabs a { padding: 0 9px; }
  .account .who-name { display: none; }
  .toolbar { gap: 6px; }
  .search { flex-basis: 100%; }
  .filters { width: 100%; }
  .filters .menu { flex: 1 1 0; min-width: 0; }
  .filters .filter-btn { width: 100%; justify-content: space-between; }
  .filters .menu:first-child .menu-panel { left: 0; right: auto; }
  .card { grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "main actions" "main thumb"; gap: 0 10px; }
  .thumb, .thumb-zoom .thumb { width: 64px; height: 64px; }
  .thumb-zoom { justify-self: end; margin-top: 4px; }
  .card-actions { flex-direction: row; }
  .meta { gap: 2px 10px; }
  .meta > * + *::before { content: none; }
  .filter-btn:not(.active) .value { display: none; }
  .panel { padding: 22px; }
  .panel.wide { padding: 18px; }
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
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <title>${escapeHtml(title)}</title>
  <style>${CHROME_STYLE}${MENU_STYLE}${FOLDER_PICKER_STYLE}${LIGHTBOX_STYLE}${SHARE_DIALOG_STYLE}${LINK_CONFIRM_STYLE}</style>
  ${LANG_BOOTSTRAP}
  ${THEME_BOOTSTRAP}
</head>
<body>
${body}
${lightboxMarkup(chrome.locale)}
${shareDialogMarkup(chrome.locale)}
${linkConfirmMarkup(chrome.locale)}
${MENU_SCRIPT}
${LIGHTBOX_SCRIPT}
${SHARE_DIALOG_SCRIPT}
${LINK_CONFIRM_SCRIPT}
</body>
</html>`;
}

let cachedScriptHashes: string[] | null = null;

/** Hashes of every inline script the archive emits. A script missing here is blocked by CSP. */
export function inlineScriptHashes(): string[] {
	cachedScriptHashes ??= scriptHashSources([
		LANG_BOOTSTRAP,
		THEME_BOOTSTRAP,
		MENU_SCRIPT,
		LIGHTBOX_SCRIPT,
		SHARE_DIALOG_SCRIPT,
		LIST_PAGER_SCRIPT,
		CONTENT_LANG_BOOTSTRAP,
		CONTENT_LANG_SCRIPT,
		CONTENT_LANG_HINT,
		LINK_CONFIRM_SCRIPT,
	]);
	return cachedScriptHashes;
}

/** Security headers shared by every archive UI response (pages and list fragments). */
export function setAppSecurityHeaders(headers: Headers): Headers {
	headers.set('content-security-policy', appPagePolicy(inlineScriptHashes()));
	headers.set('x-frame-options', 'DENY');
	headers.set('x-content-type-options', 'nosniff');
	headers.set('referrer-policy', 'same-origin');
	return headers;
}

function htmlPage(title: string, body: string, chrome: Chrome, status = 200, headers?: HeadersInit): Response {
	const extra = new Headers(headers);
	extra.set('content-type', 'text/html; charset=utf-8');
	extra.set('cache-control', 'private, no-store');
	extra.set('x-robots-tag', 'noindex, nofollow');
	setAppSecurityHeaders(extra);
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

/** Everything secondary lives here: management pages, interface prefs, sign-out. */
function accountMenu(viewer: SessionUser, chrome: Chrome): string {
	const locale = chrome.locale;
	const roleLabel = viewer.role === 'admin' ? t(locale, 'adminBadge') : t(locale, 'roleUser');
	return `<details class="menu account" data-menu>
    <summary aria-label="${escapeHtml(t(locale, 'accountMenu'))}"><span class="avatar" aria-hidden="true">${escapeHtml(viewer.username.slice(0, 1))}</span><span class="who-name">${escapeHtml(viewer.username)}</span>${icon('chevron', { size: 14 })}</summary>
    <div class="menu-panel">
      <div class="menu-head"><strong>${escapeHtml(viewer.username)}</strong>${escapeHtml(roleLabel)}</div>
      <a class="menu-item" href="/folders">${escapeHtml(t(locale, 'folders'))}</a>
      <a class="menu-item" href="/settings">${escapeHtml(t(locale, 'settings'))}</a>
      ${viewer.role === 'admin' ? `<a class="menu-item" href="/admin/users">${escapeHtml(t(locale, 'users'))}</a>` : ''}
      <hr>
      <div class="menu-row"><span>${escapeHtml(t(locale, 'langToggle'))}</span>${langSwitch(chrome)}</div>
      <div class="menu-row"><span>${escapeHtml(t(locale, 'themeToggle'))}</span>${themeSwitch(chrome)}</div>
      <hr>
      <form method="post" action="/logout"><button type="submit">${escapeHtml(t(locale, 'signOut'))}</button></form>
    </div>
  </details>`;
}

export type ListScope = 'all' | 'starred' | 'mine';

/**
 * Top bar shared by every signed-in page. The list page passes scope tabs; management
 * pages pass a breadcrumb key and get a title block under the bar.
 */
function siteHeader(
	viewer: SessionUser,
	chrome: Chrome,
	title: string,
	leadHtml: string,
	tabsHtml = '',
	crumbKey?: MessageKey,
): string {
	const left = crumbKey ? crumbNav(chrome, crumbKey) : `<a class="brand" href="/">${escapeHtml(t(chrome.locale, 'siteTitle'))}</a>`;
	const head = crumbKey
		? `<div class="page-head">
      <h1>${escapeHtml(title)}</h1>
      ${leadHtml ? `<p>${leadHtml}</p>` : ''}
    </div>`
		: '';
	return `<header class="site">
    <div class="site-bar">
      ${left}
      ${tabsHtml}
      ${accountMenu(viewer, chrome)}
    </div>
    ${head}
  </header>`;
}

export function loginPage(chrome: Chrome, nextPath: string, error?: string, setupAvailable = false, status = 200): Response {
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
	return htmlPage(t(locale, 'signInTitle'), body, chrome, status);
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
	sort?: ArticleSort;
	cursor?: string;
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
	if (filters.sort) {
		params.set('sort', filters.sort);
	}
	if (filters.cursor) {
		params.set('cursor', filters.cursor);
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
	sort: ArticleSort;
	nextCursor: string | null;
};

/** Share controls as menu items. Copy keeps a text-only label because the share script swaps it for "Copied". */
function shareMenuItems(article: ArticleView, nextPath: string, locale: Locale): string {
	const slug = escapeHtml(article.slug);
	const title = escapeHtml(article.title);
	const toggle = (shared: boolean, label: string, className = '') => `<form method="post" action="/share">
        <input type="hidden" name="slug" value="${slug}">
        <input type="hidden" name="next" value="${escapeHtml(nextPath)}">
        <input type="hidden" name="shared" value="${shared ? '0' : '1'}">
        <button type="submit"${className ? ` class="${className}"` : ''} aria-label="${escapeHtml(t(locale, 'shareAria'))}" aria-pressed="${shared ? 'true' : 'false'}">${escapeHtml(label)}</button>
      </form>`;
	if (!isArticleShared(article)) {
		return toggle(false, t(locale, 'share'));
	}
	return `<button type="button" class="menu-item" data-share-open data-share-slug="${slug}" data-share-title="${title}" aria-label="${escapeHtml(t(locale, 'shareOpenAria'))}">${escapeHtml(t(locale, 'shareDialogTitle'))}</button>
      <button type="button" class="menu-item" data-share-copy data-share-slug="${slug}" data-share-title="${title}" aria-label="${escapeHtml(t(locale, 'copyLinkAria'))}">${escapeHtml(t(locale, 'copyLink'))}</button>
      ${toggle(true, t(locale, 'unshare'), 'danger')}`;
}

function sharedBadge(article: ArticleView, locale: Locale): string {
	return `<button type="button" class="badge share-open" data-share-open data-share-slug="${escapeHtml(article.slug)}" data-share-title="${escapeHtml(article.title)}" aria-label="${escapeHtml(t(locale, 'shareOpenAria'))}">${escapeHtml(t(locale, 'sharedBadge'))}</button>`;
}

function starForm(article: ArticleView, nextPath: string, locale: Locale, className = 'icon-btn'): string {
	const label = article.starred ? t(locale, 'unstar') : t(locale, 'star');
	return `<form method="post" action="/star">
      <input type="hidden" name="slug" value="${escapeHtml(article.slug)}">
      <input type="hidden" name="next" value="${escapeHtml(nextPath)}">
      <button class="${className} star${article.starred ? ' on' : ''}" type="submit" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}" aria-pressed="${article.starred ? 'true' : 'false'}">${icon('star', { filled: article.starred, size: 18 })}</button>
    </form>`;
}

/** The per-article "more" menu: sharing, folders, and links out. */
function articleMenu(
	article: ArticleView,
	folders: FolderSummary[],
	nextPath: string,
	locale: Locale,
	variant: 'page' | 'chrome',
	extraItems = '',
): string {
	const picker =
		folders.length === 0
			? `<a class="menu-item" href="/folders">${escapeHtml(t(locale, 'createFirstFolder'))}</a>`
			: folderPickerMarkup(article, folders, nextPath, locale, variant);
	const source = safeHttpUrl(article.source_url);
	return `<details class="menu article-menu" data-menu>
      <summary class="icon-btn" aria-label="${escapeHtml(t(locale, 'moreActions'))}" title="${escapeHtml(t(locale, 'moreActions'))}">${icon('more', { size: 18 })}</summary>
      <div class="menu-panel">
        ${shareMenuItems(article, nextPath, locale)}
        <hr>
        ${picker}
        ${source ? `<a class="menu-item" href="${escapeHtml(source)}" rel="noreferrer noopener" target="_blank">${escapeHtml(t(locale, 'openSource'))}</a>` : ''}
        ${extraItems}
      </div>
    </details>`;
}

function sourceHost(source: string | null): string {
	if (!source) {
		return '';
	}
	try {
		return new URL(source).hostname.replace(/^www\./, '');
	} catch {
		return '';
	}
}

const LIST_PAGER_SCRIPT = `<script>
(function () {
  var root = document.querySelector('[data-article-list]');
  if (!root) return;
  var list = root.querySelector('ul.list');
  var more = root.querySelector('[data-load-more]');
  var status = root.querySelector('[data-load-more-status]');
  var countEl = document.querySelector('[data-list-count]');
  var loaded = Number(root.getAttribute('data-loaded-count') || '0');
  var next = root.getAttribute('data-next-cursor') || '';
  var busy = false;

  function countLabel(n) {
    var one = root.getAttribute('data-count-one') || String(n);
    var many = root.getAttribute('data-count-many') || String(n);
    return n === 1 ? one : many.split('{n}').join(String(n));
  }

  function setStatus(text, show) {
    if (!status) return;
    status.hidden = !show;
    status.textContent = text || '';
  }

  function setNext(cursor, href) {
    next = cursor || '';
    root.setAttribute('data-next-cursor', next);
    root.setAttribute('data-loaded-count', String(loaded));
    if (countEl) countEl.textContent = countLabel(loaded);
    if (!more) return;
    var wrap = more.closest('.list-more');
    if (!next) {
      more.hidden = true;
      if (wrap) wrap.hidden = true;
      return;
    }
    more.hidden = false;
    if (wrap) wrap.hidden = false;
    if (href) more.setAttribute('href', href);
  }

  function load() {
    if (!next || busy) return;
    busy = true;
    if (more) more.setAttribute('aria-busy', 'true');
    setStatus(root.getAttribute('data-loading-label') || '', true);
    var url = new URL(root.getAttribute('data-partial-url') || '/', location.origin);
    url.searchParams.set('partial', '1');
    url.searchParams.set('cursor', next);
    fetch(url.toString(), { headers: { accept: 'text/html' } })
      .then(function (response) {
        if (!response.ok) throw new Error('load failed');
        return response.text().then(function (html) {
          return {
            html: html,
            cursor: response.headers.get('x-next-cursor') || '',
            href: response.headers.get('x-next-href') || ''
          };
        });
      })
      .then(function (page) {
        var wrap = document.createElement('ul');
        wrap.innerHTML = page.html || '';
        var added = wrap.querySelectorAll('li.card').length;
        if (list && page.html) {
          list.insertAdjacentHTML('beforeend', page.html);
        }
        loaded += added;
        setNext(page.cursor, page.href);
        setStatus('', false);
      })
      .catch(function () {
        setStatus(root.getAttribute('data-error-label') || '', true);
      })
      .then(function () {
        busy = false;
        if (more) more.removeAttribute('aria-busy');
      });
  }

  if (more) more.addEventListener('click', function (event) {
    event.preventDefault();
    load();
  });
  if (more && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      if (entries.some(function (entry) { return entry.isIntersecting; })) {
        load();
      }
    }, { rootMargin: '320px 0px' });
    io.observe(more);
  }
})();
</script>`;

export function articleListItemsHtml(
	articles: ArticleView[],
	folders: FolderSummary[],
	filters: ListFilters,
	viewer: SessionUser,
	locale: Locale,
): string {
	const current = listHref({ ...filters, cursor: undefined });
	const hrefFor = (patch: Partial<ListFilters>) => listHref({ ...filters, cursor: undefined, ...patch });
	return articles
		.map((article) => {
			const source = safeHttpUrl(article.source_url);
			const host = sourceHost(source);
			// Show the timestamp the list is ordered by, so the dates read in order.
			const byJoined = (filters.sort ?? 'joined') === 'joined';
			const whenIso = byJoined ? article.created_at : (article.published_at ?? article.created_at);
			const when = formatUiDate(whenIso, locale);
			const whenTitle = t(locale, byJoined ? 'sortJoined' : 'sortPublished');
			const thumb = article.thumbnail_key
				? `<button type="button" class="thumb-zoom" aria-label="${escapeHtml(t(locale, 'lightboxOpen'))}"><img class="thumb" src="/thumb/${encodeURIComponent(article.slug)}" alt="" width="112" height="74" loading="lazy"></button>`
				: '';
			const summary = article.summary_zh ? `<p class="summary" lang="zh">${escapeHtml(article.summary_zh)}</p>` : '';
			// Owner only matters to an admin looking at someone else's article.
			const owner =
				viewer.role === 'admin' && article.owner_username && article.owner_id !== viewer.id ? `<span>@${escapeHtml(article.owner_username)}</span>` : '';
			const pills = [
				...article.tags.map((tag) => `<a class="pill" href="${escapeHtml(hrefFor({ tag: tag.slug }))}">${escapeHtml(tagLabel(locale, tag))}</a>`),
				...article.folders.map(
					(folder) => `<a class="pill folder" href="${escapeHtml(hrefFor({ folder: folder.id }))}">${icon('folder', { size: 12 })}${escapeHtml(folder.name)}</a>`,
				),
			].join('');
			return `<li class="card">
            <div class="card-main">
              <h2><a href="/a/${encodeURIComponent(article.slug)}">${escapeHtml(article.title)}</a></h2>
              ${summary}
              <div class="meta">
                ${article.author ? `<span>${escapeHtml(article.author)}</span>` : ''}
                ${host && source ? `<a href="${escapeHtml(source)}" rel="noreferrer noopener" target="_blank" title="${escapeHtml(t(locale, 'source'))}">${escapeHtml(host)}</a>` : ''}
                ${when ? `<time datetime="${escapeHtml(whenIso)}" title="${escapeHtml(whenTitle)}">${escapeHtml(when)}</time>` : ''}
                ${article.lang ? `<span class="badge">${escapeHtml(article.lang)}</span>` : ''}
                ${isArticleShared(article) ? `<span>${sharedBadge(article, locale)}</span>` : ''}
                ${owner}
              </div>
              ${pills ? `<div class="pills">${pills}</div>` : ''}
            </div>
            ${thumb}
            <div class="card-actions">
              ${starForm(article, current, locale)}
              ${articleMenu(article, folders, current, locale, 'page')}
            </div>
          </li>`;
		})
		.join('');
}

function filterMenu(
	label: string,
	value: string | null,
	items: string,
	options: { alignLeft?: boolean; className?: string; active?: boolean } = {},
): string {
	const classes = ['menu', options.alignLeft ? 'align-left' : '', options.className ?? ''].filter(Boolean).join(' ');
	const active = options.active ?? Boolean(value);
	return `<details class="${classes}" data-menu>
      <summary class="filter-btn${active ? ' active' : ''}"><span>${escapeHtml(label)}</span>${value ? `<span class="value">${escapeHtml(value)}</span>` : ''}${icon('chevron', { size: 14 })}</summary>
      <div class="menu-panel scroll">${items}</div>
    </details>`;
}

function menuLink(href: string, label: string, active: boolean, count?: number): string {
	return `<a class="menu-item" href="${escapeHtml(href)}"${active ? ' aria-current="true"' : ''}>${escapeHtml(label)}${count === undefined ? '' : `<span class="count">${count}</span>`}</a>`;
}

export function listPage(chrome: Chrome, model: ListPageModel): Response {
	const locale = chrome.locale;
	const { articles, tags, folders, query, activeTag, activeFolderId, starred, viewer, mine, sort, nextCursor } = model;
	const filters: ListFilters = { q: query, tag: activeTag, mine, folder: activeFolderId, starred, sort };
	const hrefFor = (patch: Partial<ListFilters>) => listHref({ ...filters, ...patch });

	const scope: ListScope = starred ? 'starred' : mine ? 'mine' : 'all';
	const tab = (target: ListScope, label: string) =>
		`<a href="${escapeHtml(hrefFor({ starred: target === 'starred', mine: target === 'mine' }))}"${scope === target ? ' aria-current="page"' : ''}>${escapeHtml(label)}</a>`;
	const tabs = `<nav class="tabs" aria-label="${escapeHtml(t(locale, 'scopeAria'))}">
      ${tab('all', t(locale, 'tabAll'))}
      ${tab('starred', t(locale, 'starred'))}
      ${viewer.role === 'admin' ? tab('mine', t(locale, 'mine')) : ''}
    </nav>`;

	const activeFolder = folders.find((folder) => folder.id === activeFolderId) ?? null;
	const activeTagRow = tags.find((tag) => tag.slug === activeTag) ?? null;
	const activeTagLabel = activeTagRow ? tagLabel(locale, activeTagRow) : activeTag;

	const folderItems = [
		menuLink(hrefFor({ folder: null }), t(locale, 'allFolders'), !activeFolderId),
		...folders.map((folder) => menuLink(hrefFor({ folder: folder.id }), folder.name, folder.id === activeFolderId, folder.article_count)),
		'<hr>',
		`<a class="menu-item" href="/folders">${escapeHtml(t(locale, 'manageFolders'))}</a>`,
	].join('');
	const visibleTags = tags.filter((tag) => tag.article_count > 0 || tag.slug === activeTag);
	const tagItems = [
		menuLink(hrefFor({ tag: null }), t(locale, 'allTagsMenu'), !activeTag),
		...visibleTags.map((tag) => menuLink(hrefFor({ tag: tag.slug }), tagLabel(locale, tag), tag.slug === activeTag, tag.article_count)),
	].join('');
	const sortItems = [
		menuLink(hrefFor({ sort: 'joined' }), t(locale, 'sortJoined'), sort === 'joined'),
		menuLink(hrefFor({ sort: 'published' }), t(locale, 'sortPublished'), sort === 'published'),
	].join('');

	const toolbar = `<div class="toolbar">
      <form class="search" method="get" action="/" role="search">
        ${icon('search')}
        ${activeTag ? `<input type="hidden" name="tag" value="${escapeHtml(activeTag)}">` : ''}
        ${activeFolderId ? `<input type="hidden" name="folder" value="${escapeHtml(activeFolderId)}">` : ''}
        ${starred ? '<input type="hidden" name="starred" value="1">' : ''}
        ${mine ? '<input type="hidden" name="mine" value="1">' : ''}
        <input type="hidden" name="sort" value="${escapeHtml(sort)}">
        <input type="search" name="q" value="${escapeHtml(query)}" placeholder="${escapeHtml(t(locale, 'searchPlaceholder'))}" aria-label="${escapeHtml(t(locale, 'searchAria'))}">
        <button type="submit" class="sr-only">${escapeHtml(t(locale, 'search'))}</button>
      </form>
      <div class="filters">
        ${filterMenu(t(locale, 'foldersAria'), activeFolder?.name ?? null, folderItems, { alignLeft: true })}
        ${filterMenu(t(locale, 'tagsAria'), activeTagLabel, tagItems)}
        ${filterMenu(t(locale, 'sortAria'), sort === 'published' ? t(locale, 'sortPublished') : t(locale, 'sortJoined'), sortItems, { className: 'sort-switch', active: sort !== 'joined' })}
      </div>
    </div>`;

	const chip = (label: string, href: string) =>
		`<a class="chip" href="${escapeHtml(href)}" aria-label="${escapeHtml(t(locale, 'removeFilterAria', { name: label }))}">${escapeHtml(label)}${icon('close', { size: 12 })}</a>`;
	const chips = [
		query ? chip(t(locale, 'searchChip', { q: query }), hrefFor({ q: undefined })) : '',
		activeFolder ? chip(activeFolder.name, hrefFor({ folder: null })) : '',
		activeTagLabel ? chip(activeTagLabel, hrefFor({ tag: null })) : '',
	].filter(Boolean);
	const countLabel = articles.length === 1 ? t(locale, 'articleOne') : t(locale, 'articleMany', { n: articles.length });
	const results = `<div class="results">
      <span data-list-count>${escapeHtml(countLabel)}</span>
      ${chips.join('')}
      ${chips.length > 1 ? `<a class="clear-filters" href="${escapeHtml(listHref({ starred, mine, sort }))}">${escapeHtml(t(locale, 'clearFilters'))}</a>` : ''}
    </div>`;

	const emptyReason =
		starred && activeFolderId
			? escapeHtml(t(locale, 'noStarredInFolder'))
			: starred
				? escapeHtml(t(locale, 'noStarredArticles'))
				: activeFolderId
					? escapeHtml(t(locale, 'noFolderArticles'))
					: activeTag
						? t(locale, 'noArticlesTagged', { tag: escapeHtml(activeTagLabel ?? activeTag) })
						: query
							? t(locale, 'noArticlesMatch', { q: escapeHtml(query) })
							: escapeHtml(t(locale, 'noArticles'));

	const cards =
		articles.length === 0
			? `<div class="empty">${emptyReason}</div>`
			: `<ul class="list">${articleListItemsHtml(articles, folders, filters, viewer, locale)}</ul>`;

	const moreHref = nextCursor ? hrefFor({ cursor: nextCursor }) : '';
	const pager =
		articles.length === 0 || !nextCursor
			? ''
			: `<div class="list-more">
      <a class="btn ghost" data-load-more href="${escapeHtml(moreHref)}">${escapeHtml(t(locale, 'loadMore'))}</a>
      <p class="list-more-status" data-load-more-status hidden></p>
    </div>`;
	const listBlock = `<div class="article-list" data-article-list data-next-cursor="${escapeHtml(nextCursor ?? '')}" data-loaded-count="${articles.length}" data-partial-url="${escapeHtml(listHref(filters))}" data-count-one="${escapeHtml(t(locale, 'articleOne'))}" data-count-many="${escapeHtml(t(locale, 'articleMany', { n: '{n}' }))}" data-loading-label="${escapeHtml(t(locale, 'loadingMore'))}" data-error-label="${escapeHtml(t(locale, 'loadMoreError'))}">
    ${cards}
    ${pager}
  </div>`;

	const body = `
  <main>
    ${siteHeader(viewer, chrome, t(locale, 'siteTitle'), '', tabs)}
    ${toolbar}
    ${results}
    ${listBlock}
  </main>
  ${LIST_PAGER_SCRIPT}`;
	return htmlPage(t(locale, 'siteTitle'), body, chrome);
}

export function foldersPage(chrome: Chrome, viewer: SessionUser, folders: FolderSummary[], error?: string): Response {
	const locale = chrome.locale;
	const rows =
		folders.length === 0
			? `<div class="empty">${escapeHtml(t(locale, 'noFolders'))}</div>`
			: `<ul class="rows">${folders
					.map((folder, index) => {
						const id = encodeURIComponent(folder.id);
						const articleLabel = folder.article_count === 1 ? t(locale, 'articleOne') : t(locale, 'articleMany', { n: folder.article_count });
						const move = (direction: 'up' | 'down', disabled: boolean) => `<form method="post" action="/folders/${id}/move">
                <input type="hidden" name="direction" value="${direction}">
                <button class="icon-btn" type="submit" aria-label="${escapeHtml(t(locale, direction === 'up' ? 'moveUp' : 'moveDown'))}" title="${escapeHtml(t(locale, direction === 'up' ? 'moveUp' : 'moveDown'))}"${disabled ? ' disabled' : ''}>${icon(direction)}</button>
              </form>`;
						return `<li class="row">
            <div class="row-main">
              <a class="row-title" href="${escapeHtml(listHref({ folder: folder.id }))}">${escapeHtml(folder.name)}</a>
              <div class="row-sub"><span>${escapeHtml(articleLabel)}</span></div>
            </div>
            <div class="row-actions">
              ${move('up', index === 0)}
              ${move('down', index === folders.length - 1)}
              <details class="menu" data-menu>
                <summary class="icon-btn" aria-label="${escapeHtml(t(locale, 'moreActions'))}" title="${escapeHtml(t(locale, 'moreActions'))}">${icon('more', { size: 18 })}</summary>
                <div class="menu-panel">
                  <form class="menu-section" method="post" action="/folders/${id}/rename">
                    <label for="name-${escapeHtml(folder.id)}">${escapeHtml(t(locale, 'rename'))}</label>
                    <div class="inline">
                      <input id="name-${escapeHtml(folder.id)}" name="name" type="text" value="${escapeHtml(folder.name)}" maxlength="80" required>
                      <button type="submit">${escapeHtml(t(locale, 'save'))}</button>
                    </div>
                  </form>
                  <hr>
                  <form method="post" action="/folders/${id}/delete"><button class="danger" type="submit">${escapeHtml(t(locale, 'deleteFolder'))}</button></form>
                </div>
              </details>
            </div>
          </li>`;
					})
					.join('')}</ul>`;

	const body = `
  <main>
    ${siteHeader(viewer, chrome, t(locale, 'foldersHeading'), escapeHtml(t(locale, 'foldersLead')), '', 'folders')}
    ${error ? `<div class="error" role="alert">${escapeHtml(error)}</div>` : ''}
    <form class="inline-create" method="post" action="/folders" style="margin-top:20px">
      <label class="sr-only" for="folder-name">${escapeHtml(t(locale, 'folderName'))}</label>
      <input id="folder-name" name="name" type="text" maxlength="80" required placeholder="${escapeHtml(t(locale, 'newFolderPlaceholder'))}">
      <button type="submit">${escapeHtml(t(locale, 'createFolder'))}</button>
    </form>
    <h2 class="section-title">${escapeHtml(folders.length === 1 ? t(locale, 'folderOne') : t(locale, 'folderMany', { n: folders.length }))}</h2>
    ${rows}
  </main>`;
	return htmlPage(t(locale, 'foldersTitle'), body, chrome);
}

export type SettingsState = {
	issuedToken?: string;
	error?: string;
	notice?: string;
};

export function settingsPage(chrome: Chrome, viewer: SessionUser, prefix: string | null, state: SettingsState = {}, headers?: HeadersInit): Response {
	const locale = chrome.locale;
	const { issuedToken, error, notice } = state;
	const body = `
  <main>
    ${siteHeader(viewer, chrome, t(locale, 'settingsHeading'), '', '', 'settings')}
    <div class="settings">
      ${error ? `<div class="error" role="alert">${escapeHtml(error)}</div>` : ''}
      ${notice ? `<div class="notice" role="status">${escapeHtml(notice)}</div>` : ''}
      <section class="panel wide">
        <h2>${escapeHtml(t(locale, 'uploadTokenHeading'))}</h2>
        <p>${escapeHtml(t(locale, 'settingsLead'))}</p>
        ${
					issuedToken
						? `<div class="notice">${escapeHtml(t(locale, 'copyTokenAgain'))}<code class="token">${escapeHtml(issuedToken)}</code></div>`
						: ''
				}
        <div class="field-row">
          <div>${escapeHtml(t(locale, 'currentPrefix'))} <code class="prefix">${escapeHtml(prefix ?? t(locale, 'none'))}</code></div>
          <form method="post" action="/settings/token">
            <button class="ghost" type="submit">${escapeHtml(t(locale, 'rotateToken'))}</button>
          </form>
        </div>
      </section>
      <section class="panel wide">
        <h2>${escapeHtml(t(locale, 'changePasswordHeading'))}</h2>
        <p>${escapeHtml(t(locale, 'changePasswordLead'))}</p>
        <form method="post" action="/settings/password">
          <label for="current_password">${escapeHtml(t(locale, 'currentPassword'))}</label>
          <input id="current_password" name="current_password" type="password" autocomplete="current-password" required>
          <label for="new_password">${escapeHtml(t(locale, 'newPassword'))}</label>
          <input id="new_password" name="new_password" type="password" autocomplete="new-password" required>
          <label for="confirm">${escapeHtml(t(locale, 'confirmPassword'))}</label>
          <input id="confirm" name="confirm" type="password" autocomplete="new-password" required>
          <button type="submit">${escapeHtml(t(locale, 'changePassword'))}</button>
        </form>
      </section>
      <section class="panel wide">
        <h2>${escapeHtml(t(locale, 'sessionsHeading'))}</h2>
        <p>${escapeHtml(t(locale, 'sessionsLead'))}</p>
        <form method="post" action="/settings/sessions/revoke">
          <button class="danger" type="submit">${escapeHtml(t(locale, 'signOutEverywhere'))}</button>
        </form>
      </section>
    </div>
  </main>`;
	return htmlPage(t(locale, 'settingsTitle'), body, chrome, 200, headers);
}

/**
 * A user who owns articles can only be deleted with an explicit choice for them: the
 * select is required and has no default. Deleting yourself can only take the articles along.
 */
function deleteUserForm(user: UserListRow, isSelf: boolean, disabled: boolean, locale: Locale): string {
	const action = `/admin/users/${encodeURIComponent(user.id)}/delete`;
	const disabledAttr = disabled ? ' disabled' : '';
	if (user.article_count === 0) {
		return `<form method="post" action="${action}">
            <button class="danger" type="submit"${disabledAttr}>${escapeHtml(t(locale, 'deleteUser'))}</button>
          </form>`;
	}
	const transfer = isSelf ? '' : `<option value="transfer">${escapeHtml(t(locale, 'deleteArticlesTransfer'))}</option>`;
	return `<form class="menu-section delete-user" method="post" action="${action}">
            <label>${escapeHtml(t(locale, 'deleteUser'))}</label>
            <div class="stack">
              <select name="articles" required aria-label="${escapeHtml(t(locale, 'deleteArticlesChoice', { n: user.article_count }))}"${disabledAttr}>
                <option value="" disabled selected>${escapeHtml(t(locale, 'deleteArticlesChoice', { n: user.article_count }))}</option>
                ${transfer}
                <option value="delete">${escapeHtml(t(locale, 'deleteArticlesDelete'))}</option>
              </select>
              <button class="danger" type="submit"${disabledAttr}>${escapeHtml(t(locale, 'delete'))}</button>
            </div>
          </form>`;
}

export function adminUsersPage(
	chrome: Chrome,
	viewer: SessionUser,
	users: UserListRow[],
	issued?: { username: string; token: string },
	error?: string,
	notice?: string,
): Response {
	const locale = chrome.locale;
	const adminCount = users.filter((item) => item.role === 'admin').length;
	const rows = users
		.map((user) => {
			const id = encodeURIComponent(user.id);
			const isSelf = user.id === viewer.id;
			const lastAdmin = user.role === 'admin' && adminCount <= 1;
			const articleLabel = user.article_count === 1 ? t(locale, 'articleOne') : t(locale, 'articleMany', { n: user.article_count });
			return `<li class="row">
        <div class="row-main">
          <span class="row-title">${escapeHtml(user.username)}</span>${user.role === 'admin' ? `<span class="role-badge">${escapeHtml(t(locale, 'roleAdmin'))}</span>` : ''}${isSelf ? `<span class="you">${escapeHtml(t(locale, 'you'))}</span>` : ''}
          <div class="row-sub">
            <span>${escapeHtml(articleLabel)}</span>
            <span>${escapeHtml(t(locale, 'tokenPrefix'))} <code>${escapeHtml(user.upload_token_prefix ?? '—')}</code></span>
            <span>${escapeHtml(formatUiDate(user.created_at, locale))}</span>
          </div>
        </div>
        <div class="row-actions">
          <details class="menu" data-menu>
            <summary class="icon-btn" aria-label="${escapeHtml(t(locale, 'moreActions'))}" title="${escapeHtml(t(locale, 'moreActions'))}">${icon('more', { size: 18 })}</summary>
            <div class="menu-panel">
              <form method="post" action="/admin/users/${id}/role">
                <input type="hidden" name="role" value="${user.role === 'admin' ? 'user' : 'admin'}">
                <button type="submit"${lastAdmin ? ' disabled' : ''}>${escapeHtml(t(locale, user.role === 'admin' ? 'demote' : 'promote'))}</button>
              </form>
              <form method="post" action="/admin/users/${id}/token">
                <button type="submit">${escapeHtml(t(locale, 'rotateTokenShort'))}</button>
              </form>
              <hr>
              <form class="menu-section" method="post" action="/admin/users/${id}/password">
                <label for="reset-${escapeHtml(user.id)}">${escapeHtml(t(locale, 'resetPassword'))}</label>
                <div class="inline">
                  <input id="reset-${escapeHtml(user.id)}" name="password" type="password" autocomplete="new-password" required minlength="8" aria-label="${escapeHtml(t(locale, 'newPasswordFor', { user: user.username }))}" placeholder="${escapeHtml(t(locale, 'newPassword'))}">
                  <button type="submit">${escapeHtml(t(locale, 'save'))}</button>
                </div>
              </form>
              <hr>
              ${deleteUserForm(user, isSelf, lastAdmin, locale)}
            </div>
          </details>
        </div>
      </li>`;
		})
		.join('');

	const body = `
  <main>
    ${siteHeader(viewer, chrome, t(locale, 'usersHeading'), escapeHtml(t(locale, 'usersLead')), '', 'users')}
    ${error ? `<div class="error" role="alert">${escapeHtml(error)}</div>` : ''}
    ${notice ? `<div class="notice" role="status">${escapeHtml(notice)}</div>` : ''}
    ${
			issued
				? `<div class="notice">${t(locale, 'tokenForUser', { user: escapeHtml(issued.username) })}<code class="token">${escapeHtml(issued.token)}</code></div>`
				: ''
		}
    <h2 class="section-title">${escapeHtml(t(locale, 'addUser'))}</h2>
    <form class="field-row" method="post" action="/admin/users">
      <div>
        <label for="username">${escapeHtml(t(locale, 'username'))}</label>
        <input id="username" name="username" type="text" autocomplete="off" required>
      </div>
      <div>
        <label for="password">${escapeHtml(t(locale, 'password'))}</label>
        <input id="password" name="password" type="password" autocomplete="new-password" required>
      </div>
      <div style="flex:0 1 140px">
        <label for="role">${escapeHtml(t(locale, 'role'))}</label>
        <select id="role" name="role">
          <option value="user">${escapeHtml(t(locale, 'roleUser'))}</option>
          <option value="admin">${escapeHtml(t(locale, 'roleAdmin'))}</option>
        </select>
      </div>
      <button type="submit">${escapeHtml(t(locale, 'addUser'))}</button>
    </form>
    <h2 class="section-title">${escapeHtml(t(locale, 'usersHeading'))} · ${users.length}</h2>
    <ul class="rows">${rows}</ul>
  </main>`;
	return htmlPage(t(locale, 'usersTitle'), body, chrome);
}

export function notFoundPage(chrome: Chrome): Response {
	const locale = chrome.locale;
	return htmlPage(
		t(locale, 'notFoundTitle'),
		`<main>
      <div class="panel-top" style="margin-top:24px">${chromeToggles(chrome)}</div>
      <p class="not-found">${escapeHtml(t(locale, 'notFound'))} <a href="/">${escapeHtml(t(locale, 'backToList'))}</a></p>
    </main>`,
		chrome,
		404,
	);
}

// The bar is injected into arbitrary archived HTML, so every rule is scoped to the bar
// and pinned with !important. Colors come from the theme tokens that the article theme
// override defines on <html>, so the bar follows light/dark like the rest of the site.
const ARTICLE_CHROME_STYLE = `
html body [data-archive-chrome] {
  position: sticky !important; top: 0 !important; z-index: 2147483647 !important;
  display: flex !important; align-items: center !important; gap: 12px !important;
  width: auto !important; max-width: none !important; min-height: 48px !important;
  margin: 0 !important; padding: 6px 10px 6px 16px !important;
  background: color-mix(in srgb, var(--bg) 88%, transparent) !important;
  -webkit-backdrop-filter: saturate(1.3) blur(12px) !important; backdrop-filter: saturate(1.3) blur(12px) !important;
  border: 0 !important; border-bottom: 1px solid var(--border) !important; border-radius: 0 !important; box-shadow: none !important;
  color: var(--fg) !important; text-align: left !important; letter-spacing: normal !important;
  font: 14px/1.4 ui-sans-serif, system-ui, -apple-system, "Segoe UI", "PingFang SC", "Noto Sans SC", sans-serif !important;
}
html body [data-archive-chrome] * { box-sizing: border-box !important; letter-spacing: normal !important; }
html body [data-archive-chrome] .icon { display: block !important; }
html body [data-archive-chrome] a.ac-back { flex: 0 0 auto !important; color: var(--fg) !important; text-decoration: none !important; font-weight: 600 !important; white-space: nowrap !important; }
html body [data-archive-chrome] a.ac-back:hover { color: var(--accent) !important; }
html body [data-archive-chrome] .ac-note { flex: 0 0 auto !important; color: var(--accent) !important; font-weight: 600 !important; font-size: 12px !important; white-space: nowrap !important; }
html body [data-archive-chrome] .ac-title { flex: 1 1 auto !important; min-width: 0 !important; overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important; color: var(--muted) !important; }
html body [data-archive-chrome] .ac-actions { display: flex !important; align-items: center !important; gap: 2px !important; flex: 0 0 auto !important; margin-left: auto !important; }
html body [data-archive-chrome] form { margin: 0 !important; padding: 0 !important; border: 0 !important; background: none !important; }
html body [data-archive-chrome] .icon-btn {
  appearance: none !important; display: inline-grid !important; place-items: center !important; width: 34px !important; height: 34px !important;
  margin: 0 !important; padding: 0 !important; border: 0 !important; border-radius: 8px !important; box-shadow: none !important;
  background: transparent !important; color: var(--muted) !important; cursor: pointer !important; list-style: none !important;
}
html body [data-archive-chrome] .icon-btn:hover { background: color-mix(in srgb, var(--accent) 10%, transparent) !important; color: var(--fg) !important; }
html body [data-archive-chrome] .icon-btn.star.on { color: #c8921a !important; }
html body [data-archive-chrome] .share-open.badge {
  appearance: none !important; margin: 0 4px 0 0 !important; padding: 3px 9px !important; border: 0 !important; border-radius: 999px !important;
  background: color-mix(in srgb, var(--accent) 14%, transparent) !important; color: var(--accent) !important;
  font-family: inherit !important; font-size: 12px !important; font-weight: 600 !important; line-height: 1.3 !important; cursor: pointer !important;
}
html body [data-archive-chrome] .menu > summary::-webkit-details-marker { display: none !important; }
html body [data-archive-chrome] .menu-panel {
  background: var(--card) !important; color: var(--fg) !important; border: 1px solid var(--border) !important;
  border-radius: 12px !important; padding: 6px !important; margin: 0 !important; font-size: 14px !important; line-height: 1.4 !important;
}
html body [data-archive-chrome] .menu-item,
html body [data-archive-chrome] .menu-panel > form > button,
html body [data-archive-chrome] .folder-picker > summary {
  appearance: none !important; display: flex !important; align-items: center !important; gap: 10px !important; width: 100% !important;
  min-height: 34px !important; margin: 0 !important; padding: 6px 10px !important; border: 0 !important; border-radius: 8px !important;
  background: transparent !important; color: var(--fg) !important; font: inherit !important; text-decoration: none !important; text-align: left !important;
  box-shadow: none !important; cursor: pointer !important;
}
html body [data-archive-chrome] .menu-item:hover,
html body [data-archive-chrome] .menu-panel > form > button:hover,
html body [data-archive-chrome] .folder-picker > summary:hover { background: color-mix(in srgb, var(--accent) 10%, var(--card)) !important; }
html body [data-archive-chrome] .menu-panel > form > button.danger { color: var(--danger) !important; }
html body [data-archive-chrome] .menu-panel hr { border: 0 !important; border-top: 1px solid var(--border) !important; margin: 4px 2px !important; height: 0 !important; background: none !important; }
html body [data-archive-chrome] .menu-row { color: var(--muted) !important; font-size: 13px !important; }
html body [data-archive-chrome] label.folder-picker-option { color: var(--fg) !important; background: transparent !important; font-size: 13px !important; }
html body [data-archive-chrome] .folder-picker-actions button {
  appearance: none !important; height: 30px !important; margin: 0 !important; padding: 0 12px !important; border-radius: 8px !important; border: 1px solid transparent !important;
  background: var(--accent) !important; color: var(--accent-fg) !important; font-family: inherit !important; font-size: 13px !important; font-weight: 550 !important; line-height: 1 !important; cursor: pointer !important;
}
html body [data-archive-chrome] .folder-picker-actions button.ghost { background: transparent !important; color: var(--fg) !important; border-color: var(--border) !important; }
html body [data-archive-chrome] :is(.lang-switch, .theme-switch) {
  display: inline-flex !important; gap: 2px !important; padding: 2px !important; border-radius: 8px !important;
  background: color-mix(in srgb, var(--border) 55%, transparent) !important; font-size: 12px !important;
}
html body [data-archive-chrome] :is(.lang-switch, .theme-switch) a { padding: 3px 9px !important; border-radius: 6px !important; color: var(--muted) !important; text-decoration: none !important; background: transparent !important; }
html body [data-archive-chrome] :is(.lang-switch, .theme-switch) a.active { background: var(--card) !important; color: var(--fg) !important; }
@media (max-width: 520px) {
  html body [data-archive-chrome] { gap: 8px !important; padding-left: 12px !important; }
  html body [data-archive-chrome] .ac-title { font-size: 13px !important; }
}
`;

function chromeStyleTag(): string {
	return `<style data-archive-chrome-style>${ARTICLE_CHROME_STYLE}</style>`;
}

function chromeSeg(aria: string, options: Array<{ href: string; label: string; active: boolean }>, className: string): string {
	return `<span class="${className}" role="group" aria-label="${escapeHtml(aria)}">${options
		.map((option) => `<a class="${option.active ? 'active' : ''}" href="${escapeHtml(option.href)}"${option.active ? ' aria-current="true"' : ''}>${escapeHtml(option.label)}</a>`)
		.join('')}</span>`;
}

/** Interface language and theme, offered inside the bar's menu rather than as always-visible toggles. */
function chromePrefs(chrome: Chrome, articlePath: string): string {
	const locale = chrome.locale;
	const lang = chromeSeg(
		t(locale, 'langToggle'),
		[
			{ href: langSetHref('zh', articlePath), label: t(locale, 'langZh'), active: locale === 'zh' },
			{ href: langSetHref('en', articlePath), label: t(locale, 'langEn'), active: locale === 'en' },
		],
		'lang-switch',
	);
	const theme = chromeSeg(
		t(locale, 'themeToggle'),
		[
			{ href: themeSetHref('light', articlePath), label: t(locale, 'themeLight'), active: chrome.theme === 'light' },
			{ href: themeSetHref('dark', articlePath), label: t(locale, 'themeDark'), active: chrome.theme === 'dark' },
		],
		'theme-switch',
	);
	return `<div class="menu-row"><span>${escapeHtml(t(locale, 'langToggle'))}</span>${lang}</div>
      <div class="menu-row"><span>${escapeHtml(t(locale, 'themeToggle'))}</span>${theme}</div>`;
}

function archiveBar(article: ArticleView, folders: FolderSummary[], chrome: Chrome, access: 'manage' | 'public'): string {
	const locale = chrome.locale;
	const shared = isArticleShared(article);
	const articlePath = `/a/${encodeURIComponent(article.slug)}`;
	const title = `<span class="ac-title">${escapeHtml(article.title)}</span>`;
	if (access === 'public') {
		return `<nav data-archive-chrome data-archive-share="public">
  <span class="ac-note">${escapeHtml(t(locale, 'sharePublicNote'))}</span>
  ${title}
  <span class="ac-actions">
    <details class="menu" data-menu>
      <summary class="icon-btn" aria-label="${escapeHtml(t(locale, 'displayMenu'))}" title="${escapeHtml(t(locale, 'displayMenu'))}">${icon('more', { size: 18 })}</summary>
      <div class="menu-panel">${chromePrefs(chrome, articlePath)}</div>
    </details>
  </span>
</nav>`;
	}

	const extra = `<a class="menu-item" href="${escapeHtml(`${articlePath}/download`)}">${escapeHtml(t(locale, 'downloadHtml'))}</a>
        <hr>
        ${chromePrefs(chrome, articlePath)}`;
	return `<nav data-archive-chrome data-archive-share="manage" data-article-shared="${shared ? '1' : '0'}" data-share-slug="${escapeHtml(article.slug)}" data-share-title="${escapeHtml(article.title)}">
  <a class="ac-back" href="/">${escapeHtml(t(locale, 'backArchive'))}</a>
  ${title}
  <span class="ac-actions">
    ${shared ? sharedBadge(article, locale) : ''}
    ${starForm(article, articlePath, locale)}
    ${articleMenu(article, folders, articlePath, locale, 'chrome', extra)}
  </span>
</nav>`;
}

/**
 * HTMLRewriter handlers fire only for tags that literally appear, so stored HTML without
 * <html>, <head> or <body> (a fragment, or the README's minimal sample) would lose the bar,
 * styles and scripts. Add whichever of the three is missing. Serve-time only; R2 is unchanged.
 */
export function ensureDocumentShell(html: string): string {
	let out = html;
	if (!/<html[\s>]/i.test(out)) {
		const doctype = /^\s*<!doctype[^>]*>/i.exec(out);
		const at = doctype ? doctype[0].length : 0;
		out = `${out.slice(0, at)}<html>${out.slice(at)}</html>`;
	}
	const htmlOpen = /<html\b[^>]*>/i.exec(out);
	const afterHtml = htmlOpen ? htmlOpen.index + htmlOpen[0].length : 0;
	if (!/<head[\s>]/i.test(out)) {
		out = `${out.slice(0, afterHtml)}<head></head>${out.slice(afterHtml)}`;
	}
	if (!/<body[\s>]/i.test(out)) {
		const headClose = /<\/head\s*>/i.exec(out);
		const start = headClose ? headClose.index + headClose[0].length : afterHtml;
		const htmlClose = out.toLowerCase().lastIndexOf('</html');
		const end = htmlClose >= start ? htmlClose : out.length;
		out = `${out.slice(0, start)}<body>${out.slice(start, end)}</body>${out.slice(end)}`;
	}
	return out;
}

export async function injectArchiveChrome(
	htmlResponse: Response,
	article: ArticleView,
	folders: FolderSummary[],
	chrome: Chrome,
	access: 'manage' | 'public' = 'manage',
): Promise<Response> {
	const lightbox = lightboxInjection(chrome.locale);
	const manage = access === 'manage';
	const articlePath = `/a/${encodeURIComponent(article.slug)}`;
	const switchMarkup = contentLangSwitch(chrome.locale, articlePath, chrome.contentLang);
	const sourceHtml = await htmlResponse.text();
	const { analysis, html: marked } = prepareArticleLanguage(sourceHtml);
	const prepared = ensureDocumentShell(insertSwitchIntoArticleHtml(marked, switchMarkup));
	const headers = new Headers(htmlResponse.headers);
	headers.set('content-security-policy', articlePagePolicy(inlineScriptHashes()));
	headers.set('x-frame-options', 'DENY');
	headers.set('referrer-policy', 'same-origin');
	return new HTMLRewriter()
		// Archived forms could otherwise POST to this origin with the reader's cookies
		// (form-action 'self' allows that). method="dialog" makes them inert; the archive's
		// own chrome forms are inserted below as raw HTML and never pass through these handlers.
		.on('form', {
			element(element) {
				element.setAttribute('method', 'dialog');
				element.removeAttribute('action');
				element.removeAttribute('target');
			},
		})
		// Off-site links leave in a new tab so the archived article stays open (the confirm
		// dialog adds a prompt when script runs). The chrome is inserted raw and is not matched here.
		.on('a[href]', {
			element(element) {
				if (isAbsoluteHttpHref(element.getAttribute('href'))) {
					element.setAttribute('target', '_blank');
					element.setAttribute('rel', 'noopener noreferrer');
				}
			},
		})
		.on('[formaction], [formmethod], [formtarget], [formenctype], [form]', {
			element(element) {
				for (const name of ['formaction', 'formmethod', 'formtarget', 'formenctype', 'form']) {
					element.removeAttribute(name);
				}
			},
		})
		.on('html', {
			element(element) {
				if (chrome.theme) {
					element.setAttribute('data-theme', chrome.theme);
				}
				if (chrome.contentLang) {
					element.setAttribute('data-content-lang', chrome.contentLang);
				}
				if (analysis.bilingual) {
					element.setAttribute('data-bilingual', '1');
				}
			},
		})
		.on('head', {
			element(element) {
				element.append('<meta name="viewport" content="width=device-width, initial-scale=1">', { html: true });
				element.append(menuStyleTag(), { html: true });
				if (manage) {
					element.append(folderPickerStyleTag(), { html: true });
					element.append(shareDialogStyleTag(), { html: true });
				}
				element.append(lightboxStyleTag(), { html: true });
				element.append(articleThemeOverrideStyleTag(), { html: true });
				element.append(contentLangStyleTag(), { html: true });
				element.append(chromeStyleTag(), { html: true });
				element.append(linkConfirmStyleTag(), { html: true });
				element.append(CONTENT_LANG_BOOTSTRAP, { html: true });
			},
		})
		.on('body', {
			element(element) {
				element.prepend(archiveBar(article, folders, chrome, access), { html: true });
				element.append(MENU_SCRIPT, { html: true });
				if (manage) {
					element.append(shareDialogInjection(chrome.locale), { html: true });
				}
				element.append(lightbox, { html: true });
				element.append(CONTENT_LANG_SCRIPT, { html: true });
				element.append(linkConfirmInjection(chrome.locale), { html: true });
				element.onEndTag((end) => {
					if (analysis.bilingual) {
						end.before(CONTENT_LANG_HINT, { html: true });
					}
				});
			},
		})
		.transform(new Response(prepared, { status: htmlResponse.status, headers }));
}
