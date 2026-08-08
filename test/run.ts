import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'negocio-test-'));
  process.env.DB_FILE = ':memory:';
  process.env.DATA_DIR = tmp;

  const { getDb } = await import('../src/db/db');
  const { adjustStock } = await import('../src/services/stock');
  const { createOrder, confirmOrder, cancelOrder } = await import('../src/services/order');
  const { createQuote } = await import('../src/services/quote');
  const { buildQuotePdf } = await import('../src/services/pdf');
  const { handleIncoming } = await import('../src/services/bot');
  const { createUser, checkCredentials, deleteUser } = await import('../src/services/user');
  const { saveProductImage, productImageInfo } = await import('../src/services/productImage');
  const { createProduct, addProductToBase } = await import('../src/services/productos');
  const { productsForBase } = await import('../src/services/productos');
  const { listBases, getBase } = await import('../src/services/catalogo');
  const {
    createDeposito,
    getDeposito,
    setPosDepositosReplace,
    setPuntoVentaUsers,
    getUserPuntoVentaIds,
    getDepositoIdsByPos,
    listPuntosVenta,
  } = await import('../src/services/pos');

  const db = getDb();
  const baseId = listBases()[0].id;
  const depId = Number(db.prepare('SELECT id FROM depositos ORDER BY id ASC LIMIT 1').get()!.id);
  const posId = Number(db.prepare('SELECT id FROM puntos_venta ORDER BY id ASC LIMIT 1').get()!.id);

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

  function seedProduct(code: string, qty: number): number {
    const p = createProduct({ code, name: `Prod ${code}`, description: '' });
    addProductToBase(p.id, baseId, 100, 2);
    adjustStock(p.id, depId, qty, 'test setup');
    return p.id;
  }

  await ok('Stock: ajusta stock por depósito y registra movimiento', () => {
    const id = seedProduct('T1', 5);
    const next = adjustStock(id, depId, 3, 'reposicion');
    assert.equal(next, 8);
    const moves = db.prepare('SELECT * FROM stock_movements WHERE product_id=? AND deposito_id=?').all(id, depId) as any[];
    assert.equal(moves.length, 2);
    assert.equal(moves[0].type, 'in');
  });

  await ok('Stock: rechaza ajuste que dejaría stock negativo', () => {
    const id = seedProduct('T2', 1);
    assert.throws(() => adjustStock(id, depId, -5, 'venta'), /Stock insuficiente/);
  });

  await ok('Pedidos: confirmar descuenta stock y cancelar lo restaura', () => {
    const pid = seedProduct('T3', 10);
    const order = createOrder({
      customerName: 'Cliente',
      source: 'panel',
      posId,
      baseId,
      depositoId: depId,
      items: [{ productId: pid, quantity: 3 }],
    });
    assert.equal(order.status, 'pending');
    assert.equal(
      (db.prepare('SELECT quantity FROM product_stock WHERE product_id=? AND deposito_id=?').get(pid, depId) as any).quantity,
      10
    );

    const confirmed = confirmOrder(order.id);
    assert.equal(confirmed.status, 'confirmed');
    assert.equal(
      (db.prepare('SELECT quantity FROM product_stock WHERE product_id=? AND deposito_id=?').get(pid, depId) as any).quantity,
      7
    );

    const cancelled = cancelOrder(order.id);
    assert.equal(cancelled.status, 'cancelled');
    assert.equal(
      (db.prepare('SELECT quantity FROM product_stock WHERE product_id=? AND deposito_id=?').get(pid, depId) as any).quantity,
      10
    );
  });

  await ok('Presupuesto: calcula total y genera PDF', async () => {
    const pid = seedProduct('T4', 5);
    const quote = createQuote({
      customerName: 'Juan',
      source: 'panel',
      posId,
      baseId,
      depositoId: depId,
      items: [{ productId: pid, quantity: 2, description: 'Match' }],
    });
    assert.equal(quote.total, 200);
    const pdf = await buildQuotePdf(quote, quote.items ?? []);
    assert.equal(pdf.slice(0, 5).toString(), '%PDF-');
  });

  await ok('Bot: detecta pedido, crea orden confirmada y descuenta stock', async () => {
    const pid = createProduct({ code: 'T5', name: 'Cafe', description: '' }).id;
    addProductToBase(pid, baseId, 50, 2);
    adjustStock(pid, depId, 9, 'test setup');
    await handleIncoming('5491111111111', 'necesito 3 unidades de cafe');
    const orders = db.prepare("SELECT * FROM orders WHERE customer_phone='5491111111111'").all() as any[];
    assert.equal(orders.length, 1);
    assert.equal(orders[0].status, 'confirmed');
    assert.equal(
      (db.prepare('SELECT quantity FROM product_stock WHERE product_id=? AND deposito_id=?').get(pid, depId) as any).quantity,
      6
    );
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
    const id = seedProduct('T6', 1);
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    saveProductImage(id, `data:image/png;base64,${png}`);
    const info = productImageInfo(id);
    assert.ok(info, 'debería existir la foto');
    assert.equal(info!.mime, 'image/png');
    assert.ok(fs.existsSync(info!.filePath));
    assert.throws(() => saveProductImage(id, 'data:text/plain;base64,AA=='), /Formato de imagen/);
  });

  await ok('Catálogos: crea bases y asigna producto con precio', () => {
    const list = listBases();
    assert.ok(list.length >= 1);
    const pid = seedProduct('T7', 2);
    const row = db.prepare('SELECT price FROM product_bases WHERE product_id=? AND base_id=?').get(pid, baseId) as any;
    assert.equal(row.price, 100);
    const view = productsForBase(baseId, [depId]).find((p) => p.id === pid);
    assert.ok(view, 'el producto debe aparecer en la base');
    assert.equal(view!.stock_total, 2);
  });

  await ok('Depósitos: ajusta stock por depósito y lo lee', () => {
    const d2 = createDeposito({ name: 'Depósito Secundario' }).id;
    const pid = seedProduct('T8', 4);
    adjustStock(pid, d2, 6, 'test setup');
    const view = productsForBase(baseId, [depId, d2]).find((p) => p.id === pid)!;
    assert.equal(view.stock_total, 10);
    assert.equal(view.by_deposito.find((d) => d.deposito_id === d2)!.quantity, 6);
  });

  await ok('POS: asigna depósitos y usuarios con rol', () => {
    const user = createUser({ username: 'pos_user', password: '1234', role: 'operador' });
    setPuntoVentaUsers(posId, [{ userId: user.id, role: 'operador' }]);
    assert.ok(getUserPuntoVentaIds(user.id).includes(posId));
    setPosDepositosReplace(posId, [depId]);
    assert.deepEqual(getDepositoIdsByPos(posId), [depId]);
    assert.ok(listPuntosVenta().some((p) => p.id === posId));
    void getDeposito;
  });

  console.log('\nResultado:');
  console.log(failures.length === 0 ? '  TODOS LOS TESTS PASARON' : `  ${failures.length} test(s) fallaron`);
  process.exit(failures.length ? 1 : 0);
}

main().catch((err) => {
  console.error('Fallo la suite:', err);
  process.exit(1);
});