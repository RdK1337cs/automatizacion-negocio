import { getDb } from './db';

const db = getDb();

const demoProducts: Array<{
  code: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  minStock: number;
}> = [
  { code: 'PRO-001', name: 'Mate de calabaza', description: 'Mate de calabaza estampado, 14 cm.', price: 3500, stock: 25, minStock: 5 },
  { code: 'PRO-002', name: 'Bombilla de acero', description: 'Bombilla de acero inoxidable, 17 cm.', price: 1800, stock: 40, minStock: 8 },
  { code: 'PRO-003', name: 'Té en hebras', description: 'Té en hebras sueltas, 100 g.', price: 2200, stock: 12, minStock: 5 },
  { code: 'PRO-004', name: 'Miel artesanal', description: 'Miel pura de la zona, 500 g.', price: 4200, stock: 6, minStock: 4 },
  { code: 'PRO-005', name: 'Alfajores caja x6', description: 'Caja de alfajores de chocolate x6.', price: 5400, stock: 3, minStock: 6 },
];

const existing = db.prepare('SELECT COUNT(*) AS n FROM products').get() as { n: number };
if (existing.n > 0) {
  console.log('El catálogo ya tiene productos. No se agregan datos de ejemplo.');
} else {
  const insert = db.prepare(
    'INSERT INTO products (code, name, description, price, stock, min_stock) VALUES (?, ?, ?, ?, ?, ?)'
  );
  for (const p of demoProducts) insert.run(p.code, p.name, p.description, p.price, p.stock, p.minStock);
  console.log(`Se cargaron ${demoProducts.length} productos de ejemplo.`);
}