import { getDb } from '../db/db';
import { HttpError } from '../lib/http';
import type { Product, ProductView, DepotStock } from '../types';
import { getBase } from './catalogo';

export interface ProductInput {
  code: string;
  name: string;
  description?: string;
}

export function getProduct(id: number): Product {
  const row = getDb().prepare('SELECT * FROM products WHERE id = ?').get(id) as Product | undefined;
  if (!row) throw new HttpError(404, 'Producto no encontrado');
  return row;
}

export function createProduct(input: ProductInput): Product {
  const db = getDb();
  const exists = db.prepare('SELECT id FROM products WHERE code = ?').get(input.code);
  if (exists) throw new HttpError(409, `Ya existe un producto con el código ${input.code}`);
  const res = db
    .prepare('INSERT INTO products (code, name, description) VALUES (?, ?, ?)')
    .run(input.code, input.name, input.description ?? '');
  return getProduct(Number(res.lastInsertRowid));
}

export function updateProduct(id: number, input: Partial<ProductInput> & { active?: boolean }): Product {
  const p = getProduct(id);
  const db = getDb();
  db.prepare('UPDATE products SET code = ?, name = ?, description = ?, active = ? WHERE id = ?').run(
    input.code ?? p.code,
    input.name ?? p.name,
    input.description ?? p.description,
    input.active === undefined ? p.active : input.active ? 1 : 0,
    id
  );
  return getProduct(id);
}

export function deleteProduct(id: number): void {
  getDb().prepare('DELETE FROM products WHERE id = ?').run(id);
}

export function addProductToBase(productId: number, baseId: number, price: number, minStock = 5): void {
  const db = getDb();
  getBase(baseId);
  getProduct(productId);
  db.prepare(
    'INSERT INTO product_bases (product_id, base_id, price, min_stock) VALUES (?, ?, ?, ?) ON CONFLICT(product_id, base_id) DO UPDATE SET price = excluded.price, min_stock = excluded.min_stock'
  ).run(productId, baseId, price, minStock);
}

export function updateProductInBase(productId: number, baseId: number, price: number, minStock: number): void {
  const db = getDb();
  const res = db
    .prepare('UPDATE product_bases SET price = ?, min_stock = ? WHERE product_id = ? AND base_id = ?')
    .run(price, minStock, productId, baseId);
  if (res.changes === 0) throw new HttpError(404, 'El producto no está en esa base');
}

export function removeProductFromBase(productId: number, baseId: number): void {
  getDb().prepare('DELETE FROM product_bases WHERE product_id = ? AND base_id = ?').run(productId, baseId);
}

export function ensureProductInBase(productId: number, baseId: number): void {
  const row = getDb()
    .prepare('SELECT 1 FROM product_bases WHERE product_id = ? AND base_id = ?')
    .get(productId, baseId);
  if (!row) throw new HttpError(400, 'El producto no pertenece a la base seleccionada');
}

export function productStocks(productId: number): DepotStock[] {
  return getDb()
    .prepare(
      `SELECT ps.deposito_id, d.name AS deposito_name, ps.quantity
       FROM product_stock ps JOIN depositos d ON d.id = ps.deposito_id
       WHERE ps.product_id = ? AND ps.quantity <> 0 ORDER BY d.name`
    )
    .all(productId) as DepotStock[];
}

export function stockInDeposito(productId: number, depositoId: number): number {
  const row = getDb()
    .prepare('SELECT quantity FROM product_stock WHERE product_id = ? AND deposito_id = ?')
    .get(productId, depositoId) as { quantity: number } | undefined;
  return row?.quantity ?? 0;
}

/** Productos de una base con precio, stock total y desglose por depósito. */
export function productsForBase(baseId: number, depositoIds: number[] = []): ProductView[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT p.id, p.code, p.name, p.description, p.active, p.image, p.created_at,
              pb.price, pb.min_stock
       FROM product_bases pb
       JOIN products p ON p.id = pb.product_id
       WHERE pb.base_id = ?
       ORDER BY p.name`
    )
    .all(baseId) as Array<Product & { price: number; min_stock: number }>;
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const stocks =
    depositoIds.length > 0
      ? (db
          .prepare(
            `SELECT ps.product_id, ps.deposito_id, d.name AS deposito_name, ps.quantity
             FROM product_stock ps JOIN depositos d ON d.id = ps.deposito_id
             WHERE ps.product_id IN (${ids.map(() => '?').join(',')}) AND ps.deposito_id IN (${depositoIds.map(() => '?').join(',')})`
          )
          .all(...ids, ...depositoIds) as Array<DepotStock & { product_id: number }>)
      : [];
  const byProduct = new Map<number, DepotStock[]>();
  for (const s of stocks) {
    const list = byProduct.get(s.product_id) ?? [];
    list.push({ deposito_id: s.deposito_id, deposito_name: s.deposito_name, quantity: s.quantity });
    byProduct.set(s.product_id, list);
  }
  return rows.map((r) => {
    const byDep = byProduct.get(r.id) ?? [];
    const total = depositoIds.length > 0 ? byDep.reduce((a, b) => a + b.quantity, 0) : 0;
    return {
      id: r.id,
      code: r.code,
      name: r.name,
      description: r.description,
      active: r.active,
      image: r.image,
      created_at: r.created_at,
      base_id: baseId,
      price: r.price,
      min_stock: r.min_stock,
      stock_total: total,
      by_deposito: byDep,
    };
  });
}

export function findProductByText(text: string, products: ProductView[]): ProductView | null {
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const textN = norm(text);
  const tokens = textN
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w));

  let best: ProductView | null = null;
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

const STOPWORDS = new Set([
  'de', 'la', 'el', 'los', 'las', 'en', 'y', 'a', 'con', 'para', 'por', 'una',
  'del', 'mas', 'es', 'que', 'mira', 'tambien', 'porfa',
]);