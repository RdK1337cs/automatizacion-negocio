import { handleIncoming } from '../src/services/bot';
import { getDb } from '../src/db/db';

async function main() {
  const db = getDb();
  db.exec(
    'DELETE FROM messages; DELETE FROM order_items; DELETE FROM orders; DELETE FROM quote_items; DELETE FROM quotes; DELETE FROM stock_movements;'
  );
  db.prepare('UPDATE products SET stock = 10').run();
  console.log('--- prueba 1: saludo ---');
  await handleIncoming('5491100001111', 'hola, buenas tardes');
  console.log('--- prueba 2: precio ---');
  await handleIncoming('5491100001111', 'cuanto cuesta la miel');
  console.log('--- prueba 3: stock ---');
  await handleIncoming('5491100001111', 'tenés bomba de acero?');
  console.log('--- prueba 4: pedido ---');
  await handleIncoming('5491100001111', 'necesito 2 de miel');
  console.log('--- prueba 5: presupuesto ---');
  await handleIncoming('5491100001111', 'presupuesto de alfajores');
  console.log('--- prueba 6: pedido con nombre corto ---');
  await handleIncoming('5491100001111', 'necesito 4 unidades de te');
  console.log('--- prueba 7: precio mate ---');
  await handleIncoming('5491100001111', 'precio de mate');
  console.log('--- prueba 8: menu ---');
  await handleIncoming('5491100001111', 'menu');
  console.log('--- prueba 9: stock alfajores ---');
  await handleIncoming('5491100001111', 'tenes stock de alfajores');
  const msgs = db.prepare('SELECT direction, body, intent FROM messages ORDER BY id').all() as any[];
  console.log('\n=== LOG DE MENSAJES ===');
  for (const m of msgs) console.log(`[${m.direction}] intent=${m.intent} | ${m.body}`);
  const orders = db.prepare('SELECT order_number, status, total FROM orders').all() as any[];
  console.log('\n--- PEDIDOS ---');
  for (const o of orders) console.log(`${o.order_number} ${o.status} ${o.total}`);
  const quotes = db.prepare('SELECT quote_number, status, total FROM quotes').all() as any[];
  console.log('\n--- PRESUPUESTOS ---');
  for (const q of quotes) console.log(`${q.quote_number} ${q.status} ${q.total}`);
  const prod = db.prepare('SELECT name, stock FROM products').all() as any[];
  console.log('\n--- STOCK ---');
  for (const p of prod) console.log(`${p.name}: ${p.stock}`);
}

main().catch((e) => {
  console.error('ERROR:', e);
  process.exit(1);
});