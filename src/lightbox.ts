import { t, type Locale } from './i18n';
import { escapeHtml } from './util';

// Runtime CSS/JS for the image lightbox. Injected by HTMLRewriter / page chrome.
// Do not write this markup into stored article HTML in R2.

const MIN_SOURCE_PX = 48;

export const LIGHTBOX_STYLE = `
.thumb-zoom { appearance: none; border: 0; padding: 0; margin: 0; background: none; cursor: zoom-in; border-radius: 10px; line-height: 0; display: block; }
.thumb-zoom:focus-visible { outline: 2px solid var(--accent, #0c6a52); outline-offset: 2px; }
img.thumb { cursor: zoom-in; }
img.archive-lightbox-source { cursor: zoom-in; }
.archive-lightbox { width: min(100vw, 100%); max-width: 100vw; height: 100%; max-height: 100vh; margin: 0; padding: 0; border: 0; background: transparent; color: inherit; }
.archive-lightbox::backdrop { background: transparent; }
.archive-lightbox-backdrop { position: fixed; inset: 0; display: grid; place-items: center; padding: 36px 20px 24px; background: var(--lb-scrim); color: var(--lb-fg); }
.archive-lightbox-figure { position: relative; display: flex; align-items: center; justify-content: center; max-width: min(96vw, 1400px); max-height: calc(100vh - 48px); }
.archive-lightbox-img { display: block; max-width: min(92vw, 1280px); max-height: calc(100vh - 72px); width: auto; height: auto; object-fit: contain; border-radius: 10px; box-shadow: var(--lb-shadow); background: var(--lb-frame); }
.archive-lightbox-close, .archive-lightbox-prev, .archive-lightbox-next {
  appearance: none; border: 1px solid var(--lb-border); background: var(--lb-control-bg); color: var(--lb-control-fg);
  font: 600 14px/1.2 ui-sans-serif, system-ui, -apple-system, "Segoe UI", "PingFang SC", "Noto Sans SC", sans-serif;
  cursor: pointer; border-radius: 999px; box-shadow: var(--lb-shadow);
}
.archive-lightbox-close { position: absolute; top: 10px; right: 10px; z-index: 3; padding: 8px 12px; }
.archive-lightbox-prev, .archive-lightbox-next { position: absolute; top: 50%; transform: translateY(-50%); z-index: 2; width: 42px; height: 42px; padding: 0; font-size: 28px; font-weight: 500; }
.archive-lightbox-prev { left: 10px; }
.archive-lightbox-next { right: 10px; }
.archive-lightbox-close:hover, .archive-lightbox-prev:hover, .archive-lightbox-next:hover { background: var(--lb-control-hover); }
.archive-lightbox-close:focus-visible, .archive-lightbox-prev:focus-visible, .archive-lightbox-next:focus-visible { outline: 2px solid var(--lb-accent); outline-offset: 2px; }
.archive-lightbox-prev[hidden], .archive-lightbox-next[hidden] { display: none; }
.archive-lightbox-sr { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
html { --lb-scrim: rgba(42, 36, 28, .48); --lb-fg: #1a1814; --lb-frame: #fffdf8; --lb-border: rgba(26, 24, 20, .16); --lb-control-bg: rgba(255, 253, 248, .96); --lb-control-fg: #1a1814; --lb-control-hover: #fff; --lb-accent: #0c6a52; --lb-shadow: 0 12px 40px rgba(26, 24, 20, .22); }
@media (prefers-color-scheme: dark) {
  html:not([data-theme="light"]) { --lb-scrim: rgba(12, 10, 8, .82); --lb-fg: #f4efe6; --lb-frame: #1d1a16; --lb-border: rgba(244, 239, 230, .16); --lb-control-bg: rgba(29, 26, 22, .92); --lb-control-fg: #f4efe6; --lb-control-hover: #2a2620; --lb-accent: #86d4b0; --lb-shadow: 0 16px 48px rgba(0, 0, 0, .45); }
}
html[data-theme="dark"] { --lb-scrim: rgba(12, 10, 8, .82); --lb-fg: #f4efe6; --lb-frame: #1d1a16; --lb-border: rgba(244, 239, 230, .16); --lb-control-bg: rgba(29, 26, 22, .92); --lb-control-fg: #f4efe6; --lb-control-hover: #2a2620; --lb-accent: #86d4b0; --lb-shadow: 0 16px 48px rgba(0, 0, 0, .45); }
html[data-theme="light"] { --lb-scrim: rgba(42, 36, 28, .48); --lb-fg: #1a1814; --lb-frame: #fffdf8; --lb-border: rgba(26, 24, 20, .16); --lb-control-bg: rgba(255, 253, 248, .96); --lb-control-fg: #1a1814; --lb-control-hover: #fff; --lb-accent: #0c6a52; --lb-shadow: 0 12px 40px rgba(26, 24, 20, .22); }
`;

export function lightboxMarkup(locale: Locale): string {
	return `<dialog id="archive-lightbox" class="archive-lightbox" aria-modal="true" aria-labelledby="archive-lightbox-title">
  <div class="archive-lightbox-backdrop" data-lightbox-dismiss>
    <h2 id="archive-lightbox-title" class="archive-lightbox-sr">${escapeHtml(t(locale, 'lightboxDialog'))}</h2>
    <div class="archive-lightbox-figure">
      <button type="button" class="archive-lightbox-close" data-lightbox-close>${escapeHtml(t(locale, 'lightboxClose'))}</button>
      <button type="button" class="archive-lightbox-prev" data-lightbox-prev aria-label="${escapeHtml(t(locale, 'lightboxPrev'))}">‹</button>
      <img class="archive-lightbox-img" alt="">
      <button type="button" class="archive-lightbox-next" data-lightbox-next aria-label="${escapeHtml(t(locale, 'lightboxNext'))}">›</button>
    </div>
  </div>
</dialog>`;
}

