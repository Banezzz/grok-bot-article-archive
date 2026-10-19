import { t, type Locale } from './i18n';
import { escapeHtml } from './util';

// Confirm before leaving the archive. Every click on a link to another origin opens
// this dialog with the full URL; only "Confirm" opens it, always in a new tab, so the
// archived article stays open. Injected on app pages and on /a/:slug (inside arbitrary
// archived HTML, hence the ID-scoped rules pinned with !important).

export const LINK_CONFIRM_STYLE = `
#archive-link-dialog {
  width: min(100vw, 100%) !important; max-width: 100vw !important; height: 100% !important; max-height: 100vh !important;
  margin: 0 !important; padding: 0 !important; border: 0 !important; background: transparent !important; color: inherit !important;
}
#archive-link-dialog::backdrop { background: transparent; }
#archive-link-dialog .archive-link-backdrop {
  position: fixed !important; inset: 0 !important; display: grid !important; place-items: center !important; padding: 16px !important;
  background: color-mix(in srgb, var(--fg, CanvasText) 40%, transparent) !important;
}
#archive-link-dialog .archive-link-sheet {
  box-sizing: border-box !important; width: min(440px, 100%) !important; margin: 0 !important; padding: 22px !important;
  background: var(--card, Canvas) !important; color: var(--fg, CanvasText) !important;
  border: 1px solid var(--border, GrayText) !important; border-radius: 16px !important;
  box-shadow: 0 18px 48px color-mix(in srgb, var(--fg, CanvasText) 22%, transparent) !important;
  font: 400 15px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", "PingFang SC", "Noto Sans SC", sans-serif !important;
  text-align: left !important; letter-spacing: normal !important;
}
#archive-link-dialog h2 { margin: 0 0 6px !important; padding: 0 !important; font-family: inherit !important; font-size: 17px !important; font-weight: 650 !important; line-height: 1.35 !important; color: var(--fg, CanvasText) !important; border: 0 !important; }
#archive-link-dialog p { margin: 0 0 10px !important; padding: 0 !important; color: var(--muted, GrayText) !important; font-size: 14px !important; }
#archive-link-dialog .archive-link-host { color: var(--fg, CanvasText) !important; font-weight: 650 !important; }
#archive-link-dialog .archive-link-url {
  display: block !important; max-height: 7.5em !important; overflow: auto !important; margin: 0 0 18px !important; padding: 10px 12px !important;
  border-radius: 10px !important; border: 1px solid var(--border, GrayText) !important; background: var(--bg, Canvas) !important;
  color: var(--fg, CanvasText) !important; font: 400 13px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace !important;
  word-break: break-all !important; overflow-wrap: anywhere !important; white-space: normal !important;
}
#archive-link-dialog .archive-link-actions { display: flex !important; justify-content: flex-end !important; gap: 8px !important; margin: 0 !important; }
#archive-link-dialog button {
  appearance: none !important; box-sizing: border-box !important; height: 38px !important; min-width: 84px !important; margin: 0 !important;
  padding: 0 16px !important; border-radius: 10px !important; border: 1px solid transparent !important; box-shadow: none !important;
  font: 550 14px/1 ui-sans-serif, system-ui, -apple-system, "Segoe UI", "PingFang SC", "Noto Sans SC", sans-serif !important; cursor: pointer !important;
}
#archive-link-dialog button[data-link-confirm] { background: var(--accent, Highlight) !important; color: var(--accent-fg, HighlightText) !important; }
#archive-link-dialog button[data-link-cancel] { background: transparent !important; color: var(--fg, CanvasText) !important; border-color: var(--border, GrayText) !important; }
#archive-link-dialog button:focus-visible { outline: 2px solid var(--accent, Highlight) !important; outline-offset: 2px !important; }
`;

