import path from 'node:path';
import fs from 'node:fs';
import { getDb } from '../db/db';
import { HttpError } from '../lib/http';
import { getProduct, ensureProductInBase, productsForBase } from './productos';
import { getDeposito, getPuntoVenta } from './pos';
import { getBase } from './catalogo';
import { buildQuotePdf } from './pdf';
import { sendMedia, sendEnabled } from './whatsapp';
import { sendEmail, buildQuoteEmailHtml, emailEnabled } from './email';
import { getSetting } from './settings';
import { basePrice, defaultPosId, defaultBaseId, defaultDepositoId } from './order';
import type { Quote, QuoteItem, ProductView } from '../types';

export interface QuoteDraftItem {
  productId?: number;
  description?: string;
  quantity: number;
  unitPrice?: number;
}

export interface CreateQuoteInput {
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  source: 'manual' | 'whatsapp' | 'panel';
  posId: number;
  baseId: number;
  depositoId: number;
  validDays?: number;
  notes?: string;
  items: QuoteDraftItem[];
}

export function nextQuoteNumber(): string {
  const row = getDb().prepare('SELECT COUNT(*) AS n FROM quotes').get() as { n: number };
  return `PRE-${String(row.n + 1).padStart(4, '0')}`;
}

export function createQuote(input: CreateQuoteInput): Quote {
  const db = getDb();
  getPuntoVenta(input.posId);
  getBase(input.baseId);
  getDeposito(input.depositoId);
  const items: QuoteItem[] = input.items.map((it) => {
    const quantity = Math.max(1, Math.round(it.quantity || 1));
    if (it.productId) {
      ensureProductInBase(it.productId, input.baseId);
      const p = getProduct(it.productId);
      return {
        product_id: p.id,
        description: it.description || `${p.name}${p.description ? ` - ${p.description}` : ''}`,
        quantity,
        unit_price: it.unitPrice ?? basePrice(p.id, input.baseId),
        subtotal: (it.unitPrice ?? basePrice(p.id, input.baseId)) * quantity,
      };
    }
    return {
      product_id: null,
      description: it.description ?? 'Producto',
      quantity,
      unit_price: it.unitPrice ?? 0,
      subtotal: (it.unitPrice ?? 0) * quantity,
    };
  });
  const total = items.reduce((acc, it) => acc + it.subtotal, 0);
  const number = nextQuoteNumber();
  const validDays = input.validDays ?? Number(getSetting('quote_validity_days') || 7);

  const res = db
    .prepare(
      `INSERT INTO quotes (quote_number, customer_name, customer_phone, customer_email, source, valid_days, pos_id, base_id, deposito_id, total, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      number,
      input.customerName,
      input.customerPhone ?? '',
      input.customerEmail ?? '',
      input.source,
      validDays,
      input.posId,
      input.baseId,
      input.depositoId,
      total,
      input.notes ?? ''
    );
  const id = Number(res.lastInsertRowid);
  const ins = db.prepare(
    'INSERT INTO quote_items (quote_id, product_id, description, quantity, unit_price, subtotal) VALUES (?, ?, ?, ?, ?, ?)'
  );
  for (const it of items) {
    ins.run(id, it.product_id ?? null, it.description, it.quantity, it.unit_price, it.subtotal);
  }
  return getQuote(id) as Quote;
}

export function quoteCatalog(baseId: number, depositoId: number): ProductView[] {
  return productsForBase(baseId, [depositoId]);
}

export function getQuote(id: number): Quote | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM quotes WHERE id = ?').get(id) as Quote | undefined;
  if (!row) return null;
  row.items = db.prepare('SELECT * FROM quote_items WHERE quote_id = ?').all(id) as QuoteItem[];
  return row;
}

export function listQuotes(posId?: number): Quote[] {
  const db = getDb();
  const quotes = (
    posId
      ? db.prepare('SELECT * FROM quotes WHERE pos_id = ? ORDER BY id DESC').all(posId)
      : db.prepare('SELECT * FROM quotes ORDER BY id DESC').all()
  ) as Quote[];
  const items = db.prepare('SELECT * FROM quote_items ORDER BY id').all() as QuoteItem[];
  const byQuote = new Map<number, QuoteItem[]>();
  for (const it of items) {
    const list = byQuote.get(it.quote_id ?? 0) ?? [];
    list.push(it);
    byQuote.set(it.quote_id ?? 0, list);
  }
  for (const q of quotes) q.items = byQuote.get(q.id) ?? [];
  return quotes;
}

export async function quotePdfFile(id: number): Promise<{ buffer: Buffer; filename: string }> {
  const quote = getQuote(id);
  if (!quote) throw new HttpError(404, 'Presupuesto no encontrado');
  const dir = path.join('data', 'pdf');
  fs.mkdirSync(dir, { recursive: true });
  const buffer = await buildQuotePdf(quote, quote.items ?? []);
  const filename = `presupuesto-${quote.quote_number}.pdf`;
  fs.writeFileSync(path.join(dir, filename), buffer);
  return { buffer, filename };
}

export async function sendQuote(
  id: number,
  by: 'whatsapp' | 'email' | 'both'
): Promise<{ whatsapp: boolean; email: boolean; sandbox: boolean }> {
  const quote = getQuote(id);
  if (!quote) throw new HttpError(404, 'Presupuesto no encontrado');
  const { buffer, filename } = await quotePdfFile(id);
  const business = getSetting('business_name') || 'Mi Negocio';
  const results = { whatsapp: false, email: false };
  const sandbox = !sendEnabled() || !emailEnabled();

  if ((by === 'whatsapp' || by === 'both') && quote.customer_phone) {
    void sendMedia(
      normalizePhone(quote.customer_phone),
      buffer,
      filename,
      `Presupuesto ${quote.quote_number} - ${business}`
    );
    results.whatsapp = true;
  }
  if ((by === 'email' || by === 'both') && quote.customer_email) {
    void sendEmail({
      to: quote.customer_email,
      subject: `Presupuesto ${quote.quote_number} - ${business}`,
      html: buildQuoteEmailHtml({
        quote_number: quote.quote_number,
        customer_name: quote.customer_name,
        total: quote.total,
        valid_days: quote.valid_days,
        business_name: business,
      }),
      attachment: { filename, content: buffer },
    });
    results.email = true;
  }
  getDb()
    .prepare("UPDATE quotes SET status = 'sent', updated_at = datetime('now') WHERE id = ?")
    .run(id);
  return { ...results, sandbox };
}

export function updateQuoteStatus(id: number, status: Quote['status']): Quote {
  if (!['draft', 'sent', 'approved', 'rejected', 'expired'].includes(status)) {
    throw new HttpError(400, 'Estado de presupuesto inválido');
  }
  getDb().prepare('UPDATE quotes SET status = ?, updated_at = datetime(\'now\') WHERE id = ?').run(status, id);
  return getQuote(id) as Quote;
}

export function deleteQuote(id: number): void {
  getDb().prepare('DELETE FROM quotes WHERE id = ?').run(id);
}

export function quoteContext(
  posId?: number,
  baseId?: number,
  depositoId?: number
): { posId: number; baseId: number; depositoId: number } {
  return {
    posId: posId ?? defaultPosId(),
    baseId: baseId ?? defaultBaseId(),
    depositoId: depositoId ?? defaultDepositoId(),
  };
}

function normalizePhone(p: string): string {
  return p.replace(/[^0-9]/g, '');
}