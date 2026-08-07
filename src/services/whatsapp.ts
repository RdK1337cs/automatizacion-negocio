import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import axios from 'axios';
import { config } from '../config';
import { getDb } from '../db/db';
import type { Product } from '../types';

export function sendEnabled(): boolean {
  return Boolean(config.whatsapp.accessToken && config.whatsapp.phoneNumberId);
}

interface SendResult {
  ok: boolean;
  id?: string;
  sandbox?: boolean;
  error?: string;
}

export async function sendText(to: string, body: string): Promise<SendResult> {
  if (!sendEnabled()) {
    return logOut(to, body, { sandbox: true, note: 'Sin credenciales de WhatsApp (modo simulacion)' });
  }
  try {
    const api = `https://graph.facebook.com/${config.whatsapp.apiVersion}/${config.whatsapp.phoneNumberId}/messages`;
    const resp = await axios.post(
      api,
      {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body },
      },
      { headers: { Authorization: `Bearer ${config.whatsapp.accessToken}` } }
    );
    const id = resp.data?.messages?.[0]?.id as string | undefined;
    return logOut(to, body, { id });
  } catch (err) {
    const e = err as { response?: { data?: unknown }; message?: string };
    const msg = String(e.response?.data ?? e.message ?? err);
    return logOut(to, body, { error: msg });
  }
}

export async function sendMedia(
  to: string,
  file: Buffer,
  filename: string,
  caption: string
): Promise<SendResult> {
  if (!sendEnabled()) {
    return logOut(to, caption, {
      sandbox: true,
      note: `Adjunto simulado: ${filename} (no se envio sin credenciales)`,
    });
  }
  try {
    const base = `https://graph.facebook.com/${config.whatsapp.apiVersion}/${config.whatsapp.phoneNumberId}`;
    const up = await axios.post(
      `${base}/media`,
      {
        messaging_product: 'whatsapp',
        file,
        type: 'application/pdf',
      },
      {
        headers: {
          Authorization: `Bearer ${config.whatsapp.accessToken}`,
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    const mediaId = up.data?.id as string | undefined;
    if (!mediaId) throw new Error('No se obtuvo media id');
    const resp = await axios.post(
      `${base}/messages`,
      {
        messaging_product: 'whatsapp',
        to,
        type: 'document',
        document: { id: mediaId, filename, caption },
      },
      { headers: { Authorization: `Bearer ${config.whatsapp.accessToken}` } }
    );
    const id = resp.data?.messages?.[0]?.id as string | undefined;
    return logOut(to, `📄 ${caption} (${filename})`, { id, note: 'document' });
  } catch (err) {
    const e = err as { response?: { data?: unknown }; message?: string };
    const msg = String(e.response?.data ?? e.message ?? '');
    return logOut(to, `📄 ${caption} (${filename})`, { error: msg, note: 'document' });
  }
}

export function logIn(from: string, body: string, extra?: { intent?: string }): number {
  const res = getDb()
    .prepare(
      'INSERT INTO messages (direction, from_number, body, intent) VALUES (\'in\', ?, ?, ?)'
    )
    .run(from, body, extra?.intent ?? '');
  return Number(res.lastInsertRowid);
}

function logOut(
  to: string,
  body: string,
  extra?: { id?: string; sandbox?: boolean; error?: string; note?: string }
): SendResult {
  const meta = [extra?.note, extra?.id].filter(Boolean).join(' | ');
  const err = extra?.error ? String(extra.error).slice(0, 500) : '';
  getDb()
    .prepare('INSERT INTO messages (direction, to_number, body, meta, error) VALUES (\'out\', ?, ?, ?, ?)')
    .run(to, body, meta || (extra?.sandbox ? 'sandbox' : ''), err);
  if (extra?.error) console.error('[WhatsApp send error]', err);
  return { ok: !extra?.error, id: extra?.id, sandbox: extra?.sandbox, error: extra?.error };
}

export function verifyWebhook(req: Request, res: Response): void {
  const mode = req.query['hub.mode'] as string;
  const token = req.query['hub.verify_token'] as string;
  const challenge = req.query['hub.challenge'] as string;
  if (mode === 'subscribe' && token === config.whatsapp.verifyToken) {
    res.status(200).send(challenge);
    return;
  }
  res.status(403).send('Verificacion fallida');
}

export function isSignatureValid(req: Request, rawBody: string): boolean {
  if (!config.whatsapp.appSecret) return true;
  const signature = (req.headers['x-hub-signature-256'] as string) || '';
  if (!signature.startsWith('sha256=')) return false;
  const expected = crypto
    .createHmac('sha256', config.whatsapp.appSecret)
    .update(rawBody)
    .digest('hex');
  const a = Buffer.from(signature.slice(7));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const STOPWORDS = new Set([
  'de', 'la', 'el', 'los', 'las', 'en', 'y', 'a', 'con', 'para', 'por', 'una',
  'del', 'mas', 'es', 'que', 'mira', 'tambien', 'porfa',
]);

export function findProductByText(text: string, products: Product[]): Product | null {
  const norm = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const textN = norm(text);
  const tokens = textN
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w))
    .filter((w) => w.length > 2 || /^[a-z]{2,3}$/.test(w));

  let best: Product | null = null;
  let bestScore = 0;

  for (const p of products) {
    const name = norm(p.name);
    if (p.code && textN.includes(p.code.toLowerCase())) {
      if (5 > bestScore) {
        bestScore = 5;
        best = p;
      }
      continue;
    }
    if (textN.includes(name)) {
      if (10 > bestScore) {
        bestScore = 10;
        best = p;
      }
      continue;
    }
    let score = 0;
    const nameWords = name.split(/[^a-z0-9]+/).filter(Boolean);
    for (const w of tokens) if (nameWords.includes(w)) score++;
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best && bestScore > 0 ? best : null;
}