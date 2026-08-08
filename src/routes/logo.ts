import { Router } from 'express';
import { z } from 'zod';
import { HttpError, ah } from '../lib/http';
import { authRequired } from '../middleware/auth';
import { uploadBusinessLogo, removeBusinessLogo, businessLogoInfo } from '../services/businessLogo';

export const logoRouter = Router();

// Público: el login necesita mostrar el logo sin sesión.
logoRouter.get('/', ah((_req, res) => {
  const info = businessLogoInfo();
  if (!info) throw new HttpError(404, 'Sin logo');
  res.type(info.mime).sendFile(info.filePath);
}));

logoRouter.post('/', authRequired, ah((req, res) => {
  const { imageBase64 } = z.object({ imageBase64: z.string().min(1) }).parse(req.body);
  uploadBusinessLogo(imageBase64);
  res.json({ ok: true });
}));

logoRouter.delete('/', authRequired, ah((req, res) => {
  removeBusinessLogo();
  res.status(204).send();
}));