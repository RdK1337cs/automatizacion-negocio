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
import { sendVerificationCode, confirmVerificationCode } from '../services/userVerification';

export const usersRouter = Router();

const roleSchema = z.enum(ROLES);

const createSchema = z.object({
  username: z.string().min(3),
  password: z.string().optional(),
  role: roleSchema.default('operador'),
  dni: z.string().min(4),
  email: z.string().email().optional().or(z.literal('')).optional(),
  phone: z.string().optional(),
  posIds: z.array(z.number().int().positive()).optional().default([]),
});

const updateSchema = z.object({
  role: roleSchema.optional(),
  active: z.boolean().optional(),
  dni: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')).optional(),
  phone: z.string().optional(),
  posIds: z.array(z.number().int().positive()).optional(),
});

const channelSchema = z.enum(['email', 'sms']);

usersRouter.get('/', ah((_req, res) => {
  res.json(listUsers());
}));

usersRouter.post('/', ah((req, res) => {
  const data = createSchema.parse(req.body);
  const created = createUser({
    username: data.username,
    password: data.password ?? '',
    role: data.role,
    dni: data.dni,
    email: data.email,
    phone: data.phone,
  });
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

// Verificación por email / SMS: envío del código
usersRouter.post('/:id/verify/send', ah((req, res) => {
  const id = Number(req.params.id);
  const channel = channelSchema.parse(req.body.channel);
  sendVerificationCode(id, channel);
  res.json({ ok: true });
}));

// Verificación por email / SMS: confirmación del código
usersRouter.post('/:id/verify/confirm', ah((req, res) => {
  const id = Number(req.params.id);
  const { channel, code } = z
    .object({ channel: channelSchema, code: z.string().min(6) })
    .parse(req.body);
  confirmVerificationCode(id, channel, code);
  res.json(listUsers().find((u) => u.id === id));
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