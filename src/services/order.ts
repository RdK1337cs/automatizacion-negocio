import { getDb } from '../db/db';
import { HttpError } from '../lib/http';
import {
  verifyStock,
  decrementStock,
  restoreStock,
} from './stock';
import { getProduct, ensureProductInBase, productsForBase } from './productos';
import { getDeposito, getPuntoVenta } from './pos';
import { getBase } from './catalogo';
import { sendEmail, buildOrderConfirmationHtml, buildLowStockHtml } from './email';
import { getSetting } from './settings';
import type { Order, OrderItem, ProductView } from '../types';

export interface OrderDraftItem {
  productId: number;
  quantity: number;
}

export interface CreateOrderInput {
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  source: 'panel' | 'whatsapp' | 'api';
  notes?: string;
  posId: number;
  baseId: number;
  depositoId: number;
  items: OrderDraftItem[];
  autoConfirm?: boolean;
}

export function nextOrderNumber(): string {
  const row = getDb().prepare('SELECT COUNT(*) AS n FROM orders').get() as { n: number };
  return `ORD-${String(row.n + 1).padStart(4, '0')}`;
}

export function createOrder(input: CreateOrderInput): Order {
  const db = getDb();
  getPuntoVenta(input.posId);
  getBase(input.baseId);
  getDeposito(input.depositoId);
  const items: OrderItem[] = input.items.map((it) => {
    ensureProductInBase(it.productId, input.baseId);
    const p = getProduct(it.productId);
    const price = basePrice(it.productId, input.baseId);
    const quantity = Math.max(1, Math.round(it.quantity));
    return {
      product_id: p.id,
      product_name: p.name,
      quantity,
      unit_price: price,
      subtotal: price * quantity,
    };
  });
  const total = items.reduce((acc, it) => acc + it.subtotal, 0);
  const number = nextOrderNumber();
  const status = input.autoConfirm ? 'confirmed' : 'pending';

  const res = db
    .prepare(
      `INSERT INTO orders (order_number, customer_name, customer_phone, customer_email, source, status, pos_id, base_id, deposito_id, total, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      number,
      input.customerName,
      input.customerPhone ?? '',
      input.customerEmail ?? '',
      input.source,
      status,
      input.posId,
      input.baseId,
      input.depositoId,
      total,
      input.notes ?? ''
    );
  const orderId = Number(res.lastInsertRowid);
  const ins = db.prepare(
    'INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, subtotal) VALUES (?, ?, ?, ?, ?, ?)'
  );
  for (const it of items) ins.run(orderId, it.product_id, it.product_name, it.quantity, it.unit_price, it.subtotal);

  if (status === 'confirmed') {
    verifyStock(items.map((i) => ({ productId: i.product_id, quantity: i.quantity })), input.depositoId);
    applyStockOut(orderId);
    notifyOrderConfirmed(orderId);
  }
  return getOrder(orderId) as Order;
}

export function getOrder(id: number): Order | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(id) as Order | undefined;
  if (!row) return null;
  row.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(id) as OrderItem[];
  return row;
}

export function listOrders(posId?: number): Order[] {
  const db = getDb();
  const orders = (
    posId
      ? db.prepare('SELECT * FROM orders WHERE pos_id = ? ORDER BY id DESC').all(posId)
      : db.prepare('SELECT * FROM orders ORDER BY id DESC').all()
  ) as Order[];
  const items = db.prepare('SELECT * FROM order_items ORDER BY id').all() as OrderItem[];
  const byOrder = new Map<number, OrderItem[]>();
  for (const it of items) {
    const list = byOrder.get(it.order_id ?? 0) ?? [];
    list.push(it);
    byOrder.set(it.order_id ?? 0, list);
  }
  for (const o of orders) o.items = byOrder.get(o.id) ?? [];
  return orders;
}

export function confirmOrder(id: number): Order {
  const db = getDb();
  const order = getOrder(id);
  if (!order) throw new HttpError(404, 'Pedido no encontrado');
  if (order.status === 'cancelled') throw new HttpError(400, 'Un pedido cancelado no se puede confirmar');
  if (order.status === 'confirmed') return order;
  if (!order.deposito_id) throw new HttpError(400, 'El pedido no tiene depósito asignado');
  const items = (order.items ?? []) as OrderItem[];
  verifyStock(items.map((it) => ({ productId: it.product_id, quantity: it.quantity })), order.deposito_id);
  db.prepare("UPDATE orders SET status = 'confirmed', updated_at = datetime('now') WHERE id = ?").run(id);
  applyStockOut(id);
  notifyOrderConfirmed(id);
  return getOrder(id) as Order;
}

export function cancelOrder(id: number): Order {
  const db = getDb();
  const order = getOrder(id);
  if (!order) throw new HttpError(404, 'Pedido no encontrado');
  db.prepare("UPDATE orders SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?").run(id);
  if (order.status === 'confirmed' && order.deposito_id) {
    const items = (order.items ?? []) as OrderItem[];
    for (const it of items) restoreStock(it.product_id, order.deposito_id, it.quantity, `Pedido ${order.order_number}`);
  }
  return getOrder(id) as Order;
}

export function deleteOrder(id: number): void {
  getDb().prepare('DELETE FROM orders WHERE id = ?').run(id);
}

export function updateStatus(id: number, status: Order['status']): Order {
  if (status === 'confirmed') return confirmOrder(id);
  if (status === 'cancelled') return cancelOrder(id);
  getDb().prepare('UPDATE orders SET status = ?, updated_at = datetime(\'now\') WHERE id = ?').run(status, id);
  return getOrder(id) as Order;
}

export function catalogText(): string {
  const products = catalogForDefault();
  if (products.length === 0) return 'Todavía no cargamos nuestro catálogo.';
  return products
    .map((p) => `• ${p.name} (${p.code}): $${p.price} - Stock: ${p.stock_total} uni.`)
    .join('\n');
}

export function catalogForDefault(): ProductView[] {
  return catalogProducts(defaultPosId(), defaultBaseId(), defaultDepositoId());
}

export function catalogProducts(posId: number, baseId: number, depositoId: number): ProductView[] {
  return productsForBase(baseId, [depositoId]);
}

export function defaultPosId(): number {
  return Number(getSetting('whatsapp_default_pos') || '1');
}
export function defaultBaseId(): number {
  return Number(getSetting('whatsapp_default_base') || '1');
}
export function defaultDepositoId(): number {
  return Number(getSetting('whatsapp_default_deposito') || '1');
}

export function basePrice(productId: number, baseId: number): number {
  const row = getDb()
    .prepare('SELECT price FROM product_bases WHERE product_id = ? AND base_id = ?')
    .get(productId, baseId) as { price: number } | undefined;
  if (!row) throw new HttpError(400, 'El producto no tiene precio en la base seleccionada');
  return row.price;
}

function applyStockOut(orderId: number): void {
  const order = getOrder(orderId);
  if (!order?.deposito_id) return;
  const ref = `Pedido ${order.order_number}`;
  for (const it of order.items ?? []) {
    decrementStock(it.product_id, order.deposito_id, it.quantity, ref);
  }
}

function notifyOrderConfirmed(orderId: number): void {
  const order = getOrder(orderId);
  if (!order || !order.customer_email) return;
  void sendEmail({
    to: order.customer_email,
    subject: `Pedido ${order.order_number} confirmado`,
    html: buildOrderConfirmationHtml({
      order_number: order.order_number,
      customer_name: order.customer_name,
      total: order.total,
      items: (order.items ?? []).map((it) => ({
        product_name: it.product_name,
        quantity: it.quantity,
        subtotal: it.subtotal,
      })),
    }),
  });
}

export function notifyLowStock(products: ReturnType<typeof catalogForDefault>): void {
  const to = getSetting('email_notify_low_stock');
  if (!to || products.length === 0) return;
  const low = products.filter((p) => p.stock_total <= p.min_stock);
  if (low.length === 0) return;
  void sendEmail({
    to,
    subject: 'Alerta: productos con stock bajo',
    html: buildLowStockHtml(low.map((p) => ({ name: p.name, stock: p.stock_total, min_stock: p.min_stock }))),
  });
}