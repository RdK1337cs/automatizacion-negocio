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

function hasColumn(database: Database, table: string, column: string): boolean {
  const cols = database.prepare(`PRAGMA table_info(${table})`).all() as unknown as Array<{
    name: string;
  }>;
  return cols.some((c) => c.name === column);
}

function tableExists(database: Database, name: string): boolean {
  return Boolean(
    database
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
      .get(name)
  );
}

function migrate(database: Database): void {
  for (const t of ['orders', 'quotes']) {
    if (tableExists(database, t)) {
      if (!hasColumn(database, t, 'pos_id')) database.exec(`ALTER TABLE ${t} ADD COLUMN pos_id INTEGER`);
      if (!hasColumn(database, t, 'base_id')) database.exec(`ALTER TABLE ${t} ADD COLUMN base_id INTEGER`);
      if (!hasColumn(database, t, 'deposito_id')) database.exec(`ALTER TABLE ${t} ADD COLUMN deposito_id INTEGER`);
    }
  }
  database.exec('CREATE INDEX IF NOT EXISTS idx_orders_pos ON orders(pos_id)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_quotes_pos ON quotes(pos_id)');
  if (tableExists(database, 'stock_movements') && !hasColumn(database, 'stock_movements', 'deposito_id')) {
    database.exec('ALTER TABLE stock_movements ADD COLUMN deposito_id INTEGER REFERENCES depositos(id)');
  }
  database.exec('CREATE INDEX IF NOT EXISTS idx_movements_deposito ON stock_movements(deposito_id)');

  // Datos de la v1.0.0: cada producto queda con un registro por defecto
  // en la base 1 ("General") con su precio, y stock en el depósito 1.
  const baseId = seedRow(database, 'bases', 'name', 'General');
  const depId = seedRow(database, 'depositos', 'name', 'Depósito Principal');
  const posId = seedRow(database, 'puntos_venta', 'name', 'POS Principal');
  database
    .prepare('INSERT OR IGNORE INTO pos_depositos (pos_id, deposito_id) VALUES (?, ?)')
    .run(posId, depId);

  const legacyPrice = tableExists(database, 'products') && hasColumn(database, 'products', 'price');
  const legacyStock = tableExists(database, 'products') && hasColumn(database, 'products', 'stock');
  if (legacyPrice) {
    database
      .prepare(
        'INSERT OR IGNORE INTO product_bases (product_id, base_id, price, min_stock) SELECT id, ?, price, min_stock FROM products'
      )
      .run(baseId);
  } else {
    database
      .prepare('INSERT OR IGNORE INTO product_bases (product_id, base_id, price, min_stock) SELECT id, ?, 0, 5 FROM products')
      .run(baseId);
  }
  if (legacyStock) {
    database
      .prepare(
        'INSERT OR IGNORE INTO product_stock (product_id, deposito_id, quantity) SELECT id, ?, stock FROM products'
      )
      .run(depId);
  } else {
    database
      .prepare('INSERT OR IGNORE INTO product_stock (product_id, deposito_id, quantity) SELECT id, ?, 0 FROM products')
      .run(depId);
  }
}

function seedRow(database: Database, table: string, col: string, name: string): number {
  const existing = database.prepare(`SELECT id FROM ${table} ORDER BY id ASC LIMIT 1`).get() as
    | { id: number }
    | undefined;
  if (existing) return existing.id;
  const res = database.prepare(`INSERT INTO ${table} (${col}) VALUES (?)`).run(name);
  return Number(res.lastInsertRowid);
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
    whatsapp_default_pos: '1',
    whatsapp_default_base: '1',
    whatsapp_default_deposito: '1',
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