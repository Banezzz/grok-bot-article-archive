# Article archive

A self-hosted personal reading site for archived article HTML. A Cloudflare Worker stores full HTML (including bilingual pages and data-URI images) in **R2**, keeps a searchable metadata index in **D1**, and gates the UI behind per-user accounts.

This repository is a **public template**. Fork it, replace the Wrangler placeholders with *your* Cloudflare resources, and deploy on the **Cloudflare Free** plan. Do not commit real account IDs, database IDs, bucket names, hostnames, tokens, or passwords.

Regular users only see their own articles. Admins see everyone and manage accounts. Each signed-in user can create folders (many-to-many with articles) and star articles. Folders and stars are private to that user.

There is no public registration. The first admin is created at `/setup`. Each user has their own upload bearer token (shown once, stored as a SHA-256 hash). Images stay embedded in the stored HTML.

The template ships with a default favicon (stacked documents and a mint bookmark on warm paper). Replace the files in `assets/icons/` if you want your own; login and setup pages use it too.

## What you get

| Route | Auth | Purpose |
| --- | --- | --- |
| `GET /health` | Public | `{ ok: true }` for probes |
| `GET /favicon.svg` · `GET /favicon.ico` · `GET /apple-touch-icon.png` | Public | Default site icons (also `/favicon-32.png`, `/icon-512.png`) |
| `GET /setup` · `POST /setup` | Public only while `users` is empty | Create the first admin; then 404 |
| `GET /login` · `POST /login` | Public | Username + password; HttpOnly session cookie |
| `POST /logout` | Public | Clears the session cookie |
| `GET /lang` | Public | Set UI language cookie (`?set=zh` or `en`, plus `next=`) |
| `GET /theme` | Public | Set UI theme cookie (`?set=light` or `dark`, plus `next=`). Unset follows `prefers-color-scheme` |
| `GET /` | Session | Article list. Query: `?q=`, `?tag=`, `?folder=`, `?starred=1`, `?sort=joined` or `published`, admin `?mine=1`. Filters combine and keep `sort` in the URL. Default `joined` is newest archived first (`created_at`); `published` uses `published_at` (then `created_at`). An explicit `sort` is also stored in the `archive_sort` cookie. Thumbnails open the lightbox; titles open the article. |
| `GET /folders` · `POST /folders` | Session | Create folders; rename / delete / reorder via `POST /folders/:id/{rename,delete,move}` |
| `POST /folders/membership` | Session | Set which of *your* folders contain an article (`folder_id` checkboxes, `slug`, `next`) |
| `POST /star` | Session | Toggle your star on an article (`slug`, `next`) |
| `GET /settings` | Session | Upload token prefix; rotate and copy once |
| `GET /admin/users` | Admin | Create / delete / promote / demote users; rotate tokens |
| `GET /a/:slug` | Session | Stored HTML (404 if not owner and not admin). Chrome includes HTML download, star, folders, and a click-to-zoom image lightbox. Stored R2 HTML is not rewritten. |
| `GET /a/:slug/download` | Session | Same HTML as an attachment |
| `GET /thumb/:slug` | Session | Thumbnail (same visibility) |
| `GET /api/articles` | Session | Metadata JSON; same list filters as `/` |
| `GET /api/articles/:slug` | Session | One article if visible |
| `GET /api/tags` | Session | Tags with counts over visible articles |
| `POST /api/upload` | Bearer = that user's upload token | Store HTML; owner is the token's user |
| `DELETE /api/articles/:slug` | Bearer = user token | Delete if owner or admin token |

Sessions last 30 days. The cookie is HMAC-signed with `SITE_ACCESS_SECRET` and contains `{v:2, uid, role, exp, iat}`. Passwords are PBKDF2-SHA-256 (~100k iterations). Upload tokens are 32-byte url-safe values; only SHA-256 hashes are stored. The shared env `UPLOAD_TOKEN` is ignored after any user token exists. `SITE_PASSWORD` is no longer used for daily login.

