import { Router } from 'express';
import { z } from 'zod';
import { HttpError, ah } from '../lib/http';
import { getDb } from '../db/db';
import {
  listDepositos,
  getDeposito,
  createDeposito,
  updateDeposito,
  deleteDeposito,
} from '../services/pos';
import { adjustStock } from '../services/stock';

export const depositosRouter = Router();

const depositoSchema = z.object({
  name: z.string().min(1),
  active: z.boolean().optional().default(true),
});

const stockAdjustSchema = z.object({
  productId: z.coerce.number().int().positive(),
  delta: z.coerce.number().int(),
  note: z.string().optional().default(''),
});

depositosRouter.get('/', ah((_req, res) => {
  res.json(listDepositos());
}));

depositosRouter.get('/names', ah((req, res) => {
  const ids = String(req.query.ids ?? '')
    .split(',')
    .map((s) => Number(s))
    .filter((n) => n > 0);
  const out: Record<number, string> = {};
  if (ids.length > 0) {
    const rows = getDb()
      .prepare(`SELECT id, name FROM depositos WHERE id IN (${ids.map(() => '?').join(',')})`)
      .all(...ids) as Array<{ id: number; name: string }>;
    for (const r of rows) out[r.id] = r.name;
  }
  res.json(out);
}));

depositosRouter.post('/', ah((req, res) => {
  const data = depositoSchema.parse(req.body);
  const deposito = createDeposito({ name: data.name });
  res.status(201).json(deposito);
}));

depositosRouter.put('/:id', ah((req, res) => {
  const data = depositoSchema.parse(req.body);
  updateDeposito(Number(req.params.id), data);
  res.json(getDeposito(Number(req.params.id)));
}));

depositosRouter.delete('/:id', ah((req, res) => {
  deleteDeposito(Number(req.params.id));
  res.status(204).send();
}));

depositosRouter.post('/:id/stock', ah((req, res) => {
  const data = stockAdjustSchema.parse(req.body);
  const next = adjustStock(data.productId, Number(req.params.id), data.delta, data.note);
  res.json({ ok: true, quantity: next });
}));