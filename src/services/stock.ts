import { getDb } from '../db/db';
import { HttpError } from '../lib/http';
import { getSetting } from './settings';
import type { Product } from '../types';

export interface StockCheckItem {
  productId: number;
  quantity: number;
}

export function getProduct(id: number): Product {
  const row = getDb().prepare('SELECT * FROM products WHERE id = ?').get(id) as
    | Product
    | undefined;
  if (!row) throw new HttpError(404, 'Producto no encontrado');
  return row;
}

export function listActiveProducts(): Product[] {
  return getDb()
    .prepare('SELECT * FROM products WHERE active = 1 ORDER BY name')
    .all() as Product[];
}

export function addMovement(
  productId: number,
  type: 'in' | 'out' | 'adjust',
  quantity: number,
  note = '',
  reference = ''
): void {
  getDb()
    .prepare(
      'INSERT INTO stock_movements (product_id, type, quantity, note, reference) VALUES (?, ?, ?, ?, ?)'
    )
    .run(productId, type, quantity, note, reference);
}

export function adjustStock(productId: number, delta: number, note = ''): Product {
  const p = getProduct(productId);
  const next = p.stock + delta;
  if (next < 0) throw new HttpError(400, `Stock insuficiente para "${p.name}" (hay ${p.stock})`);
  getDb().prepare('UPDATE products SET stock = ? WHERE id = ?').run(next, productId);
  addMovement(productId, delta >= 0 ? 'in' : 'out', Math.abs(delta), note || 'Ajuste manual');
  return getProduct(productId);
}

export function verifyStock(items: StockCheckItem[]): void {
  const tx = getDb();
  for (const it of items) {
    const p = getProduct(it.productId);
    if (it.quantity > p.stock) {
      throw new HttpError(
        400,
        `Stock insuficiente para "${p.name}": hay ${p.stock}, se pidieron ${it.quantity}`
      );
    }
  }
  void tx;
}

export function decrementStock(
  productId: number,
  quantity: number,
  reference = ''
): void {
  const p = getProduct(productId);
  const next = p.stock - quantity;
  if (next < 0) {
    throw new HttpError(400, `Stock insuficiente para "${p.name}" (hay ${p.stock})`);
  }
  getDb().prepare('UPDATE products SET stock = ? WHERE id = ?').run(next, productId);
  addMovement(productId, 'out', quantity, 'Salida por pedido', reference);
}

export function restoreStock(productId: number, quantity: number, reference = ''): void {
  getDb().prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(quantity, productId);
  addMovement(productId, 'in', quantity, 'Devolucion por cancelacion', reference);
}

export function lowStockProducts(): Product[] {
  const threshold = Number(getSetting('low_stock_threshold') || 5);
  return getDb()
    .prepare('SELECT * FROM products WHERE active = 1 AND stock <= min_stock ORDER BY stock ASC')
    .all() as Product[];
}
