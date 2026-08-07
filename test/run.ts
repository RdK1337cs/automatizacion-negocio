import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'negocio-test-'));
  process.env.DB_FILE = ':memory:';
  process.env.DATA_DIR = tmp;

  const { getDb } = await import('../src/db/db');
  const { applySchema } = await import('../src/db/db');
  const { adjustStock } = await import('../src/services/stock');
  const { createOrder, confirmOrder, cancelOrder } = await import('../src/services/order');
  const { createQuote } = await import('../src/services/quote');
  const { buildQuotePdf } = await import('../src/services/pdf');
  const { handleIncoming } = await import('../src/services/bot');
  const { createUser, checkCredentials, deleteUser } = await import('../src/services/user');
  const { saveProductImage, productImageInfo } = await import('../src/services/productImage');

  const db = getDb();
  let passed = 0;
  const failures: string[] = [];

  function ok(name: string, fn: () => void | Promise<void>) {
    return Promise.resolve()
      .then(fn)
      .then(() => {
        passed++;
        console.log(`  ✓ ${name}`);
      })
      .catch((err) => {
        failures.push(name);
        console.log(`  ✗ ${name}`);
        console.log(`      ${(err as Error).message}`);
      });
  }

  await ok('Stock: ajusta stock y registra movimiento', () => {
    const id = Number(
      db
        .prepare("INSERT INTO products (code, name, price, stock, min_stock) VALUES ('T1','Test','10',5,2)")
        .run().lastInsertRowid
    );
    const updated = adjustStock(id, 3, 'reposicion');
    assert.equal(updated.stock, 8);
    const moves = db.prepare('SELECT * FROM stock_movements WHERE product_id=?').all(id) as any[];
    assert.equal(moves.length, 1);
    assert.equal(moves[0].type, 'in');
  });

  await ok('Stock: rechaza ajuste que dejaría stock negativo', () => {
    const id = Number(
      db
        .prepare("INSERT INTO products (code, name, price, stock, min_stock) VALUES ('T2','B','10',1,0)")
        .run().lastInsertRowid
    );
    assert.throws(() => adjustStock(id, -5, 'venta'), /Stock insuficiente/);
  });

  await ok('Pedidos: confirmar descuenta stock y cancelar lo restaura', () => {
    const pid = Number(
      db
        .prepare("INSERT INTO products (code, name, price, stock, min_stock) VALUES ('T3','Alfa',100,10,2)")
        .run().lastInsertRowid
    );
    const order = createOrder({ customerName: 'Cliente', source: 'panel', items: [{ productId: pid, quantity: 3 }] });
    assert.equal(order.status, 'pending');
    assert.equal((db.prepare('SELECT stock FROM products WHERE id=?').get(pid) as any).stock, 10);

    const confirmed = confirmOrder(order.id);
    assert.equal(confirmed.status, 'confirmed');
    assert.equal((db.prepare('SELECT stock FROM products WHERE id=?').get(pid) as any).stock, 7);

    const cancelled = cancelOrder(order.id);
    assert.equal(cancelled.status, 'cancelled');
    assert.equal((db.prepare('SELECT stock FROM products WHERE id=?').get(pid) as any).stock, 10);
  });

  await ok('Presupuesto: calcula total y genera PDF', async () => {
    const pid = Number(
      db
        .prepare("INSERT INTO products (code, name, price, stock, min_stock) VALUES ('T4','Match',500,5,1)")
        .run().lastInsertRowid
    );
    const quote = createQuote({ customerName: 'Juan', source: 'panel', items: [{ productId: pid, quantity: 2, description: 'Match' }] });
    assert.equal(quote.total, 1000);
    const pdf = await buildQuotePdf(quote, quote.items ?? []);
    assert.equal(pdf.slice(0, 5).toString(), '%PDF-');
  });

  await ok('Bot: detecta pedido, crea orden confirmada y descuenta stock', async () => {
    const pid = Number(
      db
        .prepare("INSERT INTO products (code, name, price, stock, min_stock) VALUES ('T5','Cafe',50,9,2)")
        .run().lastInsertRowid
    );
    await handleIncoming('5491111111111', 'necesito 3 unidades de cafe');
    const orders = db.prepare("SELECT * FROM orders WHERE customer_phone='5491111111111'").all() as any[];
    assert.equal(orders.length, 1);
    assert.equal(orders[0].status, 'confirmed');
    assert.equal((db.prepare('SELECT stock FROM products WHERE id=?').get(pid) as any).stock, 6);
  });

  await ok('Usuarios: crea, valida credenciales y evita duplicados', () => {
    createUser({ username: 'operador_test', password: '1234', role: 'operador' });
    assert.ok(checkCredentials('operador_test', '1234'));
    assert.equal(checkCredentials('operador_test', 'mala'), null);
    assert.throws(() => createUser({ username: 'operador_test', password: '9999', role: 'admin' }), /Ya existe/);
  });

  await ok('Usuarios: no permite borrar al último administrador', () => {
    const admin = db.prepare("SELECT id FROM users WHERE role='admin'").get() as { id: number };
    assert.throws(() => deleteUser(admin.id), /Debe existir al menos un administrador/);
    const others = db.prepare("SELECT id FROM users WHERE username='operador_test'").get() as { id: number };
    deleteUser(others.id);
  });

  await ok('Productos: guarda y recupera la foto', () => {
    const id = Number(
      db
        .prepare("INSERT INTO products (code, name, price, stock, min_stock) VALUES ('T6','Foto',10,1,0)")
        .run().lastInsertRowid
    );
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    saveProductImage(id, `data:image/png;base64,${png}`);
    const info = productImageInfo(id);
    assert.ok(info, 'debería existir la foto');
    assert.equal(info!.mime, 'image/png');
    assert.ok(fs.existsSync(info!.filePath));
    assert.throws(() => saveProductImage(id, 'data:text/plain;base64,AA=='), /Formato de imagen/);
  });

  void applySchema;

  console.log('\nResultado:');
  console.log(failures.length === 0 ? '  TODOS LOS TESTS PASARON' : `  ${failures.length} test(s) fallaron`);
  process.exit(failures.length ? 1 : 0);
}

main().catch((err) => {
  console.error('Fallo la suite:', err);
  process.exit(1);
});