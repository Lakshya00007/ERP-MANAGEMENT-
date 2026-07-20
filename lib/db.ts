import "server-only";

import { neon } from "@neondatabase/serverless";
import { getDatabaseUrl } from "@/lib/env";

type DbRow = Record<string, unknown>;
type DbSql = ReturnType<typeof neon>;

let cachedSql: DbSql | null = null;
let cachedDatabaseUrl: string | null = null;

export function getDb() {
  const databaseUrl = getDatabaseUrl();

  if (!cachedSql || cachedDatabaseUrl !== databaseUrl) {
    cachedSql = neon(databaseUrl);
    cachedDatabaseUrl = databaseUrl;
  }

  return cachedSql;
}

export async function sql<T extends DbRow = DbRow>(
  strings: TemplateStringsArray,
  ...params: unknown[]
) {
  const rows = await getDb()(strings, ...params);
  return rows as T[];
}

export async function queryRows<T extends DbRow = DbRow>(queryText: string, params: unknown[] = []) {
  const rows = await getDb().query(queryText, params);
  return rows as T[];
}

export async function queryOne<T extends DbRow = DbRow>(queryText: string, params: unknown[] = []) {
  const rows = await queryRows<T>(queryText, params);
  return rows[0] ?? null;
}
