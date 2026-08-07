import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../lib/http';
import { allSettings, setSettings } from '../services/settings';

export const settingsRouter = Router();

settingsRouter.get('/', ah((_req, res) => {
  res.json(allSettings());
}));

settingsRouter.put('/', ah((req, res) => {
  const pairs = z.record(z.string(), z.string().max(2000)).parse(req.body);
  setSettings(pairs);
  res.json(allSettings());
}));