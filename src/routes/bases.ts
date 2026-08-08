import { Router } from 'express';
import { z } from 'zod';
import { HttpError, ah } from '../lib/http';
import { getDb } from '../db/db';
import {
  listBases,
  getBase,
  createBase,
  updateBase,
  deleteBase,
} from '../services/catalogo';
import {
  productsForBase,
  addProductToBase,
  updateProductInBase,
  removeProductFromBase,
} from '../services/productos';
import { getDepositoIdsByPos, getUserPuntoVentaIds } from '../services/pos';

export const basesRouter = Router();

const baseSchema = z.object({
  name: z.string().min(1),
  active: z.boolean().optional().default(true),
});

const productInBaseSchema = z.object({
  productId: z.coerce.number().int().positive(),
  price: z.coerce.number().min(0),
  min_stock: z.coerce.number().int().min(0).optional().default(5),
});

basesRouter.get('/', ah((_req, res) => {
  res.json(listBases());
}));

basesRouter.post('/', ah((req, res) => {
  const data = baseSchema.parse(req.body);
  const base = createBase(data.name);
  res.status(201).json(base);
}));

basesRouter.put('/:id', ah((req, res) => {
  const data = baseSchema.parse(req.body);
  updateBase(Number(req.params.id), data);
  res.json(getBase(Number(req.params.id)));
}));

basesRouter.delete('/:id', ah((req, res) => {
  deleteBase(Number(req.params.id));
  res.status(204).send();
}));

basesRouter.get('/:id/products', ah((req, res) => {
  const baseId = Number(req.params.id);
  const posId = Number(req.query.pos ?? 0);
  const depositoIds = posId
    ? getDepositoIdsByPos(posId)
    : getDepositoIdsByPos(getUserPuntoVentaIds(req.user!.id)[0] ?? 0);
  res.json(productsForBase(baseId, depositoIds));
}));

basesRouter.put('/:id/products', ah((req, res) => {
  const baseId = Number(req.params.id);
  const rows = z.array(productInBaseSchema).parse(req.body);
  const db = getDb();
  db.prepare('DELETE FROM product_bases WHERE base_id = ?').run(baseId);
  for (const r of rows) addProductToBase(r.productId, baseId, r.price, r.min_stock);
  res.json(productsForBase(baseId, []));
}));

basesRouter.post('/:id/products', ah((req, res) => {
  const baseId = Number(req.params.id);
  const data = productInBaseSchema.parse(req.body);
  addProductToBase(data.productId, baseId, data.price, data.min_stock);
  res.status(201).json({ ok: true });
}));

basesRouter.patch('/:id/products/:productId', ah((req, res) => {
  const baseId = Number(req.params.id);
  const productId = Number(req.params.productId);
  const data = productInBaseSchema.omit({ productId: true }).parse(req.body);
  updateProductInBase(productId, baseId, data.price, data.min_stock);
  res.json({ ok: true });
}));

basesRouter.delete('/:id/products/:productId', ah((req, res) => {
  removeProductFromBase(Number(req.params.productId), Number(req.params.id));
  res.status(204).send();
}));