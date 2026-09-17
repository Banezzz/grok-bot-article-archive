# Upload API

`POST {ARCHIVE_URL}/api/upload` stores a self-contained article HTML document in R2 and its metadata in D1. `{ARCHIVE_URL}` is a placeholder for the operator's own Worker origin; replace it only at runtime.

## Authentication and request

Send a per-user upload token in the Bearer header:

```http
POST {ARCHIVE_URL}/api/upload
Authorization: Bearer <UPLOAD_TOKEN>
Content-Type: application/json
```

The legacy `UPLOAD_TOKEN` environment secret is accepted only when the database has no per-user upload tokens. After `/setup` creates the first user, use the per-user token shown once by the UI. Never print or commit any token.

The request body must be a JSON object. The complete request body is limited to **8 MiB (8,388,608 bytes)**, and the UTF-8 encoded `html` value is checked against the same limit. Base64 increases payload size, so leave headroom when embedding images. A missing or invalid Bearer token returns `401`.

## Fields

| Field | Required | Type and limit | Behavior |
| --- | --- | --- | --- |
| `title` | yes | non-empty string, max 500 characters | Stored as the article title. |
| `source_url` | yes | non-empty string, max 2,048 characters | Original source URL; the API validates it as a string and does not require a particular URL scheme here. |
| `html` | yes | non-empty string; UTF-8 request and HTML limit 8 MiB | Full self-contained HTML. It is stored in R2 as `text/html; charset=utf-8`. |
| `author` | no | string, max 200 characters | Empty, null, or omitted values are ignored. |
| `lang` | no | string, max 16 characters | A source-language label such as `en` or `zh`. |
| `slug` | no | string, max 128 characters; lowercase letters, digits, and hyphens; starts and ends with a letter or digit | Reuses/upserts an existing article with that slug. If omitted, a slug is generated from the title and date. |
| `published_at` | no | string, max 64 characters; must parse as a date | Prefer an ISO-8601 datetime. |
| `notes` | no | string, max 4,000 characters | Operator notes. |
| `summary_zh` | no | string, max 4,000 characters | Chinese summary shown with the article metadata. Operationally recommended for bot uploads. |
| `tags` | no | array of strings; each normalized to lowercase, valid slug, max 64 characters | Duplicate slugs are removed. Use conservative topical tags. |
| `thumbnail_url` | no | string, max 2,048 characters | Optional thumbnail source URL. The application attempts to fetch and store it. |
| `thumbnail_base64` | no | string, max 4 MiB | Optional image data, preferably a complete data URI or supported base64 value. The application attempts to store it. |

For optional strings, empty strings and `null` are treated like omitted values. Invalid types, overlong values, invalid slugs, non-array tags, or invalid dates return `400` with a JSON error.

### Recommended bot payload

For a normal archive bot, send at least `title`, `source_url`, `html`, `summary_zh`, `tags`, and one of `thumbnail_url` or `thumbnail_base64`, plus any known metadata:

```json
{
  "title": "REPLACE_WITH_TITLE",
  "source_url": "https://SOURCE.example/article",
  "author": "REPLACE_WITH_AUTHOR",
  "lang": "en",
  "published_at": "2026-01-01T00:00:00Z",
  "html": "<!doctype html><html lang=\"zh-CN\"><body>REPLACE_WITH_SELF_CONTAINED_HTML</body></html>",
  "summary_zh": "REPLACE_WITH_SHORT_CHINESE_SUMMARY",
  "tags": ["ai", "programming"],
  "thumbnail_base64": "data:image/jpeg;base64,REPLACE_WITH_IMAGE_DATA"
}
```

The example values are placeholders. Do not place live credentials, private origins, or real account identifiers in copied examples.

## Success response

A successful upsert returns HTTP `200` and this shape:

```json
{
  "ok": true,
  "slug": "generated-or-provided-slug",
  "url": "/a/generated-or-provided-slug",
  "tags": [
    { "slug": "ai", "name_zh": "ai", "name_en": null }
  ],
  "summary_zh": "REPLACE_WITH_SHORT_CHINESE_SUMMARY",
  "thumbnail_url": "/thumb/generated-or-provided-slug",
  "owner_username": "REPLACE_WITH_OWNER_USERNAME"
}
```

`thumbnail_url` can be `null` when no thumbnail was stored. `owner_username` can be `null` for legacy uploads. The returned `url` is a path; resolve it against the operator's own `ARCHIVE_URL`.

## Errors

Errors are JSON with this shape:

```json
{ "ok": false, "error": "message" }
```

Common statuses:

- `400`: invalid JSON, missing required field, wrong type, overlong value, invalid tag/slug, or invalid date.
- `401`: missing or invalid Bearer token.
- `405`: method other than `POST`.
- `413`: request body or HTML exceeds 8 MiB.
- `500`: unexpected server-side failure.

## curl examples

All values below are placeholders. Supply the origin and token from the operator's runtime secret store; do not paste a real token into shell history or source control.

Minimal valid request:

```sh
curl --fail-with-body -X POST "${ARCHIVE_URL}/api/upload" \
  -H 'Authorization: Bearer <UPLOAD_TOKEN>' \
  -H 'Content-Type: application/json' \
  --data-binary @article.json
```

With a JSON file generated by the bot:

```sh
cat > article.json <<'JSON'
{
  "title": "REPLACE_WITH_TITLE",
  "source_url": "https://SOURCE.example/article",
  "html": "<!doctype html><html lang=\"zh-CN\"><body>REPLACE_WITH_SELF_CONTAINED_HTML</body></html>",
  "summary_zh": "REPLACE_WITH_SHORT_CHINESE_SUMMARY",
  "tags": ["misc"],
  "thumbnail_url": "https://SOURCE.example/cover.jpg"
}
JSON

curl --fail-with-body -X POST "${ARCHIVE_URL}/api/upload" \
  -H 'Authorization: Bearer <UPLOAD_TOKEN>' \
  -H 'Content-Type: application/json' \
  --data-binary @article.json
```

For a self-contained archive, prefer an embedded thumbnail and embedded article images. Keep both the JSON body and the HTML under the 8 MiB limit. The endpoint may fetch `thumbnail_url`, but live URLs inside article HTML are not a substitute for embedding the article's images.
