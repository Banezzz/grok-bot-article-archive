declare module 'cloudflare:test' {
	interface ProvidedEnv extends Env {
		TEST_MIGRATIONS: Array<{ name: string; queries: string[] }>;
	}
}
