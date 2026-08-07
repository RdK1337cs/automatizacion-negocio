import { Router } from 'express';
import { ah } from '../lib/http';
import { getDb } from '../db/db';

export const logsRouter = Router();

logsRouter.get(
  '/messages',
  ah((req, res) => {
    const limit = Math.min(Number(req.query.limit ?? 100), 500);
    const rows = getDb()
      .prepare('SELECT * FROM messages ORDER BY id DESC LIMIT ?')
      .all(limit);
    res.json(rows);
  })
);

logsRouter.get(
  '/emails',
  ah((req, res) => {
    const limit = Math.min(Number(req.query.limit ?? 100), 500);
    const rows = getDb()
      .prepare('SELECT * FROM emails ORDER BY id DESC LIMIT ?')
      .all(limit);
    res.json(rows);
  })
);

logsRouter.get(
  '/movements',
  ah((req, res) => {
    const limit = Math.min(Number(req.query.limit ?? 100), 500);
    const rows = getDb()
      .prepare(
        `SELECT m.*, p.name AS product_name
         FROM stock_movements m
         JOIN products p ON p.id = m.product_id
         ORDER BY m.id DESC LIMIT ?`
      )
      .all(limit);
    res.json(rows);
  })
);