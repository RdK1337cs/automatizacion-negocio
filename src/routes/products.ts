import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/db';
import { HttpError, ah } from '../lib/http';
import {
  createProduct,
  updateProduct,
  deleteProduct,
  getProduct,
  productsForBase,
} from '../services/productos';
import { adjustStock } from '../services/stock';
import { getDepositoIdsByPos } from '../services/pos';
import {
  saveProductImage,
  removeProductImage,
  productImageInfo,
  unlinkImageFile,
} from '../services/productImage';

export const productsRouter = Router();

const productSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional().default(''),
  image_base64: z.string().optional(),
});

const stockAdjustSchema = z.object({
  depositoId: z.coerce.number().int().positive(),
  delta: z.coerce.number().int(),
  note: z.string().optional().default(''),
});

productsRouter.get('/', ah((req, res) => {
  const baseId = req.query.base ? Number(req.query.base) : 0;
  const posId = req.query.pos ? Number(req.query.pos) : 0;
  if (baseId > 0) {
    res.json(productsForBase(baseId, posId > 0 ? getDepositoIdsByPos(posId) : []));
    return;
  }
  res.json(getDb().prepare('SELECT * FROM products ORDER BY id DESC').all());
}));

productsRouter.post('/', ah((req, res) => {
  const data = productSchema.parse(req.body);
  const created = createProduct({ code: data.code, name: data.name, description: data.description });
  if (data.image_base64) saveProductImage(created.id, data.image_base64);
  res.status(201).json(getProduct(created.id));
}));

productsRouter.get('/:id/image', ah((req, res) => {
  const id = Number(req.params.id);
  const info = productImageInfo(id);
  if (!info) {
    res.status(404).json({ error: 'Este producto no tiene foto' });
    return;
  }
  res.setHeader('Content-Type', info.mime);
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.sendFile(info.filePath);
}));

productsRouter.post('/:id/image', ah((req, res) => {
  const id = Number(req.params.id);
  const { image_base64 } = z.object({ image_base64: z.string().min(1) }).parse(req.body);
  const image = saveProductImage(id, image_base64);
  res.json({ ok: true, image });
}));

productsRouter.delete('/:id/image', ah((req, res) => {
  removeProductImage(Number(req.params.id));
  res.status(204).send();
}));

productsRouter.put('/:id', ah((req, res) => {
  const id = Number(req.params.id);
  const data = productSchema.parse(req.body);
  updateProduct(id, { code: data.code, name: data.name, description: data.description });
  if (data.image_base64) saveProductImage(id, data.image_base64);
  res.json(getProduct(id));
}));

productsRouter.patch('/:id/stock', ah((req, res) => {
  const id = Number(req.params.id);
  const { depositoId, delta, note } = stockAdjustSchema.parse(req.body);
  const next = adjustStock(id, depositoId, delta, note);
  res.json({ ok: true, quantity: next });
}));

productsRouter.patch('/:id/active', ah((req, res) => {
  const id = Number(req.params.id);
  const active = z.boolean().parse(req.body.active);
  getDb().prepare('UPDATE products SET active=? WHERE id=?').run(active ? 1 : 0, id);
  res.json(getProduct(id));
}));

productsRouter.delete('/:id', ah((req, res) => {
  deleteProduct(Number(req.params.id));
  res.status(204).send();
}));
