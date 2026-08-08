import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { getDb } from '../db/db';
import { HttpError } from '../lib/http';
import { sendText } from './whatsapp';
import { getSetting } from './settings';

const CODE_TTL_MINUTES = 5;
const MAX_ATTEMPTS = 5;

export function twoFactorEnabled(): boolean {
  return getSetting('security_admin_2fa') === '1' && Boolean(getSetting('security_2fa_phone').trim());
}

/** Genera un código de 6 dígitos, lo guarda (solo su hash) y lo "envía" al celular por WhatsApp. */
export function beginTwoFactor(userId: number): string {
  const phone = getSetting('security_2fa_phone').trim();
  if (!phone) throw new HttpError(500, 'Configurá el teléfono de verificación en Ajustes');

  const code = crypto.randomInt(100000, 1000000).toString();
  const hash = bcrypt.hashSync(code, 10);
  const db = getDb();
  db.prepare("DELETE FROM auth_codes WHERE expires_at < datetime('now')").run();
  db.prepare(
    "INSERT INTO auth_codes (user_id, code_hash, expires_at) VALUES (?, ?, datetime('now', '+5 minutes'))"
  ).run(userId, hash);

  void sendText(
    phone,
    `🔐 Código de verificación: ${code}\nVence en ${CODE_TTL_MINUTES} minutos. Si no lo solicitaste, ignorá este mensaje.`
  );
  return phone;
}

/** Verifica el código pendiente más reciente del usuario. */
export function verifyTwoFactor(userId: number, code: string): void {
  const normalized = code.replace(/\D+/g, '');
  if (!/^\d{6}$/.test(normalized)) {
    throw new HttpError(400, 'El código debe tener 6 dígitos');
  }
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, code_hash, attempts, used, expires_at
       FROM auth_codes
       WHERE user_id = ?
       ORDER BY id DESC LIMIT 1`
    )
    .get(userId) as
    | { id: number; code_hash: string; attempts: number; used: number; expires_at: string }
    | undefined;

  if (!row) throw new HttpError(400, 'No hay un código pendiente. Volvé a iniciar sesión.');
  if (row.used) throw new HttpError(400, 'El código ya fue utilizado');
  if (row.expires_at < sqlNow()) {
    throw new HttpError(400, 'El código expiró. Volvé a iniciar sesión.');
  }

  if (!bcrypt.compareSync(normalized, row.code_hash)) {
    db.prepare('UPDATE auth_codes SET attempts = attempts + 1 WHERE id = ?').run(row.id);
    if (row.attempts + 1 >= MAX_ATTEMPTS) {
      db.prepare('DELETE FROM auth_codes WHERE id = ?').run(row.id);
      throw new HttpError(429, 'Demasiados intentos. Volvé a iniciar sesión.');
    }
    throw new HttpError(400, `Código incorrecto (intento ${row.attempts + 1} de ${MAX_ATTEMPTS})`);
  }

  db.prepare('UPDATE auth_codes SET used = 1, attempts = attempts + 1 WHERE id = ?').run(row.id);
}

export function phoneForTwoFactor(): string {
  return getSetting('security_2fa_phone').trim();
}

export function twoFactorStatus(): { enabled: boolean; phone: string } {
  return {
    enabled: twoFactorEnabled(),
    phone: phoneForTwoFactor(),
  };
}

function sqlNow(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}