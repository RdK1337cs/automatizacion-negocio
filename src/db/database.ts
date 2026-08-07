import { DatabaseSync, type StatementSync, type SQLInputValue } from 'node:sqlite';

export interface RunResult {
  changes: number;
  lastInsertRowid: number;
}

export interface Statement {
  run(...params: SQLInputValue[]): RunResult;
  get(...params: SQLInputValue[]): unknown;
  all(...params: SQLInputValue[]): unknown[];
}

export interface Database {
  pragma(source: string): void;
  exec(sql: string): void;
  prepare(sql: string): Statement;
  close(): void;
}

export function openDatabase(path: string): Database {
  const raw = new DatabaseSync(path);
  return {
    pragma(source: string) {
      raw.exec(`PRAGMA ${source}`);
    },
    exec(sql: string) {
      raw.exec(sql);
    },
    prepare(sql: string) {
      const stmt = raw.prepare(sql);
      return wrapStatement(stmt);
    },
    close() {
      raw.close();
    },
  };
}

function wrapStatement(stmt: StatementSync): Statement {
  return {
    run(...params: SQLInputValue[]): RunResult {
      const r = stmt.run(...params);
      return {
        changes: Number(r.changes),
        lastInsertRowid: Number(r.lastInsertRowid),
      };
    },
    get(...params: SQLInputValue[]): unknown {
      return stmt.get(...params);
    },
    all(...params: SQLInputValue[]): unknown[] {
      return stmt.all(...params);
    },
  };
}