Folder and star writes are **session form POSTs**. `POST /api/upload` is unchanged (JSON + bearer token).

## Prerequisites

- Node.js 20+
- A Cloudflare account on the [Free plan](https://www.cloudflare.com/plans/free/)
- Wrangler authenticated (`npx wrangler login`) for remote D1/R2 and deploy

Free plan is enough: one Worker, one D1 database, and one R2 bucket. No paid add-ons. Check current included usage at [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), and [R2 pricing](https://developers.cloudflare.com/r2/pricing/). Custom domains are optional; `*.workers.dev` works on Free.

## Local development

```bash
npm install
# .npmrc sets legacy-peer-deps so the official Vitest plugin installs cleanly.
cp .dev.vars.example .dev.vars
# .dev.vars.example contains dummy values only. Keep them, or substitute your own local-only strings.
npm run db:migrate:local
npm run types
npm run dev
```

`npm run dev` starts Wrangler on [http://127.0.0.1:45454](http://127.0.0.1:45454). Local D1 and R2 are simulated on disk under `.wrangler/` — no Cloudflare resources required for this path.

Open `/setup` to create the first admin (username, password, confirm). Copy the one-time upload token. Then upload:

```bash
UPLOAD_TOKEN='<your-user-upload-token>' ./scripts/upload-example.sh
```

Or with curl:

```bash
curl -sS -X POST http://127.0.0.1:45454/api/upload \
  -H "Authorization: Bearer $UPLOAD_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Example bilingual note",
    "source_url": "https://example.com/articles/hello",
    "author": "Archive Bot",
    "lang": "en",
    "html": "<!doctype html><html><body><h1>Hello</h1><p lang=\"zh\">你好</p></body></html>"
  }'
```

Successful uploads return `{ "ok": true, "slug", "url", "tags", "summary_zh", "thumbnail_url", "owner_username" }`. HTML larger than 8MB is rejected. `summary_zh`, `tags`, and thumbnails stay optional.

## Deploy to Cloudflare (Free plan)

Companion walkthrough (same Free-plan path, more checklist detail): [docs/DEPLOY.md](docs/DEPLOY.md).


Replace every placeholder in `wrangler.jsonc` with values from *your* account. The committed values (`0000…`, `replace-me-d1-database`, `replace-me-r2-bucket`) are dummy stand-ins so Wrangler can validate the file. Never paste another site's host, account ID, database ID, or bucket name into this repo.

### 1. Create R2 and D1

```bash
npx wrangler r2 bucket create your-own-r2-bucket
npx wrangler d1 create your-own-d1-database
```

Pick any Free-plan-legal names. `wrangler d1 create` prints a `database_id`. Copy your Cloudflare **account ID** from the dashboard (Workers & Pages overview) or `npx wrangler whoami`.

### 2. Fill `wrangler.jsonc` placeholders

Keep the binding names `DB` and `ARTICLES`. Replace only the dummy fields:

| Field in `wrangler.jsonc` | Committed dummy | Replace with |
| --- | --- | --- |
| `account_id` | `00000000000000000000000000000000` | Your account ID from the dashboard or `wrangler whoami` |
| `d1_databases[0].database_name` | `replace-me-d1-database` | The name you passed to `wrangler d1 create` |
| `d1_databases[0].database_id` | `00000000-0000-0000-0000-000000000000` | The UUID printed by `wrangler d1 create` |
| `r2_buckets[0].bucket_name` | `replace-me-r2-bucket` | The name you passed to `wrangler r2 bucket create` |

Optional: change the Worker `name` (this becomes `https://<name>.<subdomain>.workers.dev`).

Do not put secrets in `wrangler.jsonc`.

### 3. Secrets

```bash
npx wrangler secret put SITE_ACCESS_SECRET
```

`SITE_ACCESS_SECRET` is required (session HMAC). Generate a long random string.

Optional, only if you want a legacy shared upload token *before* `/setup`:

```bash
npx wrangler secret put UPLOAD_TOKEN
```

`SITE_PASSWORD` is unused after accounts exist. You do not need to set it.

### 4. Migrate and deploy

```bash
npm run db:migrate:remote
npx wrangler deploy
```

`db:migrate:remote` applies `0001`–`0004` (articles, tags, users, folders/stars).

Visit `https://<YOUR_WORKER>.workers.dev/setup` once, then `/login`.

Regenerate TypeScript bindings after any wrangler config change:

```bash
npm run types
```

Local typecheck and tests do not need a real Cloudflare account:

```bash
npm test
npm run typecheck
```

## Folders and stars

- **Folders** are manual and per-user. Create, rename, delete, and reorder them on `/folders`.
- An article can sit in many of *your* folders at once (many-to-many on `articles.id`).
- Assign folders from the list card or the article chrome with a custom checkbox dropdown (not a native `<select>`). Check or uncheck many folders, then Apply. Escape, Cancel, or click-outside discards the draft. `POST /folders/membership` replaces your membership set for that article in one submit.
- Filter the list with `/?folder=<folder-id>`. Folder chips appear above the tag chips.
- **Stars** are per-user. Toggle from the list card or the article chrome (`POST /star`).
- Filter with `/?starred=1`. Combine with a folder, tag, search, and (for admins) `mine=1`.
- Another user's folders and stars are never shown.

D1 migration `migrations/0004_folders_stars.sql` creates `folders`, `folder_articles`, and `article_stars`.

## Archive bot

To clone this pipeline on another assistant, paste [docs/BOT_HANDOFF.md](docs/BOT_HANDOFF.md) into the bot, attach [skills/archive-article-images/SKILL.md](skills/archive-article-images/SKILL.md), and use the shells under `templates/` (notes in [docs/HTML_TEMPLATES.md](docs/HTML_TEMPLATES.md)). Full JSON contract: [docs/UPLOAD_API.md](docs/UPLOAD_API.md). Set `ARCHIVE_URL` and the upload token at runtime only.


The intended writer is a local or scheduled bot that POSTs captured article HTML.

- **Endpoint:** `POST /api/upload`
- **Header:** `Authorization: Bearer <that user's upload token>` — owner is that user. Unknown token → 401.
- **Body:** JSON, `Content-Type: application/json`
- **Limit:** 8MB (enough for typical saved pages with data-URI images; still reject absurd payloads)

```json
{
  "title": "string",
  "source_url": "string",
  "author": "string optional",
  "lang": "en|zh|other optional",
  "html": "full HTML string",
  "slug": "optional; auto-generated from title + date if missing",
  "published_at": "optional ISO datetime",
  "notes": "optional",
  "summary_zh": "optional Chinese summary written by the archiver bot",
  "tags": ["ai", "programming"],
  "thumbnail_url": "optional https://... image to fetch and store in R2",
  "thumbnail_base64": "optional data:image/jpeg;base64,... or raw base64"
}
```

Rules the bot should follow:

- Always send `title`, `source_url`, and `html`.
- Omit `slug` unless you want to **upsert** a known article. The same slug overwrites HTML and metadata.
- Auto slugs look like `example-bilingual-note-2026-09-14`. Titles without Latin characters become `article-YYYY-MM-DD` plus a short suffix if needed.
- Send `lang` as a short tag (`en`, `zh`, `en-zh`, …). It is shown as a badge on the list.
- Write `summary_zh` in the bot (the Worker only stores it). Omit it to keep an existing summary on upsert, or leave new articles without a summary.
- Send `tags` as slugs. Known slugs use the seeded Chinese names. Unknown slugs are auto-created with `name_zh` equal to the slug. Omit `tags` on upsert to keep the current set; send `[]` to clear.
- Thumbnails: prefer `thumbnail_url` or `thumbnail_base64`. If both are omitted, the Worker tries the first `<img src>` in the HTML (http(s) or data URI). Stored at `thumbs/{slug}.ext` and served at `/thumb/{slug}` (session required).
- On success, persist the returned `slug` / `url` if you want to update or delete later.
- Delete with `DELETE /api/articles/:slug` and the same bearer token.

Seeded tags:

| slug | name_zh |
| --- | --- |
| `ai` | AI |
| `programming` | 编程 |
| `quant` | 量化交易 |
| `product` | 产品 |
| `infra` | 基础设施/云 |
| `llm-ops` | 模型与工程配置 |
| `markets` | 市场/宏观 |
| `security` | 安全 |
| `career` | 职业成长 |
| `misc` | 其他 |

Sample upload with summary and tags (point `ARCHIVE_URL` at your Worker):

```bash
curl -sS -X POST "${ARCHIVE_URL}/api/upload" \
  -H "Authorization: Bearer $UPLOAD_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Example bilingual note",
    "source_url": "https://example.com/articles/hello",
    "author": "Archive Bot",
    "lang": "zh",
    "summary_zh": "一篇关于归档接口的简短中文摘要。",
    "tags": ["ai", "programming"],
    "html": "<!doctype html><html><body><h1>Hello</h1><p lang=\"zh\">你好</p></body></html>"
  }'
```

The list defaults to newest archived first (`sort=joined`, `articles.created_at`). Switch to article time with `sort=published` (`published_at`, falling back to `created_at` when it is null). Aliases such as `created` / `created_at` and `article` / `published_at` are accepted. Newest-first only. Search covers title, author, Chinese summary, source URL, and tag names. Click a tag chip to filter; click it again to clear. The sort control on the home page keeps the choice in the URL with other filters and remembers it in a cookie.

`scripts/upload-example.sh` is a copy-paste starting point:

```bash
ARCHIVE_URL=https://<YOUR_WORKER>.workers.dev \
UPLOAD_TOKEN=... \
./scripts/upload-example.sh
```

## Package scripts

| Script | Command |
| --- | --- |
| `npm run dev` | Local Worker on port 45454 |
| `npm run deploy` | Deploy the Worker |
| `npm run db:migrate:local` | Apply D1 migrations to the local DB |
| `npm run db:migrate:remote` | Apply D1 migrations to the remote D1 database |
| `npm run types` | Generate `worker-configuration.d.ts` from wrangler config |
| `npm test` | Vitest (Workers pool) |

## Optional: Cloudflare Access

The password gate is enough to use the archive without Zero Trust. If you later put the Worker behind [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/), you can:

1. Create an Access application for the Worker hostname.
2. Require your identity provider for `GET /`, `/a/*`, and `/api/articles*`.
3. Leave `POST /api/upload` and `DELETE /api/articles/:slug` out of Access (or use a service token) so the bot can still send `Authorization: Bearer`.
4. Keep account login as a second factor, or stop using `/login` once Access is the only entry path.

Access is an upgrade, not a requirement. It is not available on every Free-plan feature set; the built-in login works without it.

## Project layout

```
src/            Worker entry, auth, D1/R2 store, HTML pages, injected image lightbox
assets/icons/   Default favicon and app icons the Worker serves as public static files
migrations/     D1 schema (0001 articles, 0002 tags, 0003 users, 0004 folders/stars)
scripts/        Example upload curl
docs/           Deploy guide, bot handoff, upload API, HTML template notes
skills/         Packaged archive skills (image crawl)
templates/      Reusable archive HTML shells (bilingual + Chinese-only)
wrangler.jsonc  Bindings with placeholders, compatibility date, observability
```

## Sanitization (template)

This tree must stay free of private production identifiers:

- No production hostnames
- No real `account_id`, `database_id`, or bucket names
- No tokens, passwords, or other secrets
- `.dev.vars.example` is dummy values only; `.dev.vars` is gitignored
