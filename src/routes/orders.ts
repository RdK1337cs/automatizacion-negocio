import { Router } from 'express';
import { z } from 'zod';
import { HttpError, ah } from '../lib/http';
import { getOrder, listOrders, createOrder, cancelOrder, confirmOrder, deleteOrder } from '../services/order';
import { nameOf } from '../services/labels';
import { getSetting } from '../services/settings';
import type { Order } from '../types';

export const ordersRouter = Router();

const itemSchema = z.object({
  productId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().int().positive(),
});

const orderSchema = z.object({
  customerName: z.string().min(1),
  customerPhone: z.string().optional().default(''),
  customerEmail: z.string().optional().default(''),
  source: z.enum(['panel', 'whatsapp', 'api']).optional().default('panel'),
  notes: z.string().optional().default(''),
  posId: z.coerce.number().int().positive().optional(),
  baseId: z.coerce.number().int().positive().optional(),
  depositoId: z.coerce.number().int().positive().optional(),
  items: z.array(itemSchema).min(1),
  autoConfirm: z.boolean().optional().default(false),
});

ordersRouter.get('/', ah((req, res) => {
  const posId = req.query.pos ? Number(req.query.pos) : undefined;
  res.json(listOrders(posId).map(withLabels));
}));

ordersRouter.get('/:id', ah((req, res) => {
  const order = getOrder(Number(req.params.id));
  if (!order) throw new HttpError(404, 'Pedido no encontrado');
  res.json(withLabels(order));
}));

ordersRouter.post('/', ah((req, res) => {
  const data = orderSchema.parse(req.body);
  const order = createOrder({
    ...data,
    posId: data.posId ?? Number(getSetting('whatsapp_default_pos') || 1),
    baseId: data.baseId ?? Number(getSetting('whatsapp_default_base') || 1),
    depositoId: data.depositoId ?? Number(getSetting('whatsapp_default_deposito') || 1),
  });
  res.status(201).json(withLabels(order));
}));

ordersRouter.post('/:id/confirm', ah((req, res) => {
  const order = confirmOrder(Number(req.params.id));
  res.json(withLabels(order));
}));

ordersRouter.post('/:id/cancel', ah((req, res) => {
  const order = cancelOrder(Number(req.params.id));
  res.json(withLabels(order));
}));

ordersRouter.delete('/:id', ah((req, res) => {
  deleteOrder(Number(req.params.id));
  res.status(204).send();
}));

function withLabels<T extends Order>(order: T): T & { status_label: string; context_label?: string } {
  const extra: { status_label: string; context_label?: string } = {
    status_label: statusLabel(order.status),
  };
  if (order.pos_id && order.base_id && order.deposito_id) {
    extra.context_label = nameOf(order.pos_id, order.base_id, order.deposito_id).label;
  }
  return { ...order, ...extra };
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    pending: 'Pendiente',
    confirmed: 'Confirmado',
    cancelled: 'Cancelado',
    delivered: 'Entregado',
  };
  return map[status] ?? status;
}