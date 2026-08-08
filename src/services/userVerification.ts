import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { getDb } from '../db/db';
import { HttpError } from '../lib/http';
import { getUserById } from './user';
import { sendEmail } from './email';
import { sendText } from './whatsapp';

export type VerifyChannel = 'email' | 'sms';

const CODE_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;

/** Envía un código de verificación al email o teléfono del usuario (simulado en Logs). */
export function sendVerificationCode(userId: number, channel: VerifyChannel): void {
  const user = getUserById(userId);
  if (!user) throw new HttpError(404, 'Usuario no encontrado');
  if (channel === 'email' && !user.email) {
    throw new HttpError(400, `El usuario "${user.username}" no tiene email cargado`);
  }
  if (channel === 'sms' && !user.phone) {
    throw new HttpError(400, `El usuario "${user.username}" no tiene teléfono cargado`);
  }

  const code = crypto.randomInt(100000, 1000000).toString();
  const hash = bcrypt.hashSync(code, 10);
  const db = getDb();
  db.prepare("DELETE FROM user_verifications WHERE expires_at < datetime('now')").run();
  db.prepare('DELETE FROM user_verifications WHERE user_id = ? AND channel = ?').run(userId, channel);
  db.prepare(
    "INSERT INTO user_verifications (user_id, channel, code_hash, expires_at) VALUES (?, ?, ?, datetime('now', '+10 minutes'))"
  ).run(userId, channel, hash);

  const label = channel === 'email' ? 'email' : 'WhatsApp';
  if (channel === 'email') {
    void sendEmail({
      to: user.email,
      subject: 'Código de verificación',
      html: `<p>Tu código de verificación es:</p><h2 style="letter-spacing:4px;font-size:28px">${code}</h2><p>Vence en ${CODE_TTL_MINUTES} minutos. Si no lo solicitaste, ignorá este mensaje.</p>`,
    });
  } else {
    void sendText(
      user.phone,
      `🔐 Código de verificación: ${code}\nVence en ${CODE_TTL_MINUTES} minutos. Si no lo solicitaste, ignorá este mensaje.`
    );
  }
  console.log(`[verificacion ${label}] usuario=${user.username} codigo=${code}`);
}

/** Confirma el código y marca al usuario como verificado en ese canal. */
export function confirmVerificationCode(userId: number, channel: VerifyChannel, code: string): void {
  const normalized = code.replace(/\D+/g, '');
  if (!/^\d{6}$/.test(normalized)) {
    throw new HttpError(400, 'El código debe tener 6 dígitos');
  }
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, code_hash, attempts, used, expires_at
       FROM user_verifications
       WHERE user_id = ? AND channel = ?
       ORDER BY id DESC LIMIT 1`
    )
    .get(userId, channel) as
    | { id: number; code_hash: string; attempts: number; used: number; expires_at: string }
    | undefined;

  if (!row) throw new HttpError(400, 'No hay un código pendiente para este canal. Enviá uno nuevo.');
  if (row.used) throw new HttpError(400, 'El código ya fue utilizado');
  if (row.expires_at < new Date().toISOString().replace('T', ' ').slice(0, 19)) {
    throw new HttpError(400, 'El código expiró. Enviá uno nuevo.');
  }

  if (!bcrypt.compareSync(normalized, row.code_hash)) {
    db.prepare('UPDATE user_verifications SET attempts = attempts + 1 WHERE id = ?').run(row.id);
    if (row.attempts + 1 >= MAX_ATTEMPTS) {
      db.prepare('DELETE FROM user_verifications WHERE id = ?').run(row.id);
      throw new HttpError(429, 'Demasiados intentos. Enviá un código nuevo.');
    }
    throw new HttpError(400, `Código incorrecto (intento ${row.attempts + 1} de ${MAX_ATTEMPTS})`);
  }

  db.prepare('UPDATE user_verifications SET used = 1, attempts = attempts + 1 WHERE id = ?').run(row.id);
  const col = channel === 'email' ? 'email_verified' : 'phone_verified';
  db.prepare(`UPDATE users SET ${col} = 1 WHERE id = ?`).run(userId);
}