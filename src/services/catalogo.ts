import { getDb } from '../db/db';
import { HttpError } from '../lib/http';
import type { Base } from '../types';

export function listBases(): Base[] {
  return getDb().prepare('SELECT * FROM bases ORDER BY name').all() as Base[];
}

export function getBase(id: number): Base {
  const row = getDb().prepare('SELECT * FROM bases WHERE id = ?').get(id) as Base | undefined;
  if (!row) throw new HttpError(404, 'Base de productos no encontrada');
  return row;
}

export function createBase(name: string): Base {
  const trimmed = name.trim();
  if (trimmed.length < 2) throw new HttpError(400, 'El nombre debe tener al menos 2 caracteres');
  const res = getDb().prepare('INSERT INTO bases (name) VALUES (?)').run(trimmed);
  return getBase(Number(res.lastInsertRowid));
}

export function updateBase(id: number, input: { name?: string; active?: boolean }): Base {
  const current = getBase(id);
  getDb()
    .prepare('UPDATE bases SET name = ?, active = ? WHERE id = ?')
    .run(input.name?.trim() ?? current.name, input.active === undefined ? current.active : input.active ? 1 : 0, id);
  return getBase(id);
}

export function deleteBase(id: number): void {
  const db = getDb();
  if (db.prepare('SELECT COUNT(*) AS n FROM bases').get() as number as unknown as { n: number }) {
    const n = (db.prepare('SELECT COUNT(*) AS n FROM bases').get() as { n: number }).n;
    if (n <= 1) throw new HttpError(400, 'Debe existir al menos una base de productos');
  }
  db.prepare('DELETE FROM product_bases WHERE base_id = ?').run(id);
  db.prepare('DELETE FROM bases WHERE id = ?').run(id);
}