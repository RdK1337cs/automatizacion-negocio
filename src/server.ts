import express, { type Request, type Response, type NextFunction } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import cors from 'cors';
import { config } from './config';
import { getDb } from './db/db';
import {
  authRequired,
  adminRequired,
  mutatingWriteRequired,
  mutatingAdminRequired,
} from './middleware/auth';
import { errorHandler, notFoundHandler } from './lib/http';
import { authRouter } from './routes/auth';
import { usersRouter } from './routes/users';
import { whatsappRouter } from './routes/whatsapp';
import { productsRouter } from './routes/products';
import { ordersRouter } from './routes/orders';
import { quotesRouter } from './routes/quotes';
import { settingsRouter } from './routes/settings';
import { dashboardRouter } from './routes/dashboard';
import { logsRouter } from './routes/logs';
import { sendEnabled } from './services/whatsapp';
import { emailEnabled } from './services/email';

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Webhook de WhatsApp (público)
app.use(whatsappRouter);

// API pública
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    whatsapp: sendEnabled() ? 'configurado' : 'simulacion',
    email: emailEnabled() ? 'configurado' : 'simulacion',
  });
});
app.use(authRouter);
app.get('/api/me', authRequired, (req, res) => {
  res.json({ username: req.user!.username, role: req.user!.role });
});

// API protegida
app.use('/api/users', authRequired, adminRequired, usersRouter);
app.use('/api/products', authRequired, mutatingWriteRequired(), productsRouter);
app.use('/api/orders', authRequired, mutatingWriteRequired(), ordersRouter);
app.use('/api/quotes', authRequired, mutatingWriteRequired(), quotesRouter);
app.use('/api/settings', authRequired, mutatingAdminRequired(), settingsRouter);
app.use('/api/dashboard', authRequired, dashboardRouter);
app.use('/api/logs', authRequired, logsRouter);

// 404 para llamadas API desconocidas
app.use('/api', notFoundHandler);

// Frontend (panel web) en producción
const webDist = path.resolve(process.cwd(), 'web', 'dist');
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get('*', (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/webhook')) return next();
    res.sendFile(path.join(webDist, 'index.html'));
  });
}

app.use(errorHandler);

// Inicializamos la base de datos al arrancar
getDb();

app.listen(config.port, () => {
  console.log('==============================================');
  console.log('  Automatización de Negocios - MVP');
  console.log(`  Panel web:      http://localhost:${config.port}`);
  console.log(`  Webhook WA:     ${config.baseUrl}/webhook`);
  console.log(`  WhatsApp:       ${sendEnabled() ? 'CONECTADO' : 'MODO SIMULACIÓN'}`);
  console.log(`  Email:          ${emailEnabled() ? 'CONECTADO (Resend)' : 'MODO SIMULACIÓN'}`);
  console.log('==============================================');
});