import { Router } from 'express';
import { z } from 'zod';
import { HttpError, ah } from '../lib/http';
import { getOrder, listOrders, createOrder, cancelOrder, confirmOrder, deleteOrder } from '../services/order';
import { getStatusLabel } from '../lib/labels';
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
  items: z.array(itemSchema).min(1),
  autoConfirm: z.boolean().optional().default(false),
});

ordersRouter.get('/', ah((_req, res) => {
  res.json(listOrders().map(withLabels));
}));

ordersRouter.get('/:id', ah((req, res) => {
  const order = getOrder(Number(req.params.id));
  if (!order) throw new HttpError(404, 'Pedido no encontrado');
  res.json(withLabels(order));
}));

ordersRouter.post('/', ah((req, res) => {
  const data = orderSchema.parse(req.body);
  const order = createOrder(data);
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

function withLabels<T extends Order>(order: T): T & { status_label: string } {
  return { ...order, status_label: getStatusLabel(order.status) };
}