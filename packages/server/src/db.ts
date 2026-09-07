import type { D1Database } from "@cloudflare/workers-types";

/** The only DB surface the app uses. Implemented for D1 and for node:sqlite. */
export interface Db {
  all<T>(sql: string, ...params: unknown[]): Promise<T[]>;
  first<T>(sql: string, ...params: unknown[]): Promise<T | null>;
  run(sql: string, ...params: unknown[]): Promise<{ id: number; changes: number }>;
}

/** Both drivers only accept null/number/string/blob — normalise JS values once, here. */
export const args = (params: unknown[]) =>
  params.map((v) => (typeof v === "boolean" ? +v : v === undefined ? null : v));

export function d1(db: D1Database): Db {
  const stmt = (sql: string, params: unknown[]) => db.prepare(sql).bind(...args(params));
  return {
    all: async <T>(sql: string, ...p: unknown[]) => (await stmt(sql, p).all<T>()).results,
    first: <T>(sql: string, ...p: unknown[]) => stmt(sql, p).first<T>(),
    run: async (sql: string, ...p: unknown[]) => {
      const { meta } = await stmt(sql, p).run();
      return { changes: meta.changes, id: meta.last_row_id };
    },
  };
}
