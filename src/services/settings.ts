import { getDb } from '../db/db';

export interface Settings {
  business_name: string;
  business_phone: string;
  business_email: string;
  currency: string;
  low_stock_threshold: string;
  quote_validity_days: string;
  email_notify_low_stock: string;
  whatsapp_greeting: string;
  whatsapp_menu: string;
}

export function allSettings(): Record<string, string> {
  const rows = getDb().prepare('SELECT key, value FROM settings').all() as Array<{
    key: string;
    value: string;
  }>;
  const out: Record<string, string> = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}

export function getSetting(key: string): string {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? '';
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    )
    .run(key, value);
}

export function setSettings(pairs: Record<string, string>): void {
  for (const [key, value] of Object.entries(pairs)) setSetting(key, value);
}
