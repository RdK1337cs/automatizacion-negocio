import { Router } from 'express';
import { z } from 'zod';
import { HttpError, ah } from '../lib/http';
import {
  listQuotes,
  getQuote,
  createQuote,
  sendQuote,
  updateQuoteStatus,
  deleteQuote,
  quotePdfFile,
  quoteCatalog,
} from '../services/quote';
import { nameOf } from '../services/labels';
import { getSetting } from '../services/settings';
import type { Quote } from '../types';

export const quotesRouter = Router();

const itemSchema = z.object({
  productId: z.coerce.number().int().positive().optional(),
  description: z.string().optional(),
  quantity: z.coerce.number().int().positive().default(1),
  unitPrice: z.coerce.number().int().min(0).optional(),
});

const quoteSchema = z.object({
  customerName: z.string().min(1),
  customerPhone: z.string().optional().default(''),
  customerEmail: z.string().optional().default(''),
  source: z.enum(['manual', 'whatsapp', 'panel']).optional().default('panel'),
  validDays: z.coerce.number().int().positive().optional(),
  notes: z.string().optional().default(''),
  posId: z.coerce.number().int().positive().optional(),
  baseId: z.coerce.number().int().positive().optional(),
  depositoId: z.coerce.number().int().positive().optional(),
  items: z.array(itemSchema).min(1),
});

const statusSchema = z.enum(['draft', 'sent', 'approved', 'rejected', 'expired']);

quotesRouter.get('/', ah((req, res) => {
  const posId = req.query.pos ? Number(req.query.pos) : undefined;
  res.json(listQuotes(posId).map(withLabels));
}));

quotesRouter.get('/catalog', ah((req, res) => {
  const baseId = Number(req.query.base ?? Number(getSetting('whatsapp_default_base') || 1));
  const depositoId = Number(req.query.deposito ?? Number(getSetting('whatsapp_default_deposito') || 1));
  res.json(quoteCatalog(baseId, depositoId));
}));

quotesRouter.get('/:id', ah((req, res) => {
  const quote = getQuote(Number(req.params.id));
  if (!quote) throw new HttpError(404, 'Presupuesto no encontrado');
  res.json(withLabels(quote));
}));

quotesRouter.post('/', ah((req, res) => {
  const data = quoteSchema.parse(req.body);
  const quote = createQuote({
    ...data,
    posId: data.posId ?? Number(getSetting('whatsapp_default_pos') || 1),
    baseId: data.baseId ?? Number(getSetting('whatsapp_default_base') || 1),
    depositoId: data.depositoId ?? Number(getSetting('whatsapp_default_deposito') || 1),
  });
  res.status(201).json(withLabels(quote));
}));

quotesRouter.post('/:id/send', ah(async (req, res) => {
  const by = z.enum(['whatsapp', 'email', 'both']).default('both').parse(req.query.by ?? 'both');
  const result = await sendQuote(Number(req.params.id), by);
  res.json({ ok: true, ...result });
}));

quotesRouter.get('/:id/pdf', ah(async (req, res) => {
  const { buffer, filename } = await quotePdfFile(Number(req.params.id));
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  res.send(buffer);
}));

quotesRouter.patch('/:id/status', ah((req, res) => {
  const status = statusSchema.parse(req.body);
  const quote = updateQuoteStatus(Number(req.params.id), status);
  res.json(withLabels(quote));
}));

quotesRouter.delete('/:id', ah((req, res) => {
  deleteQuote(Number(req.params.id));
  res.status(204).send();
}));

function withLabels<T extends Quote>(quote: T): T & { status_label: string; context_label?: string } {
  const extra: { status_label: string; context_label?: string } = {
    status_label: quoteStatusLabel(quote.status),
  };
  if (quote.pos_id && quote.base_id && quote.deposito_id) {
    extra.context_label = nameOf(quote.pos_id, quote.base_id, quote.deposito_id).label;
  }
  return { ...quote, ...extra };
}

function quoteStatusLabel(status: string): string {
  const map: Record<string, string> = {
    draft: 'Borrador',
    sent: 'Enviado',
    approved: 'Aprobado',
    rejected: 'Rechazado',
    expired: 'Expirado',
  };
  return map[status] ?? status;
}