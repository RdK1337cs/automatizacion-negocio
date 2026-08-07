import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/db';
import { HttpError, ah } from '../lib/http';
import { adjustStock } from '../services/stock';
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
  price: z.coerce.number().min(0),
  stock: z.coerce.number().int().min(0).optional().default(0),
  min_stock: z.coerce.number().int().min(0).optional().default(5),
  image_base64: z.string().optional(),
});

const stockAdjustSchema = z.object({
  delta: z.coerce.number().int(),
  note: z.string().optional().default(''),
});

productsRouter.get('/', ah((_req, res) => {
  const rows = getDb().prepare('SELECT * FROM products ORDER BY id DESC').all();
  res.json(rows);
}));

productsRouter.post('/', ah((req, res) => {
  const data = productSchema.parse(req.body);
  const db = getDb();
  const exists = db.prepare('SELECT id FROM products WHERE code = ?').get(data.code);
  if (exists) throw new HttpError(409, `Ya existe un producto con el código ${data.code}`);
  const result = db
    .prepare(
      'INSERT INTO products (code, name, description, price, stock, min_stock) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(data.code, data.name, data.description, data.price, data.stock, data.min_stock);
  const id = Number(result.lastInsertRowid);
  if (data.image_base64) saveProductImage(id, data.image_base64);
  res.status(201).json(getDb().prepare('SELECT * FROM products WHERE id = ?').get(id));
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
  const id = Number(req.params.id);
  removeProductImage(id);
  res.status(204).send();
}));

productsRouter.put('/:id', ah((req, res) => {
  const id = Number(req.params.id);
  const data = productSchema.parse(req.body);
  const result = getDb()
    .prepare(
      'UPDATE products SET code=?, name=?, description=?, price=?, min_stock=? WHERE id=?'
    )
    .run(data.code, data.name, data.description, data.price, data.min_stock, id);
  if (result.changes === 0) throw new HttpError(404, 'Producto no encontrado');
  if (data.image_base64) saveProductImage(id, data.image_base64);
  res.json(getDb().prepare('SELECT * FROM products WHERE id=?').get(id));
}));

productsRouter.patch('/:id/stock', ah((req, res) => {
  const id = Number(req.params.id);
  const { delta, note } = stockAdjustSchema.parse(req.body);
  const product = adjustStock(id, delta, note);
  res.json(product);
}));

productsRouter.patch('/:id/active', ah((req, res) => {
  const id = Number(req.params.id);
  const active = z.boolean().parse(req.body.active);
  const result = getDb().prepare('UPDATE products SET active=? WHERE id=?').run(active ? 1 : 0, id);
  if (result.changes === 0) throw new HttpError(404, 'Producto no encontrado');
  res.json(getDb().prepare('SELECT * FROM products WHERE id=?').get(id));
}));

productsRouter.delete('/:id', ah((req, res) => {
  const id = Number(req.params.id);
  const row = getDb().prepare('SELECT image FROM products WHERE id=?').get(id) as
    | { image: string | null }
    | undefined;
  const result = getDb().prepare('DELETE FROM products WHERE id=?').run(id);
  if (result.changes === 0) throw new HttpError(404, 'Producto no encontrado');
  if (row?.image) unlinkImageFile(row.image);
  res.status(204).send();
}));