import { getDb } from '../db/db';
import { HttpError } from '../lib/http';
import type { PuntoVenta, Deposito, PerPosRole, UserPos } from '../types';

export function listPuntosVenta(): PuntoVenta[] {
  return getDb().prepare('SELECT * FROM puntos_venta ORDER BY name').all() as PuntoVenta[];
}

export function getPuntoVenta(id: number): PuntoVenta {
  const row = getDb().prepare('SELECT * FROM puntos_venta WHERE id = ?').get(id) as
    | PuntoVenta
    | undefined;
  if (!row) throw new HttpError(404, 'Punto de venta no encontrado');
  return row;
}

export function createPuntoVenta(input: { name: string; location?: string }): PuntoVenta {
  const res = getDb()
    .prepare('INSERT INTO puntos_venta (name, location) VALUES (?, ?)')
    .run(input.name.trim(), input.location ?? '');
  return getPuntoVenta(Number(res.lastInsertRowid));
}

export function updatePuntoVenta(id: number, input: { name?: string; location?: string; active?: boolean }): PuntoVenta {
  const current = getPuntoVenta(id);
  getDb()
    .prepare('UPDATE puntos_venta SET name = ?, location = ?, active = ? WHERE id = ?')
    .run(input.name?.trim() ?? current.name, input.location ?? current.location, input.active === undefined ? current.active : input.active ? 1 : 0, id);
  return getPuntoVenta(id);
}

export function deletePuntoVenta(id: number): void {
  getDb().prepare('DELETE FROM puntos_venta WHERE id = ?').run(id);
}

export function listDepositos(): Deposito[] {
  return getDb().prepare('SELECT * FROM depositos ORDER BY name').all() as Deposito[];
}

export function getDeposito(id: number): Deposito {
  const row = getDb().prepare('SELECT * FROM depositos WHERE id = ?').get(id) as Deposito | undefined;
  if (!row) throw new HttpError(404, 'Depósito no encontrado');
  return row;
}

export function createDeposito(input: { name: string; location?: string }): Deposito {
  const res = getDb()
    .prepare('INSERT INTO depositos (name, location) VALUES (?, ?)')
    .run(input.name.trim(), input.location ?? '');
  return getDeposito(Number(res.lastInsertRowid));
}

export function updateDeposito(id: number, input: { name?: string; location?: string; active?: boolean }): Deposito {
  const current = getDeposito(id);
  getDb()
    .prepare('UPDATE depositos SET name = ?, location = ?, active = ? WHERE id = ?')
    .run(input.name?.trim() ?? current.name, input.location ?? current.location, input.active === undefined ? current.active : input.active ? 1 : 0, id);
  return getDeposito(id);
}

export function deleteDeposito(id: number): void {
  getDb().prepare('DELETE FROM depositos WHERE id = ?').run(id);
}

export function depositosOfPos(posId: number): Deposito[] {
  return getDb()
    .prepare(
      `SELECT d.* FROM depositos d
       JOIN pos_depositos pd ON pd.deposito_id = d.id
       WHERE pd.pos_id = ? ORDER BY d.name`
    )
    .all(posId) as Deposito[];
}

export function setPosDepositos(posId: number, depositoIds: number[]): void {
  const db = getDb();
  db.prepare('DELETE FROM pos_depositos WHERE pos_id = ?').run(posId);
  const ins = db.prepare('INSERT OR IGNORE INTO pos_depositos (pos_id, deposito_id) VALUES (?, ?)');
  for (const id of [...new Set(depositoIds)]) ins.run(posId, id);
}

export function userPosList(userId: number): UserPos[] {
  return getDb()
    .prepare(
      `SELECT up.pos_id, p.name AS pos_name, up.role FROM user_pos up
       JOIN puntos_venta p ON p.id = up.pos_id
       WHERE up.user_id = ?`
    )
    .all(userId) as UserPos[];
}

export function setUserPos(userId: number, posId: number, role: PerPosRole | null): void {
  const db = getDb();
  if (role === null) {
    db.prepare('DELETE FROM user_pos WHERE user_id = ? AND pos_id = ?').run(userId, posId);
    return;
  }
  db.prepare(
    'INSERT INTO user_pos (user_id, pos_id, role) VALUES (?, ?, ?) ON CONFLICT(user_id, pos_id) DO UPDATE SET role = excluded.role'
  ).run(userId, posId, role);
}

export function getUserPuntoVentaIds(userId: number): number[] {
  return (
    getDb().prepare('SELECT pos_id FROM user_pos WHERE user_id = ?').all(userId) as Array<{ pos_id: number }>
  ).map((r) => r.pos_id);
}

export function getDepositoIdsByPos(posId: number): number[] {
  return (
    getDb().prepare('SELECT deposito_id FROM pos_depositos WHERE pos_id = ?').all(posId) as Array<{
      deposito_id: number;
    }>
  ).map((r) => r.deposito_id);
}

export function setPosDepositosReplace(posId: number, depositoIds: number[]): void {
  const db = getDb();
  db.prepare('DELETE FROM pos_depositos WHERE pos_id = ?').run(posId);
  const ins = db.prepare('INSERT OR IGNORE INTO pos_depositos (pos_id, deposito_id) VALUES (?, ?)');
  for (const id of [...new Set(depositoIds)]) ins.run(posId, id);
}

export function setPuntoVentaUsers(
  posId: number,
  assignments: Array<{ userId: number; role: PerPosRole }>
): void {
  const db = getDb();
  getPuntoVenta(posId);
  db.prepare('DELETE FROM user_pos WHERE pos_id = ?').run(posId);
  const ins = db.prepare('INSERT OR IGNORE INTO user_pos (user_id, pos_id, role) VALUES (?, ?, ?)');
  for (const a of assignments) ins.run(a.userId, posId, a.role);
}

export interface PosDetails extends PuntoVenta {
  depositos: Deposito[];
  users: Array<{ id: number; username: string; role: PerPosRole }>;
}

export function puntoVentaWithDetails(id: number): PosDetails | null {
  const row = getDb().prepare('SELECT * FROM puntos_venta WHERE id = ?').get(id) as PuntoVenta | undefined;
  if (!row) return null;
  const db = getDb();
  const depositos = db
    .prepare(
      `SELECT d.* FROM depositos d JOIN pos_depositos pd ON pd.deposito_id = d.id WHERE pd.pos_id = ? ORDER BY d.name`
    )
    .all(id) as Deposito[];
  const users = db
    .prepare(
      `SELECT u.id, u.username, up.role FROM user_pos up JOIN users u ON u.id = up.user_id WHERE up.pos_id = ? ORDER BY u.username`
    )
    .all(id) as Array<{ id: number; username: string; role: PerPosRole }>;
  return { ...row, depositos, users };
}