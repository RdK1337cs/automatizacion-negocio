import bcrypt from 'bcryptjs';
import { getDb } from '../db/db';
import { HttpError } from '../lib/http';

export const ROLES = ['admin', 'operador', 'lector'] as const;
export type Role = (typeof ROLES)[number];

export interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  role: Role;
  active: number;
  created_at: string;
  last_login: string | null;
}

export type PublicUser = Omit<UserRow, 'password_hash'> & { pos_ids: number[] };

const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrador',
  operador: 'Operador',
  lector: 'Solo lectura',
};

export function getUserPosIds(userId: number): number[] {
  return (
    getDb()
      .prepare('SELECT pos_id FROM user_pos WHERE user_id = ?')
      .all(userId) as Array<{ pos_id: number }>
  ).map((r) => r.pos_id);
}

export function assignUserPositions(userId: number, posIds: number[]): void {
  if (!getUserById(userId)) throw new HttpError(404, 'Usuario no encontrado');
  const db = getDb();
  db.prepare('DELETE FROM user_pos WHERE user_id = ?').run(userId);
  for (const posId of posIds) {
    db.prepare('INSERT INTO user_pos (user_id, pos_id) VALUES (?, ?)').run(userId, posId);
  }
}

export function roleLabel(role: Role): string {
  return ROLE_LABELS[role] ?? role;
}

export function listUsers(): PublicUser[] {
  return (
    getDb()
      .prepare(
        'SELECT id, username, role, active, created_at, last_login FROM users ORDER BY id ASC'
      )
      .all() as unknown as Array<Omit<PublicUser, 'pos_ids'>>
  ).map((u) => ({ ...u, pos_ids: getUserPosIds(u.id) }));
}

export function getUserById(id: number): PublicUser | null {
  const row = getDb()
    .prepare('SELECT id, username, role, active, created_at, last_login FROM users WHERE id = ?')
    .get(id) as UserRow | undefined;
  return row ? toPublicFields(row) : null;
}

export function getUserByUsername(username: string): PublicUser | null {
  const row = getDb()
    .prepare('SELECT id, username, role, active, created_at, last_login FROM users WHERE username = ?')
    .get(username) as UserRow | undefined;
  return row ? toPublicFields(row) : null;
}

function toPublicFields(row: UserRow): PublicUser {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    active: row.active,
    created_at: row.created_at,
    last_login: row.last_login,
    pos_ids: getUserPosIds(row.id),
  };
}

export function checkCredentials(username: string, password: string): PublicUser | null {
  const row = getDb()
    .prepare('SELECT * FROM users WHERE username = ?')
    .get(username) as UserRow | undefined;
  if (!row || !row.active) return null;
  const ok = bcrypt.compareSync(password, row.password_hash);
  return ok ? toPublicFields(row) : null;
}

export function touchLogin(id: number): void {
  getDb().prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(id);
}

export function createUser(input: { username: string; password: string; role: Role }): PublicUser {
  const username = input.username.trim();
  if (username.length < 3) throw new HttpError(400, 'El usuario debe tener al menos 3 caracteres');
  if (input.password.length < 4) throw new HttpError(400, 'La contraseña debe tener al menos 4 caracteres');
  if (!ROLES.includes(input.role)) throw new HttpError(400, 'Rol inválido');
  const db = getDb();
  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) throw new HttpError(409, `Ya existe el usuario "${username}"`);
  const hash = bcrypt.hashSync(input.password, 10);
  const result = db
    .prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)')
    .run(username, hash, input.role);
  const created = getUserById(Number(result.lastInsertRowid));
  if (!created) throw new HttpError(500, 'No se pudo crear el usuario');
  return created;
}

export function updateUser(
  id: number,
  patch: { role?: Role; active?: boolean }
): PublicUser {
  const db = getDb();
  const current = getUserById(id);
  if (!current) throw new HttpError(404, 'Usuario no encontrado');
  const role = patch.role ?? current.role;
  const active = patch.active === undefined ? Boolean(current.active) : patch.active;
  if (!ROLES.includes(role)) throw new HttpError(400, 'Rol inválido');
  if (current.role === 'admin' && (role !== 'admin' || !active)) {
    ensureAnotherAdmin(id);
  }
  db.prepare('UPDATE users SET role = ?, active = ? WHERE id = ?').run(role, active ? 1 : 0, id);
  const updated = getUserById(id);
  if (!updated) throw new HttpError(500, 'No se pudo actualizar el usuario');
  return updated;
}

export function changePassword(id: number, password: string): void {
  if (password.length < 4) throw new HttpError(400, 'La contraseña debe tener al menos 4 caracteres');
  if (!getUserById(id)) throw new HttpError(404, 'Usuario no encontrado');
  const hash = bcrypt.hashSync(password, 10);
  getDb().prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, id);
}

export function deleteUser(id: number): void {
  const current = getUserById(id);
  if (!current) throw new HttpError(404, 'Usuario no encontrado');
  if (current.role === 'admin') ensureAnotherAdmin(id);
  getDb().prepare('DELETE FROM users WHERE id = ?').run(id);
}

function ensureAnotherAdmin(exceptId: number): void {
  const admins = getDb()
    .prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1 AND id != ?")
    .get(exceptId) as { n: number };
  if (admins.n === 0) {
    throw new HttpError(400, 'Debe existir al menos un administrador activo');
  }
}