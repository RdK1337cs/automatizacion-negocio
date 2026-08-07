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
} from '../services/quote';
import { getStatusLabel } from '../lib/labels';
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
  items: z.array(itemSchema).min(1),
});

const statusSchema = z.enum(['draft', 'sent', 'approved', 'rejected', 'expired']);

quotesRouter.get('/', ah((_req, res) => {
  res.json(listQuotes().map(withLabels));
}));

quotesRouter.get('/:id', ah((req, res) => {
  const quote = getQuote(Number(req.params.id));
  if (!quote) throw new HttpError(404, 'Presupuesto no encontrado');
  res.json(withLabels(quote));
}));

quotesRouter.post('/', ah((req, res) => {
  const data = quoteSchema.parse(req.body);
  const quote = createQuote(data);
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

function withLabels<T extends Quote>(quote: T): T & { status_label: string } {
  return { ...quote, status_label: getStatusLabel(quote.status) };
}