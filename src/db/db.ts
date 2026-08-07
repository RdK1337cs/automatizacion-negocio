import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { config } from '../config';
import { openDatabase, type Database } from './database';

let db: Database | null = null;

export function dbPath(): string {
  if (config.dbFile === ':memory:') return ':memory:';
  return path.join(config.dataDir, config.dbFile);
}

export function getDb(): Database {
  if (db) return db;
  if (config.dbFile !== ':memory:') {
    fs.mkdirSync(config.dataDir, { recursive: true });
  }
  db = openDatabase(dbPath());
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  applySchema(db);
  applyDefaults(db);
  return db;
}

export function applySchema(database: Database): void {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  database.exec(sql);
  migrate(database);
}

function migrate(database: Database): void {
  const cols = database.prepare('PRAGMA table_info(products)').all() as unknown as Array<{
    name: string;
  }>;
  if (!cols.some((c) => c.name === 'image')) {
    database.exec('ALTER TABLE products ADD COLUMN image TEXT');
  }
}

function applyDefaults(database: Database): void {
  const defaults: Record<string, string> = {
    business_name: 'Mi Negocio',
    business_phone: '',
    business_email: '',
    currency: 'ARS',
    low_stock_threshold: '5',
    quote_validity_days: '7',
    email_notify_low_stock: '1',
    whatsapp_greeting:
      '¡Hola! Bienvenido a {business}. Puedo ayudarte con precios, stock y pedidos.',
    whatsapp_menu:
      'Estas son las opciones que entiendo:\n' +
      '• "precio de <producto>" — te paso el precio\n' +
      '• "¿tenés <producto>?" — te informo el stock\n' +
      '• "necesito <cantidad> de <producto>" — te tomo el pedido\n' +
      '• "presupuesto de <producto>" — te armo una cotización',
  };
  const insert = database.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [key, value] of Object.entries(defaults)) insert.run(key, value);

  const userCount = database.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number };
  if (userCount.n === 0) {
    const hash = bcrypt.hashSync(config.adminPassword, 10);
    database
      .prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)')
      .run(config.adminUser, hash, 'admin');
    console.log(`Se creó el usuario administrador inicial "${config.adminUser}".`);
  }
}