import fs from 'node:fs';
import path from 'node:path';
import { getDb } from '../db/db';
import { config } from '../config';
import { HttpError } from '../lib/http';

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

const MAX_BYTES = 1.5 * 1024 * 1024;

function imagesDir(): string {
  return path.resolve(config.dataDir, 'images');
}

export function saveProductImage(productId: number, dataUri: string): string {
  const m = /^data:image\/(png|jpe?g|webp|gif);base64,([A-Za-z0-9+/=]+)$/i.exec(dataUri.trim());
  if (!m) {
    throw new HttpError(400, 'Formato de imagen inválido. Usá PNG, JPG, WEBP o GIF.');
  }
  const buffer = Buffer.from(m[2], 'base64');
  if (buffer.length === 0) throw new HttpError(400, 'La imagen está vacía');
  if (buffer.length > MAX_BYTES) {
    throw new HttpError(400, 'La imagen supera 1,5 MB. Reducila y volvé a intentar.');
  }
  const db = getDb();
  const product = db.prepare('SELECT id, image FROM products WHERE id = ?').get(productId) as
    | { id: number; image: string | null }
    | undefined;
  if (!product) throw new HttpError(404, 'Producto no encontrado');

  fs.mkdirSync(imagesDir(), { recursive: true });
  const ext = m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase();
  const filename = `product-${productId}.${ext}`;
  fs.writeFileSync(path.join(imagesDir(), filename), buffer);
  if (product.image && product.image !== filename) {
    const oldPath = path.join(imagesDir(), product.image);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }
  db.prepare('UPDATE products SET image = ? WHERE id = ?').run(filename, productId);
  return filename;
}

export function removeProductImage(productId: number): void {
  const db = getDb();
  const product = db.prepare('SELECT image FROM products WHERE id = ?').get(productId) as
    | { image: string | null }
    | undefined;
  if (!product) throw new HttpError(404, 'Producto no encontrado');
  if (product.image) {
    unlinkImageFile(product.image);
  }
  db.prepare('UPDATE products SET image = NULL WHERE id = ?').run(productId);
}

export function unlinkImageFile(filename: string): void {
  const filePath = path.join(imagesDir(), filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

export function productImageInfo(productId: number): {
  filePath: string;
  mime: string;
} | null {
  const row = getDb().prepare('SELECT image FROM products WHERE id = ?').get(productId) as
    | { image: string | null }
    | undefined;
  if (!row?.image) return null;
  const filePath = path.join(imagesDir(), row.image);
  if (!fs.existsSync(filePath)) return null;
  const ext = path.extname(row.image).slice(1).toLowerCase();
  return { filePath, mime: MIME_BY_EXT[ext] ?? 'image/png' };
}