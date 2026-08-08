import { Router } from 'express';
import { ah } from '../lib/http';
import { getDb } from '../db/db';
import { productsForBase } from '../services/productos';
import { getDepositoIdsByPos, listPuntosVenta } from '../services/pos';
import { getSetting } from '../services/settings';

export const dashboardRouter = Router();

dashboardRouter.get(
  '/',
  ah((req, res) => {
    const db = getDb();
    const posId = Number(req.query.pos ?? 0);
    const baseId = Number(req.query.base ?? 0);
    const count = (sql: string, args: Array<string | number> = []) =>
      (db.prepare(sql).get(...args) as { n: number }).n;
    const posWhere = posId > 0 ? 'AND pos_id = ?' : '';
    const posArgs: Array<string | number> = posId > 0 ? [posId] : [];

    const orders = count(`SELECT COUNT(*) AS n FROM orders WHERE 1=1 ${posWhere}`, posArgs);
    const pending = count(`SELECT COUNT(*) AS n FROM orders WHERE status = 'pending' ${posWhere}`, posArgs);
    const confirmed = count(`SELECT COUNT(*) AS n FROM orders WHERE status = 'confirmed' ${posWhere}`, posArgs);
    const cancelled = count(`SELECT COUNT(*) AS n FROM orders WHERE status = 'cancelled' ${posWhere}`, posArgs);
    const quotes = count(`SELECT COUNT(*) AS n FROM quotes WHERE 1=1 ${posWhere}`, posArgs);
    const quotesSent = count(`SELECT COUNT(*) AS n FROM quotes WHERE status = 'sent' ${posWhere}`, posArgs);
    const products = count('SELECT COUNT(*) AS n FROM products WHERE active = 1');
    const totalRevenue = (
      db
        .prepare(
          `SELECT COALESCE(SUM(total),0) AS t FROM orders WHERE status IN ('confirmed','delivered') ${posWhere}`
        )
        .get(...posArgs) as { t: number }
    ).t;
    const messagesIn = count("SELECT COUNT(*) AS n FROM messages WHERE direction = 'in'");

    const recentOrders = db
      .prepare(`SELECT * FROM orders WHERE 1=1 ${posWhere} ORDER BY id DESC LIMIT 5`)
      .all(...posArgs);

    let lowStock: Array<{ id: number; name: string; stock: number; minStock: number }> = [];
    try {
      const effectiveBase = baseId || Number(getSetting('whatsapp_default_base') || 1);
      const deposits = posId > 0 ? getDepositoIdsByPos(posId) : [];
      const list = productsForBase(effectiveBase, deposits);
      lowStock = list
        .filter((p) => p.stock_total <= p.min_stock)
        .map((p) => ({ id: p.id, name: p.name, stock: p.stock_total, minStock: p.min_stock }));
    } catch {
      /* sin base con productos cargada todavía */
    }

    res.json({
      orders,
      pending,
      confirmed,
      cancelled,
      quotes,
      quotesSent,
      products,
      totalRevenue,
      messagesIn,
      recentOrders,
      lowStock,
      posOptions: listPuntosVenta(),
    });
  })
);