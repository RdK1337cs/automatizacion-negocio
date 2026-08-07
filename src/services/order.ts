import { getDb } from '../db/db';
import { HttpError } from '../lib/http';
import { verifyStock, decrementStock, restoreStock, getProduct, listActiveProducts, lowStockProducts } from './stock';
import { sendEmail, buildOrderConfirmationHtml, buildLowStockHtml } from './email';
import { getSetting } from './settings';
import type { Order, OrderItem } from '../types';

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
  items: OrderDraftItem[];
  autoConfirm?: boolean;
}

export function nextOrderNumber(): string {
  const row = getDb().prepare('SELECT COUNT(*) AS n FROM orders').get() as { n: number };
  return `ORD-${String(row.n + 1).padStart(4, '0')}`;
}

export function createOrder(input: CreateOrderInput): Order {
  const db = getDb();
  const items: OrderItem[] = input.items.map((it) => {
    const p = getProduct(it.productId);
    const quantity = Math.max(1, Math.round(it.quantity));
    return {
      product_id: p.id,
      product_name: p.name,
      quantity,
      unit_price: p.price,
      subtotal: p.price * quantity,
    };
  });
  const total = items.reduce((acc, it) => acc + it.subtotal, 0);
  const number = nextOrderNumber();
  const status = input.autoConfirm ? 'confirmed' : 'pending';

  const res = db
    .prepare(
      `INSERT INTO orders (order_number, customer_name, customer_phone, customer_email, source, status, total, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      number,
      input.customerName,
      input.customerPhone ?? '',
      input.customerEmail ?? '',
      input.source,
      status,
      total,
      input.notes ?? ''
    );
  const orderId = Number(res.lastInsertRowid);
  const ins = db.prepare(
    'INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, subtotal) VALUES (?, ?, ?, ?, ?, ?)'
  );
  for (const it of items) ins.run(orderId, it.product_id, it.product_name, it.quantity, it.unit_price, it.subtotal);

  if (status === 'confirmed') {
    applyStockOut(orderId, items);
    notifyOrderConfirmed(orderId);
    notifyLowStock();
  }
  return getOrder(orderId) as Order;
}

export function getOrder(id: number): Order | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(id) as Order | undefined;
  if (!row) return null;
  row.items = db
    .prepare('SELECT * FROM order_items WHERE order_id = ?')
    .all(id) as OrderItem[];
  return row;
}

export function listOrders(): Order[] {
  const db = getDb();
  const orders = db.prepare('SELECT * FROM orders ORDER BY id DESC').all() as Order[];
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

  const items = (order.items ?? []) as OrderItem[];
  verifyStock(items.map((it) => ({ productId: it.product_id, quantity: it.quantity })));
  db.prepare("UPDATE orders SET status = 'confirmed', updated_at = datetime('now') WHERE id = ?").run(id);
  applyStockOut(id, items);
  notifyOrderConfirmed(id);
  notifyLowStock();
  return getOrder(id) as Order;
}

export function cancelOrder(id: number): Order {
  const db = getDb();
  const order = getOrder(id);
  if (!order) throw new HttpError(404, 'Pedido no encontrado');
  if (order.status !== 'confirmed') {
    db.prepare("UPDATE orders SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?").run(id);
    return getOrder(id) as Order;
  }
  db.prepare("UPDATE orders SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?").run(id);
  const items = (order.items ?? []) as OrderItem[];
  for (const it of items) restoreStock(it.product_id, it.quantity, `Pedido ${order.order_number}`);
  return getOrder(id) as Order;
}

export function deleteOrder(id: number): void {
  getDb().prepare('DELETE FROM orders WHERE id = ?').run(id);
}

export function updateStatus(id: number, status: Order['status']): Order {
  if (status === 'confirmed') return confirmOrder(id);
  if (status === 'cancelled') return cancelOrder(id);
  const db = getDb();
  db.prepare('UPDATE orders SET status = ?, updated_at = datetime(\'now\') WHERE id = ?').run(status, id);
  return getOrder(id) as Order;
}

export function catalogText(): string {
  const products = listActiveProducts();
  if (products.length === 0) return 'Todavía no cargamos nuestro catálogo.';
  return products
    .map((p) => `• ${p.name} (${p.code}): $${p.price} - Stock: ${p.stock} uni.`)
    .join('\n');
}

function applyStockOut(orderId: number, items: OrderItem[]): void {
  const order = getOrder(orderId);
  const ref = order ? `Pedido ${order.order_number}` : `Pedido #${orderId}`;
  for (const it of items) {
    decrementStock(it.product_id, it.quantity, ref);
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

function notifyLowStock(): void {
  const to = getSetting('email_notify_low_stock');
  if (!to) return;
  const low = lowStockProducts();
  if (low.length === 0) return;
  void sendEmail({
    to,
    subject: 'Alerta: productos con stock bajo',
    html: buildLowStockHtml(
      low.map((p) => ({ name: p.name, stock: p.stock, min_stock: p.min_stock }))
    ),
  });
}
