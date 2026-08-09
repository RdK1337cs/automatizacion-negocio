import { Router } from 'express';
import { z } from 'zod';
import { beginLogin, verifyTwoFactorLogin, authRequired } from '../middleware/auth';
import { changePassword } from '../services/user';
import { ah } from '../lib/http';

export const authRouter = Router();

authRouter.post(
  '/login',
  ah((req, res) => {
    const { username, password } = z
      .object({ username: z.string().min(1), password: z.string().min(1) })
      .parse(req.body);
    const result = beginLogin(username, password, req.ip ?? '');
    if (!result) {
      res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
      return;
    }
    res.json(result);
  })
);

authRouter.post(
  '/2fa/verify',
  ah((req, res) => {
    const { token, code } = z
      .object({ token: z.string().min(1), code: z.string().min(1) })
      .parse(req.body);
    res.json(verifyTwoFactorLogin(token, code));
  })
);

authRouter.get('/me', authRequired, (req, res) => {
  res.json({ username: req.user!.username, role: req.user!.role });
});

// Cambio de contraseña del usuario logueado (primer ingreso / cambio voluntario)
authRouter.post('/me/password', authRequired, (req, res) => {
  const { password } = z.object({ password: z.string().min(4) }).parse(req.body);
  changePassword(req.user!.id, password);
  res.json({ ok: true });
});