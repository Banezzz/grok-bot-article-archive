/** Cloudflare D1 rejects a statement that binds more than 100 parameters. */
export const D1_MAX_BOUND_PARAMS = 100;

export function assertD1BindCount(count: number, context?: string): void {
	if (count > D1_MAX_BOUND_PARAMS) {
		const where = context ? ` (${context})` : '';
		throw new Error(`D1 statement binds ${count} parameters${where}; Cloudflare D1 allows at most ${D1_MAX_BOUND_PARAMS}`);
	}
}

export function bindD1(stmt: D1PreparedStatement, ...values: unknown[]): D1PreparedStatement {
	assertD1BindCount(values.length);
	return stmt.bind(...values);
}

/** Membership test that binds the whole list as one JSON parameter. */
export function sqlInJsonEach(columnSql: string): string {
	return `${columnSql} IN (SELECT value FROM json_each(?))`;
}

export function jsonSqlList(values: readonly string[]): string {
	return JSON.stringify(values);
}
