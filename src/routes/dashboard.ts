import { Router } from 'express';
import { ah } from '../lib/http';
import { getDb } from '../db/db';
import { lowStockProducts } from '../services/stock';

export const dashboardRouter = Router();

dashboardRouter.get(
  '/',
  ah((_req, res) => {
    const db = getDb();
    const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;

    const orders = count('SELECT COUNT(*) AS n FROM orders');
    const pending = count("SELECT COUNT(*) AS n FROM orders WHERE status = 'pending'");
    const confirmed = count("SELECT COUNT(*) AS n FROM orders WHERE status = 'confirmed'");
    const cancelled = count("SELECT COUNT(*) AS n FROM orders WHERE status = 'cancelled'");
    const quotes = count('SELECT COUNT(*) AS n FROM quotes');
    const quotesSent = count("SELECT COUNT(*) AS n FROM quotes WHERE status = 'sent'");
    const products = count('SELECT COUNT(*) AS n FROM products WHERE active = 1');
    const totalRevenue = (db.prepare("SELECT COALESCE(SUM(total),0) AS t FROM orders WHERE status IN ('confirmed','delivered')").get() as { t: number }).t;
    const messagesIn = count("SELECT COUNT(*) AS n FROM messages WHERE direction = 'in'");

    const recentOrders = db
      .prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 5')
      .all();
    const lowStock = lowStockProducts();

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
    });
  })
);