import { getSetting } from './settings';
import { listActiveProducts } from './stock';
import { sendText, findProductByText, logIn } from './whatsapp';
import { createOrder, catalogText } from './order';
import { createQuote, sendQuote } from './quote';
import { money } from '../lib/format';
import type { Product } from '../types';

type Intent = 'saludo' | 'menu' | 'catalogo' | 'precio' | 'stock' | 'pedido' | 'presupuesto' | 'otros';

const GREET = /^(hola|buen(as|os)?(\s*\\s(dia|d[ií]a|tardes|noches))?|hey|hi|hello)\b/i;

export async function handleIncoming(from: string, body: string): Promise<void> {
  const text = `${body}`.trim();
  const currency = getSetting('currency') || 'ARS';
  const products = listActiveProducts();
  const product = findProductByText(text, products);
  const quantity = extractQuantity(text);
  const intent = detectIntent(text);

  logIn(from, body, { intent });

  switch (intent) {
    case 'saludo': {
      const g = greeting();
      await sendText(from, `${g}\n\n¿En qué puedo ayudarte? Escribí "menú" para ver las opciones.`);
      return;
    }
    case 'menu': {
      await sendText(from, menu());
      return;
    }
    case 'catalogo': {
      await sendText(from, `Este es nuestro catálogo:\n\n${catalogText()}`);
      return;
    }
    case 'precio': {
      if (!product) {
        await sendText(from, '¿Sobre qué producto querés saber el precio? Te paso el catálogo:\n\n' + catalogText());
        return;
      }
      await sendText(
        from,
        `${product.name} sale ${money(product.price, currency)} por unidad.\n¿Armamos un presupuesto? Podés escribir "presupuesto de ${product.name}".`
      );
      return;
    }
    case 'stock': {
      if (!product) {
        await sendText(from, '¿Qué producto querés consultar? Te paso el catálogo:\n\n' + catalogText());
        return;
      }
      const low = product.stock <= product.min_stock;
      await sendText(
        from,
        low
          ? `Nos queda poco stock de ${product.name}: ${product.stock} unidades. ¿Te paso precio o un presupuesto?`
          : `Tenemos ${product.stock} unidades disponibles de ${product.name}.`
      );
      return;
    }
    case 'pedido': {
      await handleOrder(from, text, product, quantity);
      return;
    }
    case 'presupuesto': {
      await handleQuote(from, product, quantity);
      return;
    }
    default: {
      await sendText(from, `${greeting()}\n\nTe dejo las opciones que entiendo:\n\n${menu()}`);
      return;
    }
  }
}

function detectIntent(text: string): Intent {
  const t = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (GREET.test(text)) return 'saludo';
  if (/\b(menu|opciones|ayuda|help)\b/.test(t)) return 'menu';
  if (/\b(catalogo|cat[ao]logo|que tenes|que tienen|lista de)\b/.test(t)) return 'catalogo';
  if (/\b(presupuesto|cotizacion|dame precio|precios)\b/.test(t)) return 'presupuesto';
  if (
    /\b(necesito|quiero|pedido|comprar|compro|reservar|me llevo|encargar|encargo)\b/.test(t) ||
    /(\d+\s*(unidades?|uni|unds|u|caja|kg))/.test(t)
  ) {
    return 'pedido';
  }
  if (/\b(cuanto|cuanta|cuesta|vale|precio|cotizacion)\b/.test(t)) return 'precio';
  if (/\b(tenes|tienen|hay|disponible|disponibles|stock|queda|quedan|haystock)\b/.test(t)) return 'stock';
  return 'otros';
}

function extractQuantity(text: string): number {
  const unit = /(\d+)\s*(?:unidades?|unidad|uni|unds?|u|kilos?|kg|cajas?)\b/i.exec(text);
  const bare = /\b(\d{1,4})\b/.exec(text);
  const n = unit ? parseInt(unit[1], 10) : bare ? parseInt(bare[1], 10) : 1;
  return n > 0 && n < 10000 ? n : 1;
}

async function handleQuote(from: string, product: Product | null, quantity: number): Promise<void> {
  const currency = getSetting('currency') || 'ARS';
  const business = getSetting('business_name') || 'Mi Negocio';
  if (!product) {
    await sendText(from, 'Para armar el presupuesto necesito saber el producto. Te dejo el catálogo:\n\n' + catalogText());
    return;
  }
  const quote = createQuote({
    customerName: `WhatsApp ${from}`,
    customerPhone: from,
    source: 'whatsapp',
    items: [{ productId: product.id, quantity, description: product.name }],
  });
  await sendQuote(quote.id, 'whatsapp');
  await sendText(
    from,
    `Listo ${business}! Armamos el presupuesto ${quote.quote_number} por ${money(quote.total, currency)} y te lo acabamos de enviar en PDF.\n¿Te gustaría confirmar el pedido?`
  );
}

async function handleOrder(from: string, text: string, product: Product | null, quantity: number): Promise<void> {
  const currency = getSetting('currency') || 'ARS';
  if (!product) {
    await sendText(from, '¿Qué producto necesitás? Te dejo el catálogo:\n\n' + catalogText());
    return;
  }
  if (product.stock <= 0) {
    await sendText(from, `Lo sentimos, ${product.name} está sin stock por ahora. ¿Querés que te avisemos cuando llegue o te armamos un presupuesto para más adelante?`);
    return;
  }
  const q = Math.min(quantity, product.stock);
  try {
    const order = createOrder({
      customerName: `WhatsApp ${from}`,
      customerPhone: from,
      source: 'whatsapp',
      items: [{ productId: product.id, quantity: q }],
      autoConfirm: true,
    });
    const pedidoParcial = q < quantity;
    const low = product.stock - q < product.min_stock;
    await sendText(
      from,
      `📦 Pedido ${order.order_number} confirmado\nProducto: ${product.name}\nCantidad: ${q}\nTotal: ${money(order.total, currency)}\n\n` +
        (pedidoParcial ? `⚠ Solo teníamos ${q} unidades disponibles de las ${quantity} pedidas.\n` : '') +
        (low ? '⚠ Quedó poco stock de este producto.\n' : '') +
        `Si necesitás algo más, escribime.`
    );
  } catch {
    await sendText(
      from,
      `Lo sentimos, no pudimos procesar el pedido de ${product.name} por falta de stock. ¿Querés que te avise cuando llegue?`
    );
  }
}

function greeting(): string {
  return (getSetting('whatsapp_greeting') || '').replace('{business}', getSetting('business_name'));
}

function menu(): string {
  return getSetting('whatsapp_menu') || 'Menú disponible.';
}