export const LIGHTBOX_SCRIPT = `<script>
(function () {
  var MIN = ${MIN_SOURCE_PX};
  var dialog = document.getElementById('archive-lightbox');
  if (!dialog || dialog.dataset.bound === '1') {
    return;
  }
  dialog.dataset.bound = '1';
  var stage = dialog.querySelector('.archive-lightbox-img');
  var closeBtn = dialog.querySelector('[data-lightbox-close]');
  var prevBtn = dialog.querySelector('[data-lightbox-prev]');
  var nextBtn = dialog.querySelector('[data-lightbox-next]');
  var items = [];
  var index = 0;
  var lastFocus = null;

  function sourceUrl(img) {
    return img.currentSrc || img.src || img.getAttribute('src') || '';
  }

  function isTiny(img) {
    if (img.classList.contains('thumb') || img.closest('.thumb-zoom')) {
      return false;
    }
    var nw = img.naturalWidth || 0;
    var nh = img.naturalHeight || 0;
    var aw = Number(img.getAttribute('width')) || img.width || 0;
    var ah = Number(img.getAttribute('height')) || img.height || 0;
    if (nw && nh) {
      return nw < MIN && nh < MIN;
    }
    return aw > 0 && ah > 0 && aw < MIN && ah < MIN;
  }

  function isEligible(img) {
    if (!img || img.tagName !== 'IMG') {
      return false;
    }
    if (img.closest('#archive-lightbox') || img.closest('[data-archive-chrome]')) {
      return false;
    }
    if (!sourceUrl(img) || isTiny(img)) {
      return false;
    }
    return true;
  }

  function collect() {
    items = Array.prototype.filter.call(document.images, isEligible);
    items.forEach(function (img) {
      img.classList.add('archive-lightbox-source');
      if (!img.hasAttribute('tabindex') && !img.closest('a, button')) {
        img.setAttribute('tabindex', '0');
      }
      if (!img.closest('a, button') && !img.getAttribute('role')) {
        img.setAttribute('role', 'button');
      }
    });
  }

  function controls() {
    var many = items.length > 1;
    if (prevBtn) {
      prevBtn.hidden = !many;
    }
    if (nextBtn) {
      nextBtn.hidden = !many;
    }
  }

  function show(nextIndex) {
    if (!items.length) {
      return;
    }
    index = (nextIndex + items.length) % items.length;
    var img = items[index];
    stage.src = sourceUrl(img);
    stage.alt = img.alt || '';
    controls();
  }

  function focusables() {
    return [closeBtn, prevBtn, nextBtn].filter(function (node) {
      return node && !node.hidden;
    });
  }

  function open(img) {
    collect();
    var nextIndex = items.indexOf(img);
    if (nextIndex < 0) {
      return;
    }
    lastFocus = document.activeElement;
    show(nextIndex);
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else {
      dialog.setAttribute('open', '');
    }
    if (closeBtn) {
      closeBtn.focus();
    }
  }

  function close() {
    if (typeof dialog.close === 'function' && dialog.open) {
      dialog.close();
    } else {
      dialog.removeAttribute('open');
    }
    stage.removeAttribute('src');
    if (lastFocus && typeof lastFocus.focus === 'function') {
      lastFocus.focus();
    }
    lastFocus = null;
  }

  function imageFromEvent(event) {
    var target = event.target;
    if (!target || !target.closest) {
      return null;
    }
    if (target.closest('#archive-lightbox') || target.closest('[data-archive-chrome]')) {
      return null;
    }
    var img = target.closest('img');
    if (!img) {
      var wrap = target.closest('.thumb-zoom');
      img = wrap ? wrap.querySelector('img') : null;
    }
    return img && isEligible(img) ? img : null;
  }

  document.addEventListener('click', function (event) {
    var img = imageFromEvent(event);
    if (!img) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    open(img);
  }, true);

  document.addEventListener('keydown', function (event) {
    if (dialog.open) {
      return;
    }
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    var img = imageFromEvent(event);
    if (!img) {
      return;
    }
    event.preventDefault();
    open(img);
  });

  dialog.addEventListener('click', function (event) {
    var target = event.target;
    if (!target || !target.closest) {
      return;
    }
    if (target.closest('[data-lightbox-close]') || target.hasAttribute('data-lightbox-dismiss')) {
      event.preventDefault();
      close();
      return;
    }
    if (target.closest('[data-lightbox-prev]')) {
      event.preventDefault();
      show(index - 1);
      return;
    }
    if (target.closest('[data-lightbox-next]')) {
      event.preventDefault();
      show(index + 1);
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
    if (event.key === 'ArrowLeft' && items.length > 1) {
      event.preventDefault();
      show(index - 1);
      return;
    }
    if (event.key === 'ArrowRight' && items.length > 1) {
      event.preventDefault();
      show(index + 1);
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
    document.addEventListener('DOMContentLoaded', collect);
  } else {
    collect();
  }
})();
</script>`;

export function lightboxStyleTag(): string {
	return `<style data-archive-lightbox>${LIGHTBOX_STYLE}</style>`;
}

export function lightboxInjection(locale: Locale): string {
	return `${lightboxStyleTag()}${lightboxMarkup(locale)}${LIGHTBOX_SCRIPT}`;
}
