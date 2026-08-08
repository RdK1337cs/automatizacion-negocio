import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import { config } from '../config';
import { HttpError } from '../lib/http';
import { checkCredentials, getUserByUsername, touchLogin } from '../services/user';
import { twoFactorEnabled, beginTwoFactor, verifyTwoFactor } from '../services/twofactor';

export interface AuthedUser {
  id: number;
  username: string;
  role: 'admin' | 'operador' | 'lector';
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthedUser;
    }
  }
}

export type LoginResult =
  | { token: string; role: string }
  | { pending2fa: true; token: string; phone: string }
  | null;

export function beginLogin(username: string, password: string): LoginResult {
  const user = checkCredentials(username, password);
  if (!user) return null;
  touchLogin(user.id);
  if (user.role === 'admin' && twoFactorEnabled()) {
    const phone = beginTwoFactor(user.id);
    return {
      pending2fa: true,
      token: jwt.sign({ sub: user.id, username: user.username, role: user.role, stage: '2fa' }, config.jwtSecret, {
        expiresIn: '5m',
      }),
      phone,
    };
  }
  return {
    token: jwt.sign({ sub: user.id, username: user.username, role: user.role }, config.jwtSecret, {
      expiresIn: '12h',
    }),
    role: user.role,
  };
}

export function verifyTwoFactorLogin(pendingToken: string, code: string): { token: string; role: string } {
  let payload: { sub?: number; username?: string; role?: string; stage?: string };
  try {
    payload = jwt.verify(pendingToken, config.jwtSecret) as typeof payload;
  } catch {
    throw new HttpError(401, 'La verificación expiró. Volvé a iniciar sesión.');
  }
  if (payload.stage !== '2fa' || !payload.username) {
    throw new HttpError(400, 'Token de verificación inválido');
  }
  const user = getUserByUsername(payload.username);
  if (!user || !user.active) throw new HttpError(401, 'Usuario inválido o desactivado');
  verifyTwoFactor(user.id, code);
  return {
    token: jwt.sign({ sub: user.id, username: user.username, role: user.role }, config.jwtSecret, {
      expiresIn: '12h',
    }),
    role: user.role,
  };
}

export function authRequired(req: Request, res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: 'No autorizado' });
    return;
  }
  let payload: { sub?: number; username?: string; role?: string; stage?: string };
  try {
    payload = jwt.verify(token, config.jwtSecret) as typeof payload;
  } catch {
    res.status(401).json({ error: 'Sesión inválida o expirada' });
    return;
  }
  if (payload.stage === '2fa') {
    res.status(401).json({ error: 'Completá la verificación en dos pasos' });
    return;
  }
  const user = getUserByUsername(payload.username ?? '');
  if (!user) {
    res.status(401).json({ error: 'Sesión inválida o expirada' });
    return;
  }
  if (!user.active) {
    res.status(403).json({ error: 'Usuario desactivado' });
    return;
  }
  req.user = { id: user.id, username: user.username, role: user.role };
  next();
}

export function adminRequired(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: 'Se requieren permisos de administrador' });
    return;
  }
  next();
}

export function writeRequired(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.role === 'lector') {
    res.status(403).json({ error: 'Usuario de solo lectura: sin permisos de edición' });
    return;
  }
  next();
}

export function mutatingWriteRequired() {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      next();
      return;
    }
    writeRequired(req, res, next);
  };
}

export function mutatingAdminRequired() {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      next();
      return;
    }
    adminRequired(req, res, next);
  };
}

export function verifyToken(token: string): boolean {
  if (!token) return false;
  try {
    jwt.verify(token, config.jwtSecret);
    return true;
  } catch {
    return false;
  }
}

function extractToken(req: Request): string {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  if (typeof req.query?.token === 'string') return req.query.token;
  return '';
}