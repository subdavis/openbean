import { mkdirSync, readFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Db } from "./db.ts";

/**
 * node:sqlite adapter. Applies pending migration files on open, recording each one so
 * it runs exactly once — wrangler keeps its own ledger for D1, and this is the node
 * half of that. A file is not required to be re-runnable: ALTER TABLE ADD COLUMN is not.
 */
export function sqlite(path: string, migrations: string[]): Db {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("CREATE TABLE IF NOT EXISTS _migrations (file TEXT PRIMARY KEY)");

  // A database migrated before this ledger existed re-runs 0001, which is all
  // IF NOT EXISTS, and is then recorded like any other.
  const applied = new Set(
    (db.prepare("SELECT file FROM _migrations").all() as { file: string }[]).map((r) => r.file),
  );
  for (const file of migrations) {
    const name = basename(file);
    if (applied.has(name)) continue;
    db.exec(readFileSync(file, "utf8"));
    db.prepare("INSERT INTO _migrations (file) VALUES (?)").run(name);
  }

  const args = (params: unknown[]) =>
    params.map((v) => (typeof v === "boolean" ? +v : v === undefined ? null : v)) as never[];

  return {
    all: async <T>(sql: string, ...p: unknown[]) => db.prepare(sql).all(...args(p)) as T[],
    first: async <T>(sql: string, ...p: unknown[]) =>
      (db.prepare(sql).get(...args(p)) as T) ?? null,
    run: async (sql: string, ...p: unknown[]) => {
      const r = db.prepare(sql).run(...args(p));
      return { changes: Number(r.changes), id: Number(r.lastInsertRowid) };
    },
  };
}
