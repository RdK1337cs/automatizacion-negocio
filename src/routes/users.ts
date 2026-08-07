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
} from '../services/user';

export const usersRouter = Router();

const roleSchema = z.enum(ROLES);

const createSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(4),
  role: roleSchema.default('operador'),
});

const updateSchema = z.object({
  role: roleSchema.optional(),
  active: z.boolean().optional(),
});

usersRouter.get('/', ah((_req, res) => {
  res.json(listUsers());
}));

usersRouter.post('/', ah((req, res) => {
  const data = createSchema.parse(req.body);
  res.status(201).json(createUser(data));
}));

usersRouter.put('/:id', ah((req, res) => {
  const id = Number(req.params.id);
  if (id === req.user!.id) {
    throw new HttpError(400, 'No podés modificar tu propio usuario desde aquí');
  }
  const data = updateSchema.parse(req.body);
  res.json(updateUser(id, data));
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