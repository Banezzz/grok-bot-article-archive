// Dropdown menus built on <details>/<summary>: they open and close without any script.
// MENU_SCRIPT only adds polish (one menu at a time, outside click / Escape to close,
// folder checkboxes reset when a picker closes). Used by app pages and article chrome.

const ICON_PATHS = {
	star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
	more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
	search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
	chevron: '<path d="M6 9l6 6 6-6"/>',
	close: '<path d="M6 6l12 12M18 6L6 18"/>',
	back: '<path d="M15 5l-7 7 7 7"/>',
	up: '<path d="M6 15l6-6 6 6"/>',
	down: '<path d="M6 9l6 6 6-6"/>',
	link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
	folder: '<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
	external: '<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>',
	download: '<path d="M12 4v11"/><path d="M7 11l5 5 5-5"/><path d="M5 20h14"/>',
	globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 2.5 14.4 0 17M12 3.5c-2.5 2.6-2.5 14.4 0 17"/>',
} as const;

export type IconName = keyof typeof ICON_PATHS;

/** Decorative inline SVG icon; the surrounding control carries the accessible name. */
export function icon(name: IconName, options: { filled?: boolean; size?: number } = {}): string {
	const size = options.size ?? 16;
	const fill = options.filled ? 'currentColor' : 'none';
	return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICON_PATHS[name]}</svg>`;
}

export const MENU_STYLE = `
.icon { display: block; flex: 0 0 auto; }
.menu { position: relative; display: inline-block; }
.menu[open] { z-index: 30; }
.menu > summary { list-style: none; cursor: pointer; }
.menu > summary::-webkit-details-marker { display: none; }
.menu-panel {
  position: absolute; top: calc(100% + 6px); right: 0; z-index: 31;
  min-width: 220px; max-width: min(320px, calc(100vw - 24px));
  display: grid; gap: 2px; padding: 6px;
  background: var(--card); color: var(--fg);
  border: 1px solid var(--border); border-radius: 12px;
  box-shadow: 0 12px 32px color-mix(in srgb, var(--fg) 14%, transparent);
  font-size: 0.88rem; text-align: left;
}
.menu.align-left .menu-panel { left: 0; right: auto; }
.menu-panel form { margin: 0; }
.menu-panel hr { border: 0; border-top: 1px solid var(--border); margin: 4px 2px; }
.menu-head { padding: 6px 10px 8px; color: var(--muted); font-size: 0.8rem; }
.menu-head strong { display: block; color: var(--fg); font-size: 0.9rem; font-weight: 600; }
.menu-item, .menu-panel > form > button, .menu-panel .folder-picker > summary {
  display: flex; align-items: center; gap: 10px; width: 100%;
  height: auto; min-height: 34px; padding: 6px 10px; border: 0; border-radius: 8px; justify-content: flex-start;
  background: transparent; color: var(--fg); font: inherit; font-weight: 450;
  text-decoration: none; text-align: left; cursor: pointer; box-shadow: none;
}
.menu-item:hover, .menu-panel > form > button:hover, .menu-panel .folder-picker > summary:hover,
.menu-item[aria-current="true"] {
  background: color-mix(in srgb, var(--accent) 10%, var(--card)); color: var(--fg); box-shadow: none;
}
.menu-item[aria-current="true"] { font-weight: 600; }
.menu-item .count, .menu-panel .count { margin-left: auto; color: var(--muted); font-size: 0.78rem; font-variant-numeric: tabular-nums; }
.menu-item.danger, .menu-panel > form > button.danger { color: var(--danger); }
.menu-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 4px 10px; min-height: 36px; color: var(--muted); font-size: 0.82rem; }
.menu-section { display: grid; gap: 6px; padding: 6px 10px 8px; }
.menu-section label { margin: 0; }
.menu-section .inline { display: flex; gap: 6px; }
.menu-section .inline input, .menu-section select { margin: 0; min-width: 0; }
.menu-section .stack { display: grid; gap: 6px; }
.menu-section .stack button { justify-self: end; }
.menu-empty { padding: 8px 10px; color: var(--muted); }
`;

export const MENU_SCRIPT = `<script data-archive-menu-script>
(function () {
  if (window.__archiveMenus) {
    return;
  }
  window.__archiveMenus = true;
  var SELECTOR = 'details[data-menu], details[data-folder-picker]';

  function all() {
    return Array.prototype.slice.call(document.querySelectorAll(SELECTOR));
  }

  function close(menu) {
    menu.removeAttribute('open');
  }

  function resetPicker(menu) {
    if (!menu.matches('[data-folder-picker]')) {
      return;
    }
    menu.querySelectorAll('input[type="checkbox"][name="folder_id"]').forEach(function (box) {
      box.checked = box.defaultChecked;
    });
  }

  document.addEventListener('toggle', function (event) {
    var menu = event.target;
    if (!menu || !menu.matches || !menu.matches(SELECTOR)) {
      return;
    }
    if (menu.open) {
      all().forEach(function (other) {
        if (other.open && other !== menu && !other.contains(menu)) {
          close(other);
        }
      });
      return;
    }
    resetPicker(menu);
    menu.querySelectorAll(SELECTOR).forEach(close);
  }, true);

  document.addEventListener('click', function (event) {
    var target = event.target;
    if (!target || !target.closest) {
      return;
    }
    var cancel = target.closest('[data-folder-cancel]');
    if (cancel) {
      var picker = cancel.closest('[data-folder-picker]');
      if (picker) {
        close(picker);
      }
      return;
    }
    var opensDialog = Boolean(target.closest('[data-share-open]'));
    all().forEach(function (menu) {
      if (menu.open && (opensDialog || !menu.contains(target))) {
        close(menu);
      }
    });
  });

  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') {
      return;
    }
    var open = all().filter(function (menu) { return menu.open; });
    var innermost = open[open.length - 1];
    if (!innermost) {
      return;
    }
    close(innermost);
    var summary = innermost.querySelector('summary');
    if (summary) {
      summary.focus();
    }
  });
})();
</script>`;

export function menuStyleTag(): string {
	return `<style data-archive-menu>${MENU_STYLE}</style>`;
}
