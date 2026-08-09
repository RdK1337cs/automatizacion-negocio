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
  const { createUser, checkCredentials, deleteUser, getUserByUsername, updateUser } = await import('../src/services/user');
  const { sendVerificationCode, confirmVerificationCode } = await import('../src/services/userVerification');
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
    createUser({ username: 'operador_test', password: '1234', role: 'operador', dni: '30123456' });
    assert.ok(checkCredentials('operador_test', '1234'));
    assert.equal(checkCredentials('operador_test', 'mala'), null);
    assert.throws(
      () => createUser({ username: 'operador_test', password: '9999', role: 'admin', dni: '30123456' }),
      /Ya existe/
    );
  });

  await ok('Usuarios: DNI obligatorio y contraseña por defecto = DNI', () => {
    assert.throws(
      () => createUser({ username: 'sin_dni', password: '1234', role: 'operador', dni: '' }),
      /DNI/
    );
    const u = createUser({ username: 'dni_pass', role: 'operador', dni: '40555666', email: 'a@b.com', phone: '5491160000000' });
    assert.equal(u.dni, '40555666');
    assert.ok(checkCredentials('dni_pass', '40555666'), 'debe poder ingresar con su DNI como contraseña');
  });

  await ok('Contraseña: flag de cambio obligatorio al primer ingreso', async () => {
    const { changePassword } = await import('../src/services/user');
    const { beginLogin } = await import('../src/middleware/auth');
    assert.equal(getUserByUsername('dni_pass')!.must_change_password, 1, 'sin contraseña propia → debe cambiar');
    assert.equal(getUserByUsername('operador_test')!.must_change_password, 0, 'con contraseña propia → no debe cambiar');
    const login = beginLogin('dni_pass', '40555666', '203.0.113.8') as { must_change_password: boolean };
    assert.equal(login.must_change_password, true, 'el login expone el flag');
    changePassword(getUserByUsername('dni_pass')!.id, 'clave1234');
    assert.equal(getUserByUsername('dni_pass')!.must_change_password, 0, 'al cambiar contraseña se limpia');
    const login2 = beginLogin('dni_pass', 'clave1234', '203.0.113.7') as { must_change_password: boolean };
    assert.equal(login2.must_change_password, false);
  });

  await ok('Usuarios: registra IP del último ingreso', async () => {
    const { beginLogin } = await import('../src/middleware/auth');
    const { getUserByUsername } = await import('../src/services/user');
    beginLogin('dni_pass', '40555666', '203.0.113.7');
    assert.equal(getUserByUsername('dni_pass')!.last_ip, '203.0.113.7');
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
    const user = createUser({ username: 'pos_user', password: '1234', role: 'operador', dni: '31111222' });
    setPuntoVentaUsers(posId, [{ userId: user.id, role: 'operador' }]);
    assert.ok(getUserPuntoVentaIds(user.id).includes(posId));
    setPosDepositosReplace(posId, [depId]);
    assert.deepEqual(getDepositoIdsByPos(posId), [depId]);
    assert.ok(listPuntosVenta().some((p) => p.id === posId));
    void getDeposito;
  });

  await ok('2FA: admin con doble verificación, código visible en mensajes simulados', async () => {
    const { setSetting } = await import('../src/services/settings');
    const { beginLogin, verifyTwoFactorLogin } = await import('../src/middleware/auth');
    const config = await import('../src/config');

    setSetting('security_admin_2fa', '1');
    setSetting('security_2fa_phone', '5491199999999');

    const pending = beginLogin(config.config.adminUser, config.config.adminPassword);
    assert.ok(pending && 'pending2fa' in pending && pending.pending2fa, 'debe quedar pendiente de 2FA');
    assert.ok(pending.token, 'debe entregar un token pendiente');
    assert.equal(pending.phone, '5491199999999');

const sent = db
      .prepare("SELECT body FROM messages WHERE direction='out' ORDER BY id DESC LIMIT 1")
      .get() as { body: string } | undefined;
    assert.ok(sent, 'debe existir el mensaje simulado');
    const m = /código de verificación: (\d{6})/i.exec(sent!.body);
    assert.ok(m, 'el mensaje debe contener el código de 6 dígitos');
    const code = m![1];

    const expired = 'not-a-valid-token';
    assert.throws(
      () => verifyTwoFactorLogin(expired, code),
      (e) => /expir|inválid/.test((e as Error).message)
    );

    assert.throws(
      () => verifyTwoFactorLogin(pending.token, '000000'),
      /Código incorrecto/
    );

    const done = verifyTwoFactorLogin(pending.token, code);
    assert.ok(done.token.length > 20);
    assert.equal(done.role, 'admin');

    assert.throws(
      () => verifyTwoFactorLogin(pending.token, code),
      /ya fue utilizado/
    );

    const second = beginLogin(config.config.adminUser, config.config.adminPassword);
    assert.ok(second && 'pending2fa' in second, 'sigue pendiente mientras 2FA esté activo');
    const sent2 = db
      .prepare("SELECT body FROM messages WHERE direction='out' ORDER BY id DESC LIMIT 1")
      .get() as { body: string };
    const m2 = /código de verificación: (\d{6})/i.exec(sent2.body);
    assert.ok(m2, 'segundo login debe generar un nuevo código');
    assert.notEqual(m2![1], code, 'cada login genera un código distinto');
    const done2 = verifyTwoFactorLogin(second.token, m2![1]);
    assert.equal(done2.role, 'admin');

    setSetting('security_admin_2fa', '0');
    const no2fa = beginLogin(config.config.adminUser, config.config.adminPassword);
    assert.ok(no2fa && !('pending2fa' in no2fa), 'con 2FA apagado el login es directo');
  });

  await ok('Logo: guarda, lee y elimina el logo de la empresa', async () => {
    const { uploadBusinessLogo, removeBusinessLogo, businessLogoInfo } = await import('../src/services/businessLogo');
    const png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    uploadBusinessLogo(png);
    const info = businessLogoInfo();
    assert.ok(info, 'debe existir el logo');
    assert.equal(info!.mime, 'image/png');
    assert.ok(fs.existsSync(info!.filePath));
    assert.throws(() => uploadBusinessLogo('data:text/plain;base64,AA=='), /Formato de logo/);
    removeBusinessLogo();
    assert.equal(businessLogoInfo(), null, 'tras quitar no debe existir');
  });

  await ok('Verificación: email y teléfono envían código y verifican al usuario', () => {
    const u = createUser({
      username: 'verify_user',
      role: 'operador',
      dni: '40888999',
      email: 'verify@corp.com',
      phone: '5491122334444',
    });
    sendVerificationCode(u.id, 'email');
    const email = db.prepare('SELECT body FROM emails ORDER BY id DESC LIMIT 1').get() as { body: string };
    assert.ok(/verificaci/i.test(email.body), 'el email debe contener el código');
    const m = /(\d{6})/.exec(email.body);
    assert.ok(m, 'código en el mail');
    assert.throws(() => confirmVerificationCode(u.id, 'email', '111111'), /Código incorrecto/);
    confirmVerificationCode(u.id, 'email', m![1]);
    assert.equal(getUserByUsername('verify_user')!.email_verified, 1, 'email marcado verificado');

    sendVerificationCode(u.id, 'sms');
    const msg = db
      .prepare("SELECT body FROM messages WHERE direction='out' ORDER BY id DESC LIMIT 1")
      .get() as { body: string };
    const m2 = /verificación: (\d{6})/i.exec(msg.body);
    assert.ok(m2, 'código en el mensaje de WhatsApp');
    confirmVerificationCode(u.id, 'sms', m2![1]);
    assert.equal(getUserByUsername('verify_user')!.phone_verified, 1, 'teléfono marcado verificado');
  });

  await ok('Verificación: cambiar email o teléfono desactiva la verificación previa', () => {
    const u = getUserByUsername('verify_user')!;
    updateUser(u.id, { email: 'otro@corp.com' });
    assert.equal(getUserByUsername('verify_user')!.email_verified, 0, 'al cambiar email se desverifica');
  });

  console.log('\nResultado:');
  console.log(failures.length === 0 ? '  TODOS LOS TESTS PASARON' : `  ${failures.length} test(s) fallaron`);
  process.exit(failures.length ? 1 : 0);
}

main().catch((err) => {
  console.error('Fallo la suite:', err);
  process.exit(1);
});