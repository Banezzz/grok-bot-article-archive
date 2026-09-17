import path from 'node:path';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		cloudflareTest(async () => {
			const migrations = await readD1Migrations(path.join(import.meta.dirname, 'migrations'));
			return {
				wrangler: { configPath: './wrangler.jsonc' },
				miniflare: {
					bindings: {
						TEST_MIGRATIONS: migrations,
						SITE_ACCESS_SECRET: 'dummy-test-hmac-secret',
						UPLOAD_TOKEN: 'dev-upload-token-change-me',
						SITE_PASSWORD: 'dummy-unused-password',
					},
				},
			};
		}),
	],
	test: {
		setupFiles: ['./test/apply-migrations.ts'],
	},
});
