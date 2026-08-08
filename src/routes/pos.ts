import { Router } from 'express';
import { z } from 'zod';
import { HttpError, ah } from '../lib/http';
import {
  listPuntosVenta,
  listPuntosVentaWithDetails,
  createPuntoVenta,
  updatePuntoVenta,
  deletePuntoVenta,
  puntoVentaWithDetails,
  getUserPuntoVentaIds,
  setPosDepositosReplace,
  setPuntoVentaUsers,
} from '../services/pos';

export const posRouter = Router();

const posSchema = z.object({
  name: z.string().min(1),
  location: z.string().optional().default(''),
  active: z.boolean().optional().default(true),
});

posRouter.get('/', ah((_req, res) => {
  res.json(listPuntosVentaWithDetails());
}));

posRouter.get('/mine', ah((req, res) => {
  const ids = getUserPuntoVentaIds(req.user!.id);
  res.json(listPuntosVenta().filter((p) => ids.includes(p.id)));
}));

posRouter.get('/:id', ah((req, res) => {
  const pos = puntoVentaWithDetails(Number(req.params.id));
  if (!pos) throw new HttpError(404, 'Punto de venta no encontrado');
  res.json(pos);
}));

posRouter.post('/', ah((req, res) => {
  const data = posSchema.parse(req.body);
  const pos = createPuntoVenta({ name: data.name, location: data.location });
  res.status(201).json(puntoVentaWithDetails(pos.id));
}));

posRouter.put('/:id', ah((req, res) => {
  const data = posSchema.parse(req.body);
  updatePuntoVenta(Number(req.params.id), data);
  res.json(puntoVentaWithDetails(Number(req.params.id)));
}));

posRouter.delete('/:id', ah((req, res) => {
  deletePuntoVenta(Number(req.params.id));
  res.status(204).send();
}));

posRouter.post('/:id/depositos', ah((req, res) => {
  const { depositoIds } = z.object({ depositoIds: z.array(z.number().int().positive()) }).parse(req.body);
  setPosDepositosReplace(Number(req.params.id), depositoIds);
  res.json(puntoVentaWithDetails(Number(req.params.id)));
}));

posRouter.post('/:id/users', ah((req, res) => {
  const { assignments } = z
    .object({
      assignments: z.array(z.object({ userId: z.number().int().positive(), role: z.enum(['operador', 'lector']) })),
    })
    .parse(req.body);
  setPuntoVentaUsers(Number(req.params.id), assignments);
  res.json(puntoVentaWithDetails(Number(req.params.id)));
}));