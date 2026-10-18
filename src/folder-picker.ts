import type { FolderSummary } from './folders';
import { t, type Locale } from './i18n';
import { icon } from './menu';
import { escapeHtml } from './util';

export type FolderPickerArticle = {
	slug: string;
	folders: Array<{ id: string }>;
};

export type FolderPickerVariant = 'page' | 'chrome';

// The picker lives inside an article's "more" menu and expands in place, so it needs
// no positioning of its own. Colors come from the theme tokens on both app pages and
// article pages (the article theme override defines the same tokens).
export const FOLDER_PICKER_STYLE = `
.folder-picker { display: block; }
.folder-picker > summary { list-style: none; }
.folder-picker > summary::-webkit-details-marker { display: none; }
.folder-picker > summary .count { margin-left: auto; }
.folder-picker-menu { display: grid; gap: 6px; margin: 2px 0 4px; padding: 6px 4px 2px 8px; border-left: 2px solid var(--border); }
.folder-picker-list { display: grid; gap: 1px; max-height: 14rem; overflow: auto; }
label.folder-picker-option {
  display: flex; gap: 8px; align-items: center; margin: 0; padding: 5px 8px; border-radius: 7px;
  color: var(--fg); font-size: 0.86rem; font-weight: 450; cursor: pointer;
}
label.folder-picker-option:hover { background: color-mix(in srgb, var(--accent) 10%, var(--card)); }
.folder-picker-option input[type=checkbox] { width: auto; margin: 0; accent-color: var(--accent); flex: 0 0 auto; }
.folder-picker-actions { display: flex; gap: 6px; justify-content: flex-end; padding: 2px 4px 4px; }
.folder-picker-actions button { min-height: 30px; padding: 4px 12px; font-size: 0.82rem; }
`;

export function folderPickerMarkup(
	article: FolderPickerArticle,
	folders: FolderSummary[],
	nextPath: string,
	locale: Locale,
	variant: FolderPickerVariant = 'page',
): string {
	const memberIds = new Set(article.folders.map((folder) => folder.id));
	const options = folders
		.map((folder) => {
			const checked = memberIds.has(folder.id);
			return `<label class="folder-picker-option"><input type="checkbox" name="folder_id" value="${escapeHtml(folder.id)}"${checked ? ' checked' : ''}><span>${escapeHtml(folder.name)}</span></label>`;
		})
		.join('');
	return `<details class="folder-picker" data-folder-picker data-folder-picker-variant="${variant}">
    <summary class="folder-picker-toggle" aria-label="${escapeHtml(t(locale, 'addToFoldersCount', { n: memberIds.size }))}">${icon('folder')}<span>${escapeHtml(t(locale, 'addToFolders'))}</span><span class="count">${memberIds.size}</span></summary>
    <form class="folder-picker-menu" method="post" action="/folders/membership">
      <input type="hidden" name="slug" value="${escapeHtml(article.slug)}">
      <input type="hidden" name="next" value="${escapeHtml(nextPath)}">
      <div class="folder-picker-list" role="group" aria-label="${escapeHtml(t(locale, 'folderPickerAria'))}">${options}</div>
      <div class="folder-picker-actions">
        <button type="button" class="ghost" data-folder-cancel>${escapeHtml(t(locale, 'cancel'))}</button>
        <button type="submit">${escapeHtml(t(locale, 'applyFolders'))}</button>
      </div>
    </form>
  </details>`;
}

export function folderPickerStyleTag(): string {
	return `<style data-archive-folder-picker>${FOLDER_PICKER_STYLE}</style>`;
}
