import PDFDocument from 'pdfkit';
import { getSetting } from './settings';
import type { Quote, QuoteItem } from '../types';

export async function buildQuotePdf(quote: Quote, items: QuoteItem[]): Promise<Buffer> {
  const businessName = getSetting('business_name') || 'Mi Negocio';
  const currency = getSetting('currency') || 'ARS';
  const phone = getSetting('business_phone');
  const email = getSetting('business_email');

  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  doc
    .fillColor('#1a1a2e')
    .fontSize(20)
    .font('Helvetica-Bold')
    .text(businessName);
  doc.moveDown(0.2);
  doc
    .fillColor('#555')
    .fontSize(10)
    .font('Helvetica')
    .text(`Email: ${email || '-'}${phone ? `  |  Tel: ${phone}` : ''}`);
  doc.moveDown(0.8);

  doc
    .fillColor('#1a1a2e')
    .fontSize(16)
    .font('Helvetica-Bold')
    .text('PRESUPUESTO', { align: 'center' });
  doc.moveDown(0.5);

  const created = quote.created_at.replace('T', ' ').slice(0, 16);
  const validUntil = addDays(quote.created_at, quote.valid_days || 7);
  doc
    .fontSize(10)
    .font('Helvetica')
    .fillColor('#333')
    .text(`Nro: ${quote.quote_number}`, { align: 'center' })
    .text(`Fecha: ${created}`, { align: 'center' })
    .text(`Válido hasta: ${validUntil}`, { align: 'center' })
    .text(`Cliente: ${quote.customer_name}`, { align: 'center' });
  doc.moveDown(1);

  drawTable(doc, items, currency);

  doc.moveDown(1.2);
  doc
    .fontSize(12)
    .font('Helvetica-Bold')
    .fillColor('#1a1a2e')
    .text(`TOTAL: ${fmtMoney(quote.total, currency)}`, { align: 'right' });

  doc.moveDown(2);
  doc
    .fontSize(9)
    .font('Helvetica')
    .fillColor('#777')
    .text(
      'Valores expresados en la moneda indicada. Sujeto a confirmacion de disponibilidad de stock. Gracias por tu consulta.'
    );

  doc.end();
  return done;
}

function drawTable(doc: PDFKit.PDFDocument, items: QuoteItem[], currency: string): void {
  const margin = 50;
  const width = doc.page.width - margin * 2;
  const colDescription = width * 0.55;
  const colQty = width * 0.1;
  const colPrice = width * 0.18;
  const colSubtotal = width * 0.17;

  const y = doc.y;
  doc.fontSize(10).font('Helvetica-Bold').fillColor('#1a1a2e');
  doc.text('Descripción', margin + 6, y, { width: colDescription - 6 });
  doc.text('Cant.', margin + colDescription, y, { width: colQty });
  doc.text('Precio', margin + colDescription + colQty, y, { width: colPrice, align: 'right' });
  doc.text('Subtotal', margin + colDescription + colQty + colPrice, y, {
    width: colSubtotal,
    align: 'right',
  });
  doc
    .moveTo(margin, doc.y + 6)
    .lineTo(margin + width, doc.y + 6)
    .strokeColor('#ccc')
    .lineWidth(1)
    .stroke();
  doc.moveDown(0.6);

  for (const it of items) {
    const rowY = doc.y;
    doc.fontSize(10).font('Helvetica').fillColor('#333');
    doc.text(it.description, margin + 2, rowY, { width: colDescription - 4 });
    doc.text(String(it.quantity), margin + colDescription + 2, rowY, { width: colQty });
    doc.text(fmtMoney(it.unit_price, currency), margin + colDescription + colQty, rowY, {
      width: colPrice,
      align: 'right',
    });
    doc.text(fmtMoney(it.subtotal, currency), margin + colDescription + colQty + colPrice, rowY, {
      width: colSubtotal,
      align: 'right',
    });
    doc.moveDown(0.6);
  }
}

function fmtMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `$ ${amount.toFixed(2)}`;
  }
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('es-AR');
}
