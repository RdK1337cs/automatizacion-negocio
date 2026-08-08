PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'operador' CHECK (role IN ('admin','operador','lector')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login TEXT
);

-- Puntos de venta (lugares físicos donde se vende)
CREATE TABLE IF NOT EXISTS puntos_venta (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  location TEXT DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Depósitos / seccionales de venta (lugares físicos donde está el stock)
CREATE TABLE IF NOT EXISTS depositos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  location TEXT DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Bases de datos de productos (catálogos seleccionables al presupuestar)
CREATE TABLE IF NOT EXISTS bases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Un punto de venta puede vender desde uno o varios depósitos
CREATE TABLE IF NOT EXISTS pos_depositos (
  pos_id INTEGER NOT NULL REFERENCES puntos_venta(id) ON DELETE CASCADE,
  deposito_id INTEGER NOT NULL REFERENCES depositos(id) ON DELETE CASCADE,
  UNIQUE (pos_id, deposito_id)
);

-- Permisos de cada usuario por punto de venta (rol distinto por POS)
CREATE TABLE IF NOT EXISTS user_pos (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pos_id INTEGER NOT NULL REFERENCES puntos_venta(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'operador' CHECK (role IN ('operador','lector')),
  UNIQUE (user_id, pos_id)
);

-- Productos compartidos (la definición es única)
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  image TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Precio y stock mínimo por base de datos de productos
CREATE TABLE IF NOT EXISTS product_bases (
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  base_id INTEGER NOT NULL REFERENCES bases(id) ON DELETE CASCADE,
  price REAL NOT NULL DEFAULT 0,
  min_stock INTEGER NOT NULL DEFAULT 5,
  UNIQUE (product_id, base_id)
);

-- Cantidad física por depósito
CREATE TABLE IF NOT EXISTS product_stock (
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  deposito_id INTEGER NOT NULL REFERENCES depositos(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 0,
  UNIQUE (product_id, deposito_id)
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id),
  deposito_id INTEGER REFERENCES depositos(id),
  type TEXT NOT NULL CHECK (type IN ('in','out','adjust')),
  quantity INTEGER NOT NULL,
  note TEXT DEFAULT '',
  reference TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number TEXT NOT NULL,
  customer_name TEXT NOT NULL DEFAULT '',
  customer_phone TEXT DEFAULT '',
  customer_email TEXT DEFAULT '',
  source TEXT NOT NULL DEFAULT 'panel' CHECK (source IN ('panel','whatsapp','api')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','cancelled','delivered')),
  pos_id INTEGER REFERENCES puntos_venta(id),
  base_id INTEGER REFERENCES bases(id),
  deposito_id INTEGER REFERENCES depositos(id),
  total REAL NOT NULL DEFAULT 0,
  notes TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  subtotal REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS quotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_number TEXT NOT NULL,
  customer_name TEXT NOT NULL DEFAULT '',
  customer_phone TEXT DEFAULT '',
  customer_email TEXT DEFAULT '',
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','whatsapp','panel')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','approved','rejected','expired')),
  valid_days INTEGER NOT NULL DEFAULT 7,
  pos_id INTEGER REFERENCES puntos_venta(id),
  base_id INTEGER REFERENCES bases(id),
  deposito_id INTEGER REFERENCES depositos(id),
  total REAL NOT NULL DEFAULT 0,
  notes TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS quote_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id),
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  subtotal REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  direction TEXT NOT NULL CHECK (direction IN ('in','out')),
  from_number TEXT DEFAULT '',
  to_number TEXT DEFAULT '',
  type TEXT DEFAULT 'text',
  body TEXT DEFAULT '',
  intent TEXT DEFAULT '',
  meta TEXT DEFAULT '',
  error TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS emails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  to_email TEXT NOT NULL,
  subject TEXT DEFAULT '',
  body TEXT DEFAULT '',
  provider TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','failed','sandbox')),
  error TEXT DEFAULT '',
  meta TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_products_active ON products(active);
CREATE INDEX IF NOT EXISTS idx_product_bases_base ON product_bases(base_id);
CREATE INDEX IF NOT EXISTS idx_product_stock_deposito ON product_stock(deposito_id);
CREATE INDEX IF NOT EXISTS idx_movements_product ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);