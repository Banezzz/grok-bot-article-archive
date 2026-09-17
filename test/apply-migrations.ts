import { applyD1Migrations, env } from 'cloudflare:test';

// Setup files run outside isolated storage and may run more than once.
// applyD1Migrations only applies migrations that are not already recorded.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
