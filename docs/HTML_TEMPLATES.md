# HTML templates

The templates in `templates/` are deliberately dependency-free HTML documents. Copy one, replace its `{{PLACEHOLDER}}` values, and generate the article body before uploading. Do not add a remote stylesheet, script, font, image CDN, or tracker: an archive should remain readable when the source disappears.

Prefer these repo templates (or equivalent CSS). Do not invent a new reading chrome with hardcoded absolute background or text colors. Those fight the archive site theme toggle and often leave secondary English unreadable.

## Choose a template

- [`article.bilingual.html`](../templates/article.bilingual.html) — English source or post. Keep Chinese first, then the matching English source in each `.pair` block.
- [`article.zh.html`](../templates/article.zh.html) — Chinese source. Use a single Chinese reading flow without duplicated English text.
- For another source language, translate to Chinese and use the Chinese template unless the operator requests a bilingual presentation.

## Replace metadata safely

Replace `{{TITLE}}`, `{{AUTHOR}}`, `{{PUBLISHED_AT}}`, `{{PUBLISHED_AT_LABEL}}`, and `{{SOURCE_URL}}` with HTML-escaped values. Keep the machine-readable `datetime` value in an ISO-compatible form and use the label for the human-facing date. If a value is unknown, use a neutral label such as `Unknown author` or omit the metadata line rather than inventing it.

`{{SOURCE_URL}}` should be the canonical source URL. Add `rel="noreferrer noopener"` to outbound links, as the included templates do. The archive API separately receives the same source URL in JSON as `source_url`.

## Theme-aware CSS

The archive chrome sets `html[data-theme="light"]` or `html[data-theme="dark"]` from the `archive_theme` cookie. Unset follows `prefers-color-scheme`. Article CSS must flip with those signals.

- Use CSS variables for background, text, muted secondary text, links, borders, and panels. Align tokens with `LIGHT_VARS` / `DARK_VARS` in `src/pages.ts` (`--bg`, `--fg`, `--muted`, `--card`, `--border`, `--accent`).
- Set the dark palette on `html[data-theme="dark"]` and on `html:not([data-theme="light"])` inside `@media (prefers-color-scheme: dark)`. Set the light palette on `:root` and on `html[data-theme="light"]`.
- Color `body`, headings, paragraphs, lists, links, and panels with `var(--bg)`, `var(--fg)`, `var(--muted)`, `var(--accent)`, `var(--card)`, and `var(--border)`. Do not hardcode `#000`, `#111`, `#fff`, or similar on the reading chrome.
- Keep the secondary language (English in bilingual pages, via `.en`) on `var(--muted)` so it stays readable in both themes. Primary Chinese text uses `var(--fg)`.
- The article view injects a late override stylesheet so already-stored HTML follows the toggle without a re-upload. Downloaded raw HTML does not receive that override; new archives must still ship theme-aware CSS so offline copies work.

## Language layout

### Bilingual

Use one `.pair` per meaningful unit. Chinese first, then the matching English source. Mark **every** language-specific block with both a class and a `lang` attribute so the article-page content-language switch (`中文` / `English` / `中英对照`) can hide or show them. The live `/a/:slug` view injects `html[data-content-lang=zh|en|both]` and CSS; already-stored HTML does not need a re-upload if it already uses these marks (or common equivalents such as `lang="zh-CN"`, `.cn`, `.bi-zh`, `.tr`, `.orig`, `.bi-en`).

```html
<section class="pair">
  <p class="zh" lang="zh">对应的中文翻译。</p>
  <p class="en" lang="en">English paragraph.</p>
</section>
```

Keep paragraphs, headings, lists, quotations, and code blocks aligned. Do not put a long translation at the end of the article where it cannot be matched to the source. Preserve code in `<pre><code>` and do not translate identifiers or commands.

Headings that differ by language belong in a `.pair` too:

```html
<section class="pair">
  <h2 class="zh" lang="zh">收获</h2>
  <h2 class="en" lang="en">Harvest</h2>
</section>
```

Leave shared media unmarked so every mode still shows it. If a figure caption or quoted tweet is bilingual, mark each line, not the wrapping `figure` / `img` / `pre`:

```html
<figure>
  <img src="data:image/jpeg;base64,…" alt="Descriptive alt">
  <figcaption>
    <span class="zh" lang="zh">图注中文。</span>
    <span class="en" lang="en">English caption.</span>
  </figcaption>
</figure>

<blockquote class="tweet-card">
  <p class="zh" lang="zh">推文中文。</p>
  <p class="en" lang="en">Quoted tweet in English.</p>
</blockquote>
```

Do not put `lang="zh"` on the whole `<article>` of a bilingual page — that wrapper is ignored by the switch (so a Chinese-only article is not treated as a language pair). The switch is hidden on pages that are not bilingual.

The interface language toggle (`中文` / `EN`) only changes chrome labels. It is separate from this content-language control.

### Chinese-only

Use `<article lang="zh">` and ordinary paragraphs, headings, lists, quotations, and figures. Do not manufacture English text just to fill a template. For other languages, make the Chinese translation readable and mark uncertain names or terminology in a short note. A Chinese-only page should not include `.pair` / `.en` blocks; the content-language switch stays hidden.

## Embed images

Every meaningful article image and the cover should be embedded in the HTML as a data URI or another self-contained representation:

```html
<figure>
  <img src="data:image/jpeg;base64,REPLACE_WITH_IMAGE_DATA"
       alt="Descriptive Chinese or bilingual alt text">
  <figcaption>Figure caption, source note, or translation note.</figcaption>
</figure>
```

- Download images from the full source HTML, including `data-src`, `src`, `data-original`, `srcset`, and JSON-escaped URLs.
- Prefer the largest reasonable source, then re-encode or resize only to stay under the 8 MiB upload limit.
- Use descriptive `alt` text. Use a blank `alt` only for a genuinely decorative image.
- Keep a figure next to the paragraph or section it illustrates.
- Never leave a live CDN URL as the only copy of a meaningful image.
- Follow [`skills/archive-article-images/SKILL.md`](../skills/archive-article-images/SKILL.md) for extraction, anti-hotlink headers, retries, and verification.

## Gap notices

If an image cannot be recovered after documented retries, do not hide the gap or call the archive complete without qualification. Add a visible notice where the figure belongs:

```html
<p class="gap" role="note">
  Image gap: the source image at REPLACE_WITH_SOURCE_URL could not be downloaded after retrying with the source page referer. An alternate mirror was not found.
</p>
```

Record the same gap in the upload report: URL, attempts, failure reason, and whether a mirror was checked. A gap notice is for an unresolved source failure; it is not a generic placeholder for work that was skipped. If there are no images in the source, say so in the report instead of adding a missing-image notice.

## Before upload

1. Check that the document is valid UTF-8 and contains no template markers that should have been replaced.
2. Compare unique source image URLs with embedded figures; explain every difference.
3. Confirm the cover or first useful chart is available as the thumbnail.
4. Measure the JSON body and HTML bytes; stay below 8 MiB.
5. Confirm no remote assets are required for reading.
6. Confirm colors come from theme variables and respond to `data-theme` plus `prefers-color-scheme`. Flip both themes mentally: body, primary text, muted English, links, and panels must stay legible.
7. For bilingual pages, confirm every language-specific paragraph, heading, caption, and quoted tweet is marked (`class="zh"|"en"` and `lang="zh"|"en"`, Chinese first). Unmarked figures, images, and code must remain visible in every content-language mode.
8. Upload with the API documented in [`UPLOAD_API.md`](UPLOAD_API.md), then verify the returned article path.
