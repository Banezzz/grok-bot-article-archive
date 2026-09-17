# Deploy the archive on Cloudflare Free

This guide deploys the Worker, a D1 metadata database, and an R2 bucket with Wrangler. It is intentionally provider-only: use your own Cloudflare account, names, and Worker origin. Do not copy any example placeholder as a real credential or identifier.

> **Free-plan note:** Cloudflare plan limits and pricing can change. Check the current [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), and [R2 pricing](https://developers.cloudflare.com/r2/pricing/) pages before deploying.

## 1. Prerequisites

- A Cloudflare account with Workers, D1, and R2 available.
- Node.js and npm.
- The archive repository checked out locally.
- Wrangler installed by the repository, or available through `npx wrangler`.

From the project directory:

```sh
npm install
npx wrangler login
npx wrangler whoami
```

`whoami` shows the account you can use. Copy the account ID into `wrangler.jsonc` as `YOUR_ACCOUNT_ID`; never publish that value in this documentation package.

## 2. Create the D1 database and R2 bucket

Choose your own globally unique resource names. The names below are placeholders only:

```sh
npx wrangler d1 create replace-me-archive-db
npx wrangler r2 bucket create replace-me-archive-html
```

Save the D1 `database_id` printed by Wrangler in a local scratch note. Do not put it in a public issue, chat message, or committed example. R2 bucket names must be unique within the account and can be changed to a name you control.

## 3. Fill `wrangler.jsonc`

Edit the repository's `wrangler.jsonc`. Replace every placeholder, keep the bindings exactly as `DB` and `ARTICLES`, and keep `migrations_dir` pointing at `migrations`:

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "replace-me-archive-worker",
  "account_id": "YOUR_ACCOUNT_ID",
  "main": "src/index.ts",
  "compatibility_date": "2026-09-18",
  "compatibility_flags": ["nodejs_compat"],
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "replace-me-archive-db",
      "database_id": "replace-me-after-d1-create",
      "migrations_dir": "migrations"
    }
  ],
  "r2_buckets": [
    {
      "binding": "ARTICLES",
      "bucket_name": "replace-me-archive-html"
    }
  ]
}
```

- `account_id` is the account ID from your own Cloudflare account.
- `database_id` is the ID returned by your own `d1 create` command.
- `database_name` and `bucket_name` must match the resources you created.
- The Worker name must be unique in your account. If you use a custom domain, configure it separately in Cloudflare; this guide does not prescribe a production host.

## 4. Set production secrets

`SITE_ACCESS_SECRET` is required. Use a long, random value; it signs login session cookies. Set it interactively so the value does not appear in shell history:

```sh
npx wrangler secret put SITE_ACCESS_SECRET
```

`UPLOAD_TOKEN` is optional and is a legacy bootstrap token. The application accepts it only while no per-user upload tokens exist. Prefer creating the first user at `/setup`, then use the per-user token shown once by the setup or Settings UI. If you intentionally need the legacy path, set it interactively and rotate or remove it after setup:

```sh
npx wrangler secret put UPLOAD_TOKEN
```

Never place either secret in `wrangler.jsonc`, `.dev.vars`, a public README, logs, or source control. For local development, use a local-only `.dev.vars` based on `.dev.vars.example` and keep it uncommitted.

## 5. Apply D1 migrations

Apply the checked-in migrations to the remote database before the first request that needs stored metadata:

```sh
npx wrangler d1 migrations apply DB --remote
```

For local testing, use a separate local database state:

```sh
npx wrangler d1 migrations apply DB --local
```

Do not use `--local` as a substitute for the production migration. Review migration output and confirm all files in `migrations/` were applied.

## 6. Deploy the Worker

Run checks and deploy from the project directory:

```sh
npm run typecheck
npm test
npx wrangler deploy
```

The deploy command prints the Worker URL. Treat that URL as the operator's private deployment detail. In bot configuration, set `ARCHIVE_URL` to that origin without a trailing path, for example `https://YOUR_WORKER_SUBDOMAIN.workers.dev` or your own custom origin. Do not hard-code an origin belonging to another operator.

A quick health check is:

```sh
curl -fsS "${ARCHIVE_URL}/health"
```

The expected JSON is `{"ok":true}`.

## 7. Complete first-run setup

1. Open `ARCHIVE_URL/setup` in a browser.
2. Create the first administrator username and password.
3. Store the upload token shown by the UI in the operator's secret manager or local environment. It is not recoverable from the UI after it is hidden; rotate it from Settings if necessary.
4. Sign in and verify that the archive list loads.
5. Send a small test upload using the placeholders-only examples in [UPLOAD_API.md](UPLOAD_API.md).
6. Confirm the article page and thumbnail work, then remove any test article you do not want to keep.

If `/setup` is unavailable after an administrator exists, sign in normally. The setup page is intentionally only exposed while the database has no users.

## 8. Operational checklist

- [ ] `wrangler.jsonc` contains only your local deployment values and is not copied into this public bot-kit package.
- [ ] The D1 migration command completed with `--remote`.
- [ ] `SITE_ACCESS_SECRET` is set.
- [ ] The optional legacy `UPLOAD_TOKEN` is unset or has been retired after first setup.
- [ ] The bot uses the operator's own `ARCHIVE_URL` and a token supplied through its secret mechanism.
- [ ] No token, account ID, database ID, or production origin is printed in logs or committed.
- [ ] Uploads stay under the application's 8 MiB request limit; see [UPLOAD_API.md](UPLOAD_API.md).

### Useful references

- [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)
- [R2 pricing](https://developers.cloudflare.com/r2/pricing/)
- [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)
- [R2 bucket operations](https://developers.cloudflare.com/r2/buckets/)
