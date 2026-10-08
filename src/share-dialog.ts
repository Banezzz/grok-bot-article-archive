import { t, type Locale } from './i18n';
import { escapeHtml } from './util';

// Runtime CSS/JS for the public-share dialog. Injected by page chrome / HTMLRewriter.
// Do not write this markup into stored article HTML in R2.

export const SHARE_DIALOG_STYLE = `
.archive-share-dialog {
  width: min(100vw, 100%);
  max-width: 100vw;
  height: 100%;
  max-height: 100vh;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
}
.archive-share-dialog::backdrop { background: transparent; }
.archive-share-backdrop {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 0;
  overflow-x: hidden;
  background: color-mix(in srgb, var(--fg, CanvasText) 42%, transparent);
  color: var(--fg, CanvasText);
}
.archive-share-sheet {
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  margin: 0;
  padding: 20px 16px calc(20px + env(safe-area-inset-bottom, 0px));
  overflow-x: hidden;
  background: var(--card, Canvas);
  color: var(--fg, CanvasText);
  border: 1px solid var(--border, GrayText);
  border-bottom: 0;
  border-radius: 16px 16px 0 0;
  box-shadow: var(--shadow, 0 16px 40px color-mix(in srgb, var(--fg, CanvasText) 18%, transparent));
}
.archive-share-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin: 0 0 8px;
}
.archive-share-sheet h2 {
  margin: 0;
  font: 650 1.15rem/1.3 ui-sans-serif, system-ui, -apple-system, "Segoe UI", "PingFang SC", "Noto Sans SC", sans-serif;
  letter-spacing: -0.02em;
  color: var(--fg, CanvasText);
}
.archive-share-lead {
  margin: 0 0 14px;
  color: var(--muted, GrayText);
  font: 400 0.92rem/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", "PingFang SC", "Noto Sans SC", sans-serif;
}
.archive-share-sheet label {
  display: block;
  margin: 0 0 6px;
  color: var(--muted, GrayText);
  font: 550 0.82rem/1.3 ui-sans-serif, system-ui, -apple-system, "Segoe UI", "PingFang SC", "Noto Sans SC", sans-serif;
}
.archive-share-url {
  display: block;
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  margin: 0 0 14px;
  padding: 10px 12px;
  resize: none;
  overflow-x: auto;
  overflow-y: hidden;
  overflow-wrap: anywhere;
  word-break: break-all;
  white-space: pre-wrap;
  font: 400 0.85rem/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color: var(--fg, CanvasText);
  background: var(--bg, Canvas);
  border: 1px solid var(--border, GrayText);
  border-radius: 10px;
}
.archive-share-url:focus {
  outline: none;
  border-color: var(--accent, Highlight);
  box-shadow: 0 0 0 3px var(--ring, color-mix(in srgb, var(--accent, Highlight) 28%, transparent));
}
.archive-share-actions {
  display: grid;
  gap: 8px;
  margin: 0 0 12px;
}
.archive-share-unshare { margin: 0; }
.archive-share-sheet button {
  appearance: none;
  box-sizing: border-box;
  width: 100%;
  min-height: 44px;
  margin: 0;
  padding: 10px 14px;
  border: 0;
  border-radius: 10px;
  font: 550 15px/1.25 ui-sans-serif, system-ui, -apple-system, "Segoe UI", "PingFang SC", "Noto Sans SC", sans-serif;
  cursor: pointer;
}
.archive-share-copy {
  background: var(--accent, Highlight);
  color: var(--accent-fg, HighlightText);
}
.archive-share-copy:hover { box-shadow: 0 0 0 3px var(--ring, color-mix(in srgb, var(--accent, Highlight) 28%, transparent)); }
.archive-share-sheet button.ghost,
.archive-share-close {
  background: var(--card, Canvas);
  color: var(--fg, CanvasText);
  border: 1px solid var(--border, GrayText);
  font-weight: 500;
}
.archive-share-sheet button.ghost:hover,
.archive-share-close:hover {
  background: color-mix(in srgb, var(--accent, Highlight) 10%, var(--card, Canvas));
  border-color: color-mix(in srgb, var(--accent, Highlight) 35%, var(--border, GrayText));
}
.archive-share-close { width: auto; min-width: 44px; min-height: 40px; padding: 8px 12px; flex: 0 0 auto; }
.archive-share-sheet button.danger {
  background: transparent;
  color: var(--danger, maroon);
  border: 1px solid color-mix(in srgb, var(--danger, maroon) 40%, var(--border, GrayText));
}
.archive-share-sheet button.danger:hover {
  background: color-mix(in srgb, var(--danger, maroon) 10%, var(--card, Canvas));
}
.archive-share-sheet button:focus-visible {
  outline: 2px solid var(--accent, Highlight);
  outline-offset: 2px;
}
.archive-share-live {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.share-open.badge {
  appearance: none;
  font: inherit;
  cursor: pointer;
  background: color-mix(in srgb, var(--accent) 12%, var(--card));
  border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
  color: inherit;
}
@media (min-width: 640px) {
  .archive-share-backdrop {
    align-items: center;
    padding: 24px;
  }
  .archive-share-sheet {
    width: min(440px, 100%);
    border-radius: 18px;
    border-bottom: 1px solid var(--border, GrayText);
    padding: 24px;
  }
  .archive-share-actions { grid-template-columns: 1fr; }
  .archive-share-sheet button { min-height: 42px; }
}
`;

