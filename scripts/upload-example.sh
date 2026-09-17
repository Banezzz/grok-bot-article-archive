#!/usr/bin/env bash
# Upload a sample article to a local or remote archive Worker.
# Usage:
#   UPLOAD_TOKEN=dummy-local-legacy-upload-token ./scripts/upload-example.sh
#   ARCHIVE_URL=https://<YOUR_WORKER>.workers.dev UPLOAD_TOKEN=<your-user-token> ./scripts/upload-example.sh

set -euo pipefail

BASE="${ARCHIVE_URL:-http://127.0.0.1:45454}"
TOKEN="${UPLOAD_TOKEN:?Set UPLOAD_TOKEN to the Worker upload bearer token}"

curl -sS -X POST "${BASE}/api/upload" \
	-H "Authorization: Bearer ${TOKEN}" \
	-H "Content-Type: application/json" \
	--data-binary @- <<'JSON'
{
  "title": "Example bilingual note",
  "source_url": "https://example.com/articles/hello",
  "author": "Archive Bot",
  "lang": "en",
  "published_at": "2026-09-14T12:00:00.000Z",
  "notes": "Sample payload from scripts/upload-example.sh",
  "summary_zh": "归档上传接口的双语示例，含标签与摘要。",
  "tags": ["ai", "programming"],
  "html": "<!doctype html><html><head><meta charset=\"utf-8\"><title>Example bilingual note</title></head><body><article><h1>Example bilingual note</h1><p>Hello — this HTML was archived by the upload API.</p><p lang=\"zh\">你好，这是一篇归档示例。</p></article></body></html>"
}
JSON

echo
