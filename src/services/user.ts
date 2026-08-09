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
  last_ip: string;
  dni: string;
  email: string;
  phone: string;
  email_verified: number;
  phone_verified: number;
  must_change_password: number;
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
        'SELECT id, username, role, active, created_at, last_login, last_ip, dni, email, phone, email_verified, phone_verified, must_change_password FROM users ORDER BY id ASC'
      )
      .all() as unknown as Array<Omit<PublicUser, 'pos_ids'>>
  ).map((u) => ({ ...u, pos_ids: getUserPosIds(u.id) }));
}

export function getUserById(id: number): PublicUser | null {
  const row = getDb()
    .prepare(
      'SELECT id, username, role, active, created_at, last_login, last_ip, dni, email, phone, email_verified, phone_verified, must_change_password FROM users WHERE id = ?'
    )
    .get(id) as UserRow | undefined;
  return row ? toPublicFields(row) : null;
}

export function getUserByUsername(username: string): PublicUser | null {
  const row = getDb()
    .prepare(
      'SELECT id, username, role, active, created_at, last_login, last_ip, dni, email, phone, email_verified, phone_verified, must_change_password FROM users WHERE username = ?'
    )
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
    last_ip: row.last_ip,
    dni: row.dni,
    email: row.email,
    phone: row.phone,
    email_verified: row.email_verified,
    phone_verified: row.phone_verified,
    must_change_password: row.must_change_password,
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

export function touchLogin(id: number, ip = ''): void {
  getDb()
    .prepare("UPDATE users SET last_login = datetime('now'), last_ip = COALESCE(NULLIF(?, ''), last_ip) WHERE id = ?")
    .run(ip, id);
}

export function normalizeDni(dni: string): string {
  return dni.replace(/[^0-9]/g, '');
}

export function createUser(input: {
  username: string;
  password?: string;
  role: Role;
  dni: string;
  email?: string;
  phone?: string;
}): PublicUser {
  const username = input.username.trim();
  if (username.length < 3) throw new HttpError(400, 'El usuario debe tener al menos 3 caracteres');
  const dni = normalizeDni(input.dni);
  if (dni.length < 4 || dni.length > 10) {
    throw new HttpError(400, 'DNI inválido: debe ser el número de documento (4 a 10 dígitos)');
  }
  const passwordProvided = Boolean(input.password && input.password.trim());
  const password = passwordProvided ? input.password! : dni;
  if (password.length < 4) throw new HttpError(400, 'La contraseña debe tener al menos 4 caracteres');
  if (!ROLES.includes(input.role)) throw new HttpError(400, 'Rol inválido');
  const db = getDb();
  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) throw new HttpError(409, `Ya existe el usuario "${username}"`);
  const hash = bcrypt.hashSync(password, 10);
  const result = db
    .prepare(
      'INSERT INTO users (username, password_hash, role, dni, email, phone, must_change_password) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .run(username, hash, input.role, dni, input.email?.trim() ?? '', input.phone?.trim() ?? '', passwordProvided ? 0 : 1);
  const created = getUserById(Number(result.lastInsertRowid));
  if (!created) throw new HttpError(500, 'No se pudo crear el usuario');
  return created;
}

export function updateUser(
  id: number,
  patch: {
    role?: Role;
    active?: boolean;
    dni?: string;
    email?: string;
    phone?: string;
  }
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
  // Si cambia DNI, email o teléfono, se invalidan las verificaciones previas
  const dni = patch.dni !== undefined ? normalizeDni(patch.dni) : current.dni;
  if (patch.dni !== undefined && (dni.length < 4 || dni.length > 10)) {
    throw new HttpError(400, 'DNI inválido: debe tener entre 4 y 10 dígitos');
  }
  const email = (patch.email ?? current.email).trim();
  const phone = (patch.phone ?? current.phone).trim();
  const emailVerified = patch.email !== undefined && email !== current.email ? 0 : current.email_verified;
  const phoneVerified = patch.phone !== undefined && phone !== current.phone ? 0 : current.phone_verified;
  db.prepare(
    'UPDATE users SET role = ?, active = ?, dni = ?, email = ?, phone = ?, email_verified = ?, phone_verified = ? WHERE id = ?'
  ).run(role, active ? 1 : 0, dni, email, phone, emailVerified, phoneVerified, id);
  const updated = getUserById(id);
  if (!updated) throw new HttpError(500, 'No se pudo actualizar el usuario');
  return updated;
}

export function changePassword(id: number, password: string, requireChange = false): void {
  const normalized = password && password.trim() ? password.trim() : '';
  if (normalized.length < 4) throw new HttpError(400, 'La contraseña debe tener al menos 4 caracteres');
  if (!getUserById(id)) throw new HttpError(404, 'Usuario no encontrado');
  const hash = bcrypt.hashSync(normalized, 10);
  getDb()
    .prepare('UPDATE users SET password_hash = ?, must_change_password = ? WHERE id = ?')
    .run(hash, requireChange ? 1 : 0, id);
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