export function shareDialogMarkup(locale: Locale): string {
	return `<dialog id="archive-share-dialog" class="archive-share-dialog" aria-modal="true" aria-labelledby="archive-share-title" data-copy-label="${escapeHtml(t(locale, 'copyLink'))}" data-copied-label="${escapeHtml(t(locale, 'copied'))}" data-copy-failed="${escapeHtml(t(locale, 'copyFailed'))}">
  <div class="archive-share-backdrop" data-share-dismiss>
    <div class="archive-share-sheet" role="document">
      <div class="archive-share-head">
        <h2 id="archive-share-title">${escapeHtml(t(locale, 'shareDialogTitle'))}</h2>
        <button type="button" class="archive-share-close ghost" data-share-close>${escapeHtml(t(locale, 'lightboxClose'))}</button>
      </div>
      <p class="archive-share-lead">${escapeHtml(t(locale, 'sharingOn'))}</p>
      <label for="archive-share-url">${escapeHtml(t(locale, 'shareUrlLabel'))}</label>
      <textarea id="archive-share-url" class="archive-share-url" readonly rows="2"></textarea>
      <div class="archive-share-actions">
        <button type="button" class="archive-share-copy" data-share-copy>${escapeHtml(t(locale, 'copyLink'))}</button>
        <button type="button" class="archive-share-native ghost" data-share-native hidden>${escapeHtml(t(locale, 'shareNative'))}</button>
      </div>
      <form class="archive-share-unshare" method="post" action="/share" data-share-unshare>
        <input type="hidden" name="slug" value="">
        <input type="hidden" name="next" value="">
        <input type="hidden" name="shared" value="0">
        <button type="submit" class="danger">${escapeHtml(t(locale, 'unshare'))}</button>
      </form>
      <div class="archive-share-live" aria-live="polite"></div>
    </div>
  </div>
</dialog>`;
}

