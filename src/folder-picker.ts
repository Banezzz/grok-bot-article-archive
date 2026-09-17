import type { FolderSummary } from './folders';
import { t, type Locale } from './i18n';
import { escapeHtml } from './util';

export type FolderPickerArticle = {
	slug: string;
	folders: Array<{ id: string }>;
};

export type FolderPickerVariant = 'page' | 'chrome';

const CHROME_FG = '#f4f1ea';
const CHROME_BG = '#221e1a';
const CHROME_BORDER = 'rgba(255,255,255,.22)';
const CHROME_ACCENT = '#9fe0c4';
const CHROME_ACCENT_FG = '#12211b';
const PAGE_FG = '#1a1814';
const PAGE_BG = '#fffdf8';
const PAGE_BORDER = '#e4ddd0';
const PAGE_ACCENT = '#0c6a52';
const PAGE_ACCENT_FG = '#fff';
const PAGE_DARK_FG = '#f4efe6';
const PAGE_DARK_BG = '#1d1a16';
const PAGE_DARK_BORDER = '#3b342c';
const PAGE_DARK_ACCENT = '#86d4b0';
const PAGE_DARK_ACCENT_FG = '#10211a';

export const FOLDER_PICKER_STYLE = `
.folder-picker { position: relative; display: inline-block; font-size: 0.85rem; z-index: 3; color: var(--fg, ${PAGE_FG}); }
.folder-picker[open] { z-index: 8; }
.folder-picker-toggle {
  list-style: none;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  appearance: none;
  border: 1px solid var(--border, ${PAGE_BORDER});
  background: var(--card, ${PAGE_BG});
  color: var(--fg, ${PAGE_FG});
  border-radius: 9px;
  padding: 8px 13px;
  font: inherit;
  font-size: 0.85rem;
  font-weight: 500;
  line-height: 1.25;
}
.folder-picker-toggle::-webkit-details-marker { display: none; }
.folder-picker-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 9;
  display: grid;
  gap: 8px;
  margin: 0;
  min-width: 220px;
  max-width: min(320px, 86vw);
  padding: 10px;
  border: 1px solid var(--border, ${PAGE_BORDER});
  border-radius: 10px;
  background: var(--card, ${PAGE_BG});
  color: var(--fg, ${PAGE_FG});
  box-shadow: var(--shadow, 0 10px 28px rgba(26,24,20,.08));
}
.folder-picker-list {
  display: grid;
  gap: 4px;
  margin: 0;
  padding: 0;
  border: 0;
  min-width: 0;
  max-height: 16rem;
  overflow: auto;
}
label.folder-picker-option {
  display: flex;
  gap: 8px;
  align-items: center;
  margin: 0;
  padding: 6px 8px;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--fg, ${PAGE_FG});
  background: var(--card, ${PAGE_BG});
  cursor: pointer;
}
label.folder-picker-option:hover { background: color-mix(in srgb, var(--accent, ${PAGE_ACCENT}) 12%, var(--card, ${PAGE_BG})); }
.folder-picker-option input[type=checkbox] { width: auto; margin: 0; accent-color: var(--accent, ${PAGE_ACCENT}); flex: 0 0 auto; }
.folder-picker-option span { color: var(--fg, ${PAGE_FG}); background: transparent; }
.folder-picker-actions { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; }
.folder-picker-actions button[type=submit] { background: var(--accent, ${PAGE_ACCENT}); color: var(--accent-fg, ${PAGE_ACCENT_FG}); }
@media (prefers-color-scheme: dark) {
  html:not([data-theme="light"]) .folder-picker,
  html:not([data-theme="light"]) .folder-picker-toggle,
  html:not([data-theme="light"]) .folder-picker-menu,
  html:not([data-theme="light"]) label.folder-picker-option,
  html:not([data-theme="light"]) .folder-picker-option span {
    color: var(--fg, ${PAGE_DARK_FG});
  }
  html:not([data-theme="light"]) .folder-picker-toggle,
  html:not([data-theme="light"]) .folder-picker-menu,
  html:not([data-theme="light"]) label.folder-picker-option {
    background: var(--card, ${PAGE_DARK_BG});
    border-color: var(--border, ${PAGE_DARK_BORDER});
  }
  html:not([data-theme="light"]) .folder-picker-actions button[type=submit] {
    background: var(--accent, ${PAGE_DARK_ACCENT});
    color: var(--accent-fg, ${PAGE_DARK_ACCENT_FG});
  }
}
html[data-theme="dark"] .folder-picker,
html[data-theme="dark"] .folder-picker-toggle,
html[data-theme="dark"] .folder-picker-menu,
html[data-theme="dark"] label.folder-picker-option,
html[data-theme="dark"] .folder-picker-option span { color: var(--fg, ${PAGE_DARK_FG}); }
html[data-theme="dark"] .folder-picker-toggle,
html[data-theme="dark"] .folder-picker-menu,
html[data-theme="dark"] label.folder-picker-option {
  background: var(--card, ${PAGE_DARK_BG});
  border-color: var(--border, ${PAGE_DARK_BORDER});
}
html[data-theme="dark"] .folder-picker-actions button[type=submit] {
  background: var(--accent, ${PAGE_DARK_ACCENT});
  color: var(--accent-fg, ${PAGE_DARK_ACCENT_FG});
}
html[data-theme="light"] .folder-picker,
html[data-theme="light"] .folder-picker-toggle,
html[data-theme="light"] .folder-picker-menu,
html[data-theme="light"] label.folder-picker-option,
html[data-theme="light"] .folder-picker-option span { color: var(--fg, ${PAGE_FG}); }
html[data-theme="light"] .folder-picker-toggle,
html[data-theme="light"] .folder-picker-menu,
html[data-theme="light"] label.folder-picker-option {
  background: var(--card, ${PAGE_BG});
  border-color: var(--border, ${PAGE_BORDER});
}
[data-archive-chrome] .folder-picker { color: ${CHROME_FG} !important; }
[data-archive-chrome] .folder-picker-toggle {
  padding: 6px 10px !important;
  border: 1px solid ${CHROME_BORDER} !important;
  background: ${CHROME_BG} !important;
  color: ${CHROME_FG} !important;
  border-radius: 8px !important;
  font: 13px/1.4 ui-sans-serif, system-ui, -apple-system, sans-serif !important;
}
[data-archive-chrome] .folder-picker-menu {
  border: 1px solid ${CHROME_BORDER} !important;
  background: ${CHROME_BG} !important;
  color: ${CHROME_FG} !important;
  box-shadow: 0 12px 28px rgba(0,0,0,.45) !important;
}
[data-archive-chrome] label.folder-picker-option {
  color: ${CHROME_FG} !important;
  background: ${CHROME_BG} !important;
  margin: 0 !important;
}
[data-archive-chrome] label.folder-picker-option:hover { background: #2c2722 !important; }
[data-archive-chrome] .folder-picker-option span { color: ${CHROME_FG} !important; background: transparent !important; }
[data-archive-chrome] .folder-picker-option input[type=checkbox] { accent-color: ${CHROME_ACCENT}; }
[data-archive-chrome] .folder-picker-actions button[type=submit] {
  appearance: none; border: 0; background: ${CHROME_ACCENT} !important; color: ${CHROME_ACCENT_FG} !important;
  border-radius: 8px; padding: 6px 10px; font: inherit; cursor: pointer;
}
[data-archive-chrome] .folder-picker-actions button[data-folder-cancel] {
  appearance: none; border: 1px solid ${CHROME_BORDER} !important; background: ${CHROME_BG} !important; color: ${CHROME_FG} !important;
  border-radius: 8px; padding: 6px 10px; font: inherit; cursor: pointer;
}
`;

