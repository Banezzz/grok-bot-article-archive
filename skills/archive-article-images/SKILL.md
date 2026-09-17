---
name: Archive article images
description: >-
  use this when archiving a web/WeChat/X/Substack article to HTML and you must
  fetch, embed, and verify all in-article images before upload
---
# Archive article images

Goal: self-contained archive HTML with **all** meaningful article images embedded. Text-only with placeholders is a failure unless the source truly has no images or every remaining URL failed after documented retries.

## Steps

1. **Fetch full page HTML** (not a summary extract). Prefer `curl` with a real browser/UA; for WeChat `mp.weixin.qq.com`, use a MicroMessenger-like UA and save the raw HTML.
2. **Extract image URLs** from the article body region first (`#js_content`, `article`, main content). Collect `data-src`, `src`, `data-original`, srcset, and JSON-escaped CDN URLs. Also keep cover/og image if present.
3. **Normalize and dedupe** by asset id (strip query/`/0`/`/640` size variants). Prefer the largest reasonable size (e.g. WeChat `/640`).
4. **Download every unique asset** with anti-hotlink headers when needed:
   - WeChat: `Referer: https://mp.weixin.qq.com/` + MicroMessenger UA
   - Retry once on timeout/empty; skip only if still &lt; ~500 bytes or hard 403/404
5. **Embed into HTML** as `data:` URIs (or other self-contained form). Map images to captions/figure slots in document order. Put extras in an appendix rather than dropping them. Stay under the site upload HTML limit (8MB); compress/re-encode if needed, never silently drop charts.
6. **Pre-upload checklist** (must pass or be disclosed):
   - unique source image count ≈ embedded image count
   - zero unexplained “image missing” placeholders
   - cover/thumbnail set from cover or first chart
7. **On gaps**: list missing URLs, what was tried, and whether an alternate mirror exists. Still upload the best partial archive with an explicit gap notice in the page and the chat reply.

## Non-goals

- Do not rely on live hotlinked CDN URLs in the archived HTML.
- Do not treat WebFetch-only markdown (which often strips images) as complete.