export const SHARE_DIALOG_SCRIPT = `<script>
(function () {
  var dialog = document.getElementById('archive-share-dialog');
  if (!dialog || dialog.dataset.bound === '1') {
    return;
  }
  dialog.dataset.bound = '1';
  var urlField = dialog.querySelector('#archive-share-url');
  var copyBtn = dialog.querySelector('.archive-share-copy');
  var nativeBtn = dialog.querySelector('[data-share-native]');
  var closeBtn = dialog.querySelector('[data-share-close]');
  var unshareForm = dialog.querySelector('[data-share-unshare]');
  var live = dialog.querySelector('.archive-share-live');
  var lastFocus = null;
  var currentSlug = '';
  var currentTitle = '';
  var copiedTimer = 0;

  function copyLabel() { return dialog.getAttribute('data-copy-label') || 'Copy link'; }
  function copiedLabel() { return dialog.getAttribute('data-copied-label') || 'Copied'; }
  function failedLabel() { return dialog.getAttribute('data-copy-failed') || 'Copy failed'; }

  function shareUrl(slug) {
    return new URL('/a/' + encodeURIComponent(slug), location.origin).href;
  }

  function announce(text) {
    if (live) {
      live.textContent = text;
    }
  }

  function markCopied(button) {
    if (!button) {
      return;
    }
    if (!button.getAttribute('data-label')) {
      button.setAttribute('data-label', button.textContent || copyLabel());
    }
    button.textContent = copiedLabel();
    announce(copiedLabel());
    window.clearTimeout(copiedTimer);
    copiedTimer = window.setTimeout(function () {
      button.textContent = button.getAttribute('data-label') || copyLabel();
    }, 2000);
  }

  function fallbackCopy(text) {
    var field = urlField;
    if (field) {
      field.value = text;
      field.focus();
      field.select();
      try {
        field.setSelectionRange(0, text.length);
      } catch (err) {}
      try {
        if (document.execCommand('copy')) {
          return true;
        }
      } catch (err) {}
    }
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.setAttribute('aria-hidden', 'true');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    var ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (err) {}
    document.body.removeChild(ta);
    return ok;
  }

  function copyText(text) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      return navigator.clipboard.writeText(text).then(function () {
        return true;
      }).catch(function () {
        return fallbackCopy(text);
      });
    }
    return Promise.resolve(fallbackCopy(text));
  }

  function focusables() {
    return [closeBtn, urlField, copyBtn, nativeBtn && !nativeBtn.hidden ? nativeBtn : null, unshareForm ? unshareForm.querySelector('button') : null].filter(function (node) {
      return node && !node.hidden;
    });
  }

  function currentNext() {
    var params = new URLSearchParams(location.search);
    params.delete('share');
    params.delete('slug');
    var query = params.toString();
    return location.pathname + (query ? '?' + query : '') + location.hash;
  }

  function fill(slug, title) {
    currentSlug = slug;
    currentTitle = title || '';
    var url = shareUrl(slug);
    if (urlField) {
      urlField.value = url;
    }
    if (unshareForm) {
      var slugInput = unshareForm.querySelector('input[name="slug"]');
      var nextInput = unshareForm.querySelector('input[name="next"]');
      if (slugInput) {
        slugInput.value = slug;
      }
      if (nextInput) {
        nextInput.value = currentNext();
      }
    }
    if (nativeBtn) {
      nativeBtn.hidden = !(navigator.share && typeof navigator.share === 'function');
    }
    if (copyBtn) {
      copyBtn.textContent = copyBtn.getAttribute('data-label') || copyLabel();
    }
  }

  function open(slug, title) {
    if (!slug) {
      return;
    }
    lastFocus = document.activeElement;
    fill(slug, title);
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else {
      dialog.setAttribute('open', '');
    }
    if (copyBtn) {
      copyBtn.focus();
    }
  }

  function close() {
    if (typeof dialog.close === 'function' && dialog.open) {
      dialog.close();
    } else {
      dialog.removeAttribute('open');
    }
    if (lastFocus && typeof lastFocus.focus === 'function') {
      lastFocus.focus();
    }
    lastFocus = null;
  }

  function findSlugButton(slug, selector) {
    var nodes = document.querySelectorAll(selector);
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].getAttribute('data-share-slug') === slug) {
        return nodes[i];
      }
    }
    return null;
  }

  function consumeShareQuery() {
    var params = new URLSearchParams(location.search);
    if (params.get('share') !== 'open') {
      return;
    }
    var slug = params.get('slug') || '';
    if (!slug) {
      var match = location.pathname.match(/^\\/a\\/([^/]+)$/);
      slug = match ? decodeURIComponent(match[1]) : '';
    }
    if (slug) {
      var meta = findSlugButton(slug, '[data-share-slug]');
      open(slug, meta ? meta.getAttribute('data-share-title') || '' : document.title);
    }
    params.delete('share');
    params.delete('slug');
    var query = params.toString();
    history.replaceState(null, '', location.pathname + (query ? '?' + query : '') + location.hash);
  }

  document.addEventListener('click', function (event) {
    var target = event.target;
    if (!target || !target.closest) {
      return;
    }
    if (target.closest('#archive-share-dialog')) {
      return;
    }
    var openBtn = target.closest('[data-share-open]');
    if (openBtn) {
      event.preventDefault();
      open(openBtn.getAttribute('data-share-slug') || '', openBtn.getAttribute('data-share-title') || '');
      return;
    }
    var pageCopy = target.closest('[data-share-copy]');
    if (pageCopy) {
      event.preventDefault();
      var slug = pageCopy.getAttribute('data-share-slug') || '';
      if (!slug) {
        return;
      }
      copyText(shareUrl(slug)).then(function (ok) {
        if (ok) {
          markCopied(pageCopy);
        } else {
          open(slug, pageCopy.getAttribute('data-share-title') || '');
          announce(failedLabel());
        }
      });
    }
  });

  dialog.addEventListener('click', function (event) {
    var target = event.target;
    if (!target || !target.closest) {
      return;
    }
    if (target.closest('[data-share-close]') || target.hasAttribute('data-share-dismiss')) {
      event.preventDefault();
      close();
      return;
    }
    if (target.closest('.archive-share-copy')) {
      event.preventDefault();
      var text = urlField ? urlField.value : shareUrl(currentSlug);
      copyText(text).then(function (ok) {
        if (ok) {
          markCopied(copyBtn);
          if (urlField) {
            urlField.select();
          }
        } else if (urlField) {
          urlField.focus();
          urlField.select();
          announce(failedLabel());
        }
      });
      return;
    }
    if (target.closest('[data-share-native]')) {
      event.preventDefault();
      if (!navigator.share) {
        return;
      }
      var payload = { url: urlField ? urlField.value : shareUrl(currentSlug) };
      if (currentTitle) {
        payload.title = currentTitle;
      }
      navigator.share(payload).catch(function () {});
    }
  });

  dialog.addEventListener('cancel', function (event) {
    event.preventDefault();
    close();
  });

  dialog.addEventListener('keydown', function (event) {
    if (!dialog.open) {
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab') {
      return;
    }
    var nodes = focusables();
    if (!nodes.length) {
      return;
    }
    var first = nodes[0];
    var last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', consumeShareQuery);
  } else {
    consumeShareQuery();
  }
})();
</script>`;

export function shareDialogStyleTag(): string {
	return `<style data-archive-share-dialog>${SHARE_DIALOG_STYLE}</style>`;
}

export function shareDialogInjection(locale: Locale): string {
	return `${shareDialogStyleTag()}${shareDialogMarkup(locale)}${SHARE_DIALOG_SCRIPT}`;
}
