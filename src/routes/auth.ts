import { Router } from 'express';
import { z } from 'zod';
import { login, authRequired } from '../middleware/auth';
import { ah } from '../lib/http';

export const authRouter = Router();

authRouter.post(
  '/login',
  ah((req, res) => {
    const { username, password } = z
      .object({ username: z.string().min(1), password: z.string().min(1) })
      .parse(req.body);
    const result = login(username, password);
    if (!result) {
      res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
      return;
    }
    res.json(result);
  })
);

authRouter.get('/me', authRequired, (req, res) => {
  res.json({ username: req.user!.username, role: req.user!.role });
});