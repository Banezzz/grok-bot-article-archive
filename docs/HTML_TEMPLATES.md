# HTML templates

The templates in `templates/` are deliberately dependency-free HTML documents. Copy one, replace its `{{PLACEHOLDER}}` values, and generate the article body before uploading. Do not add a remote stylesheet, script, font, image CDN, or tracker: an archive should remain readable when the source disappears.

## Choose a template

- [`article.bilingual.html`](../templates/article.bilingual.html) — English source or post. Keep English first, then the matching Chinese translation in each `.pair` block.
- [`article.zh.html`](../templates/article.zh.html) — Chinese source. Use a single Chinese reading flow without duplicated English text.
- For another source language, translate to Chinese and use the Chinese template unless the operator requests a bilingual presentation.

## Replace metadata safely

Replace `{{TITLE}}`, `{{AUTHOR}}`, `{{PUBLISHED_AT}}`, `{{PUBLISHED_AT_LABEL}}`, and `{{SOURCE_URL}}` with HTML-escaped values. Keep the machine-readable `datetime` value in an ISO-compatible form and use the label for the human-facing date. If a value is unknown, use a neutral label such as `Unknown author` or omit the metadata line rather than inventing it.

`{{SOURCE_URL}}` should be the canonical source URL. Add `rel="noreferrer noopener"` to outbound links, as the included templates do. The archive API separately receives the same source URL in JSON as `source_url`.

## Language layout

### Bilingual

Use one `.pair` per meaningful unit:

```html
<section class="pair">
  <p class="en" lang="en">English paragraph.</p>
  <p class="zh" lang="zh">对应的中文翻译。</p>
</section>
```

Keep paragraphs, headings, lists, quotations, and code blocks aligned. Do not put a long translation at the end of the article where it cannot be matched to the source. Preserve code in `<pre><code>` and do not translate identifiers or commands.

### Chinese-only

Use `<article lang="zh">` and ordinary paragraphs, headings, lists, quotations, and figures. Do not manufacture English text just to fill a template. For other languages, make the Chinese translation readable and mark uncertain names or terminology in a short note.

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
6. Upload with the API documented in [`UPLOAD_API.md`](UPLOAD_API.md), then verify the returned article path.
