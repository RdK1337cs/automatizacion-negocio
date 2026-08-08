import { getDb } from '../db/db';
import { HttpError } from '../lib/http';
import { getProduct } from './productos';
import { getDeposito } from './pos';
import type { ProductView } from '../types';

export function addMovement(
  productId: number,
  depositoId: number,
  type: 'in' | 'out' | 'adjust',
  quantity: number,
  note = '',
  reference = ''
): void {
  getDb()
    .prepare(
      'INSERT INTO stock_movements (product_id, deposito_id, type, quantity, note, reference) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(productId, depositoId, type, quantity, note, reference);
}

export function ensureProductStock(productId: number, depositoId: number): void {
  getDb()
    .prepare(
      'INSERT OR IGNORE INTO product_stock (product_id, deposito_id, quantity) VALUES (?, ?, 0)'
    )
    .run(productId, depositoId);
}

export function adjustStock(productId: number, depositoId: number, delta: number, note = ''): number {
  const p = getProduct(productId);
  getDeposito(depositoId);
  ensureProductStock(productId, depositoId);
  const current = getDb()
    .prepare('SELECT quantity FROM product_stock WHERE product_id = ? AND deposito_id = ?')
    .get(productId, depositoId) as { quantity: number };
  const next = current.quantity + delta;
  if (next < 0) throw new HttpError(400, `Stock insuficiente para "${p.name}" en el depósito (hay ${current.quantity})`);
  getDb()
    .prepare('UPDATE product_stock SET quantity = ? WHERE product_id = ? AND deposito_id = ?')
    .run(next, productId, depositoId);
  addMovement(productId, depositoId, delta >= 0 ? 'in' : 'out', Math.abs(delta), note || 'Ajuste manual');
  return next;
}

export function decrementStock(productId: number, depositoId: number, quantity: number, reference = ''): void {
  const p = getProduct(productId);
  ensureProductStock(productId, depositoId);
  const current = getDb()
    .prepare('SELECT quantity FROM product_stock WHERE product_id = ? AND deposito_id = ?')
    .get(productId, depositoId) as { quantity: number };
  if (current.quantity < quantity) {
    throw new HttpError(
      400,
      `Stock insuficiente para "${p.name}" en el depósito (hay ${current.quantity}, se pidieron ${quantity})`
    );
  }
  getDb()
    .prepare('UPDATE product_stock SET quantity = quantity - ? WHERE product_id = ? AND deposito_id = ?')
    .run(quantity, productId, depositoId);
  addMovement(productId, depositoId, 'out', quantity, 'Salida por pedido', reference);
}

export function restoreStock(productId: number, depositoId: number, quantity: number, reference = ''): void {
  getDb()
    .prepare('UPDATE product_stock SET quantity = quantity + ? WHERE product_id = ? AND deposito_id = ?')
    .run(quantity, productId, depositoId);
  addMovement(productId, depositoId, 'in', quantity, 'Devolución por cancelación', reference);
}

export function verifyStock(items: Array<{ productId: number; quantity: number }>, depositoId: number): void {
  for (const it of items) {
    const current = getDb()
      .prepare('SELECT quantity FROM product_stock WHERE product_id = ? AND deposito_id = ?')
      .get(it.productId, depositoId) as { quantity: number } | undefined;
    const available = current?.quantity ?? 0;
    if (it.quantity > available) {
      const p = getProduct(it.productId);
      throw new HttpError(400, `Stock insuficiente para "${p.name}" en el depósito: hay ${available}, se pidieron ${it.quantity}`);
    }
  }
}

export function lowStockProducts(baseId: number, products: ProductView[]): ProductView[] {
  return products.filter((p) => p.stock_total <= p.min_stock);
}

export function totalStock(productId: number): number {
  const row = getDb()
    .prepare('SELECT COALESCE(SUM(quantity), 0) AS n FROM product_stock WHERE product_id = ?')
    .get(productId) as { n: number };
  return row.n;
}