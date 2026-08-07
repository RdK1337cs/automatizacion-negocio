import axios from 'axios';
import { config } from '../config';
import { getDb } from '../db/db';

export interface EmailInput {
  to: string;
  subject: string;
  html: string;
  attachment?: { filename: string; content: Buffer };
}

export function emailEnabled(): boolean {
  return Boolean(config.email.apiKey);
}

export async function sendEmail(input: EmailInput): Promise<void> {
  const db = getDb();
  if (!config.email.apiKey) {
    db.prepare(
      'INSERT INTO emails (to_email, subject, body, provider, status, meta) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(
      input.to,
      input.subject,
      input.html,
      config.email.provider,
      'sandbox',
      'Sin API key (modo simulacion)'
    );
    console.log(`[email sandbox] Para: ${input.to} - ${input.subject}`);
    return;
  }

  const payload: Record<string, unknown> = {
    from: config.email.from,
    to: input.to,
    subject: input.subject,
    html: input.html,
  };
  if (input.attachment) {
    payload.attachments = [
      {
        filename: input.attachment.filename,
        content: input.attachment.content.toString('base64'),
      },
    ];
  }

  try {
    const resp = await axios.post('https://api.resend.com/emails', payload, {
      headers: { Authorization: `Bearer ${config.email.apiKey}` },
    });
    const id = resp.data?.id as string | undefined;
    db.prepare(
      'INSERT INTO emails (to_email, subject, body, provider, status, meta) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(input.to, input.subject, input.html, config.email.provider, 'sent', id ?? '');
  } catch (err) {
    const e = err as { response?: { data?: unknown }; message?: string };
    const msg = String(e.response?.data ?? e.message ?? err).slice(0, 500);
    db.prepare(
      'INSERT INTO emails (to_email, subject, body, provider, status, error) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(input.to, input.subject, input.html, config.email.provider, 'failed', msg);
    console.error('[Email send error]', msg);
  }
}

export function buildOrderConfirmationHtml(order: {
  order_number: string;
  customer_name: string;
  total: number;
  items: Array<{ product_name: string; quantity: number; subtotal: number }>;
}): string {
  const currency = getSettingCurrency();
  const rows = order.items
    .map(
      (it) =>
        `<tr><td>${esc(it.product_name)}</td><td>${it.quantity}</td><td>${fmt(it.subtotal, currency)}</td></tr>`
    )
    .join('');
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:auto">
      <h2 style="color:#1a1a2e">Pedido ${esc(order.order_number)} confirmado</h2>
      <p>Hola ${esc(order.customer_name)}, te confirmamos tu pedido:</p>
      <table style="width:100%;border-collapse:collapse">
        <tr style="background:#f4f4f4"><th style="text-align:left;padding:8px">Producto</th><th style="padding:8px">Cant.</th><th style="padding:8px;text-align:right">Subtotal</th></tr>
        ${rows}
      </table>
      <p style="font-weight:bold;font-size:16px">Total: ${fmt(order.total, currency)}</p>
    </div>`;
}

function getSettingCurrency(): string {
  try {
    const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get('currency') as
      | { value: string }
      | undefined;
    return row?.value || 'ARS';
  } catch {
    return 'ARS';
  }
}

function fmt(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency }).format(n);
  } catch {
    return String(n);
  }
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function buildQuoteEmailHtml(quote: {
  quote_number: string;
  customer_name: string;
  total: number;
  valid_days: number;
  business_name: string;
}): string {
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:auto">
      <h2 style="color:#1a1a2e">Presupuesto ${esc(quote.quote_number)}</h2>
      <p>Hola ${esc(quote.customer_name)},</p>
      <p>Adjuntamos el presupuesto de <strong>${esc(quote.business_name)}</strong> por ${fmt(quote.total, getSettingCurrency())}.</p>
      <p>Válido por ${quote.valid_days} días. Ante cualquier duda, respondé este mail.</p>
    </div>`;
}

export function buildLowStockHtml(items: Array<{ name: string; stock: number; min_stock: number }>): string {
  const rows = items
    .map((it) => `<tr><td>${esc(it.name)}</td><td>${it.stock}</td><td>${it.min_stock}</td></tr>`)
    .join('');
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:auto">
      <h2 style="color:#b45309">Alerta: productos con stock bajo</h2>
      <p>Estos productos están por debajo del mínimo:</p>
      <table style="width:100%;border-collapse:collapse">
        <tr style="background:#f4f4f4"><th style="text-align:left;padding:8px">Producto</th><th style="padding:8px">Stock</th><th style="padding:8px">Mínimo</th></tr>
        ${rows}
      </table>
      <p>Entrá al panel para reponer stock.</p>
    </div>`;
}