export const FOLDER_PICKER_SCRIPT = `<script data-archive-folder-picker-script>
(function () {
  if (window.__archiveFolderPicker) {
    return;
  }
  window.__archiveFolderPicker = true;

  function resetPicker(picker) {
    picker.querySelectorAll('input[type="checkbox"][name="folder_id"]').forEach(function (box) {
      box.checked = box.defaultChecked;
    });
  }

  function closePicker(picker) {
    picker.removeAttribute('open');
  }

  document.addEventListener('toggle', function (event) {
    var picker = event.target;
    if (!picker || !picker.matches || !picker.matches('[data-folder-picker]')) {
      return;
    }
    if (picker.open) {
      document.querySelectorAll('[data-folder-picker][open]').forEach(function (other) {
        if (other !== picker) {
          closePicker(other);
        }
      });
      return;
    }
    resetPicker(picker);
  }, true);

  document.addEventListener('click', function (event) {
    var target = event.target;
    if (!target || !target.closest) {
      return;
    }
    var cancel = target.closest('[data-folder-cancel]');
    if (cancel) {
      var fromCancel = cancel.closest('[data-folder-picker]');
      if (fromCancel) {
        closePicker(fromCancel);
      }
      return;
    }
    document.querySelectorAll('[data-folder-picker][open]').forEach(function (picker) {
      if (!picker.contains(target)) {
        closePicker(picker);
      }
    });
  });

  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') {
      return;
    }
    document.querySelectorAll('[data-folder-picker][open]').forEach(closePicker);
  });
})();
</script>`;

function chromeAttr(style: string, variant: FolderPickerVariant): string {
	return variant === 'chrome' ? ` style="${style}"` : '';
}

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
			return `<label class="folder-picker-option"${chromeAttr(`color:${CHROME_FG};background:${CHROME_BG}`, variant)}><input type="checkbox" name="folder_id" value="${escapeHtml(folder.id)}"${checked ? ' checked' : ''}><span${chromeAttr(`color:${CHROME_FG};background:transparent`, variant)}>${escapeHtml(folder.name)}</span></label>`;
		})
		.join('');
	return `<details class="folder-picker" data-folder-picker data-folder-picker-variant="${variant}">
    <summary class="folder-picker-toggle" aria-haspopup="true"${chromeAttr(`color:${CHROME_FG};background:${CHROME_BG};border:1px solid ${CHROME_BORDER}`, variant)}>${escapeHtml(t(locale, 'addToFoldersCount', { n: memberIds.size }))}</summary>
    <form class="folder-picker-menu" method="post" action="/folders/membership"${chromeAttr(`color:${CHROME_FG};background:${CHROME_BG};border:1px solid ${CHROME_BORDER}`, variant)}>
      <input type="hidden" name="slug" value="${escapeHtml(article.slug)}">
      <input type="hidden" name="next" value="${escapeHtml(nextPath)}">
      <div class="folder-picker-list" role="group" aria-label="${escapeHtml(t(locale, 'folderPickerAria'))}">${options}</div>
      <div class="folder-picker-actions">
        <button type="button" class="ghost" data-folder-cancel${chromeAttr(`color:${CHROME_FG};background:${CHROME_BG};border:1px solid ${CHROME_BORDER}`, variant)}>${escapeHtml(t(locale, 'cancel'))}</button>
        <button type="submit"${chromeAttr(`color:${CHROME_ACCENT_FG};background:${CHROME_ACCENT};border:0`, variant)}>${escapeHtml(t(locale, 'applyFolders'))}</button>
      </div>
    </form>
  </details>`;
}

export function folderPickerStyleTag(): string {
	return `<style data-archive-folder-picker>${FOLDER_PICKER_STYLE}</style>`;
}
