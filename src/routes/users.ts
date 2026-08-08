import { Router } from 'express';
import { z } from 'zod';
import { HttpError, ah } from '../lib/http';
import {
  listUsers,
  createUser,
  updateUser,
  changePassword,
  deleteUser,
  ROLES,
  assignUserPositions,
} from '../services/user';

export const usersRouter = Router();

const roleSchema = z.enum(ROLES);

const createSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(4),
  role: roleSchema.default('operador'),
  posIds: z.array(z.number().int().positive()).optional().default([]),
});

const updateSchema = z.object({
  role: roleSchema.optional(),
  active: z.boolean().optional(),
  posIds: z.array(z.number().int().positive()).optional(),
});

usersRouter.get('/', ah((_req, res) => {
  res.json(listUsers());
}));

usersRouter.post('/', ah((req, res) => {
  const data = createSchema.parse(req.body);
  const created = createUser(data);
  assignUserPositions(created.id, data.posIds);
  res.status(201).json(listUsers().find((u) => u.id === created.id));
}));

usersRouter.put('/:id', ah((req, res) => {
  const id = Number(req.params.id);
  if (id === req.user!.id) {
    throw new HttpError(400, 'No podés modificar tu propio usuario desde aquí');
  }
  const data = updateSchema.parse(req.body);
  const updated = updateUser(id, data);
  if (data.posIds) assignUserPositions(id, data.posIds);
  res.json(listUsers().find((u) => u.id === updated.id));
}));

usersRouter.patch('/:id/password', ah((req, res) => {
  const id = Number(req.params.id);
  const { password } = z.object({ password: z.string().min(4) }).parse(req.body);
  changePassword(id, password);
  res.json({ ok: true });
}));

usersRouter.delete('/:id', ah((req, res) => {
  const id = Number(req.params.id);
  if (id === req.user!.id) {
    throw new HttpError(400, 'No podés eliminar tu propio usuario');
  }
  deleteUser(id);
  res.status(204).send();
}));