export function linkConfirmMarkup(locale: Locale): string {
	return `<dialog id="archive-link-dialog" aria-modal="true" aria-labelledby="archive-link-title" aria-describedby="archive-link-lead">
  <div class="archive-link-backdrop" data-link-dismiss>
    <div class="archive-link-sheet" role="document">
      <h2 id="archive-link-title">${escapeHtml(t(locale, 'linkConfirmTitle'))}</h2>
      <p id="archive-link-lead">${escapeHtml(t(locale, 'linkConfirmLead'))} <span class="archive-link-host" data-link-host></span></p>
      <code class="archive-link-url" data-link-url></code>
      <div class="archive-link-actions">
        <button type="button" data-link-cancel>${escapeHtml(t(locale, 'cancel'))}</button>
        <button type="button" data-link-confirm>${escapeHtml(t(locale, 'confirm'))}</button>
      </div>
    </div>
  </div>
</dialog>`;
}

export const LINK_CONFIRM_SCRIPT = `<script data-archive-link-confirm-script>
(function () {
  if (window.__archiveLinkConfirm) {
    return;
  }
  window.__archiveLinkConfirm = true;
  var dialog = document.getElementById('archive-link-dialog');
  if (!dialog) {
    return;
  }
  var urlField = dialog.querySelector('[data-link-url]');
  var hostField = dialog.querySelector('[data-link-host]');
  var confirmBtn = dialog.querySelector('[data-link-confirm]');
  var cancelBtn = dialog.querySelector('[data-link-cancel]');
  var pending = '';
  var lastFocus = null;

  function externalUrl(anchor) {
    if (anchor.hasAttribute('download')) {
      return null;
    }
    var raw = anchor.getAttribute('href');
    if (!raw) {
      return null;
    }
    var url;
    try {
      url = new URL(raw, location.href);
    } catch (err) {
      return null;
    }
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.origin === location.origin) {
      return null;
    }
    return url;
  }

  function open(url) {
    lastFocus = document.activeElement;
    pending = url.href;
    urlField.textContent = url.href;
    hostField.textContent = url.host;
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else {
      dialog.setAttribute('open', '');
    }
    confirmBtn.focus();
  }

  function close() {
    if (typeof dialog.close === 'function' && dialog.open) {
      dialog.close();
    } else {
      dialog.removeAttribute('open');
    }
    pending = '';
    if (lastFocus && typeof lastFocus.focus === 'function') {
      lastFocus.focus();
    }
    lastFocus = null;
  }

  // Bubble phase, after the lightbox (which claims clicks on images in capture phase).
  document.addEventListener('click', function (event) {
    if (event.defaultPrevented || event.button !== 0) {
      return;
    }
    var target = event.target;
    if (!target || !target.closest || target.closest('#archive-link-dialog')) {
      return;
    }
    var anchor = target.closest('a[href]');
    if (!anchor) {
      return;
    }
    var url = externalUrl(anchor);
    if (!url) {
      return;
    }
    event.preventDefault();
    open(url);
  });

  dialog.addEventListener('click', function (event) {
    var target = event.target;
    if (!target || !target.closest) {
      return;
    }
    if (target.closest('[data-link-confirm]')) {
      var href = pending;
      close();
      if (href) {
        window.open(href, '_blank', 'noopener,noreferrer');
      }
      return;
    }
    if (target.closest('[data-link-cancel]') || target.hasAttribute('data-link-dismiss')) {
      close();
    }
  });

  dialog.addEventListener('cancel', function (event) {
    event.preventDefault();
    close();
  });

  dialog.addEventListener('keydown', function (event) {
    if (event.key !== 'Tab') {
      return;
    }
    var first = cancelBtn;
    var last = confirmBtn;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
})();
</script>`;

export function linkConfirmStyleTag(): string {
	return `<style data-archive-link-confirm>${LINK_CONFIRM_STYLE}</style>`;
}

export function linkConfirmInjection(locale: Locale): string {
	return `${linkConfirmMarkup(locale)}${LINK_CONFIRM_SCRIPT}`;
}

/** Absolute http(s) links in archived HTML open in a new tab even without script. */
export function isAbsoluteHttpHref(href: string | null): boolean {
	return Boolean(href && /^(?:https?:)?\/\//i.test(href.trim()));
}
