import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config';
import { HttpError } from '../lib/http';
import { getSetting, setSetting } from './settings';

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  svg: 'image/svg+xml',
};

const MAX_BYTES = 2 * 1024 * 1024;

function logosDir(): string {
  return path.resolve(config.dataDir, 'uploads');
}

export function uploadBusinessLogo(dataUri: string): string {
  const m = /^data:image\/(png|jpe?g|webp|svg\+xml|svg);base64,([A-Za-z0-9+/=]+)$/i.exec(dataUri.trim());
  if (!m) {
    throw new HttpError(400, 'Formato de logo inválido. Usá PNG, JPG, WEBP o SVG.');
  }
  const buffer = Buffer.from(m[2], 'base64');
  if (buffer.length === 0) throw new HttpError(400, 'La imagen está vacía');
  if (buffer.length > MAX_BYTES) {
    throw new HttpError(400, 'El logo supera 2 MB. Reducilo y volvé a intentar.');
  }
  fs.mkdirSync(logosDir(), { recursive: true });
  const ext = m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase();
  const filename = `business-logo.${ext}`;
  const filePath = path.join(logosDir(), filename);
  removeBusinessLogo();
  fs.writeFileSync(filePath, buffer);
  setSetting('business_logo', filename);
  return filename;
}

export function removeBusinessLogo(): void {
  const current = getSetting('business_logo').trim();
  if (current) {
    const filePath = path.join(logosDir(), current);
    // Solo borrar archivos internos de logos (nunca rutas arbitrarias)
    if (path.resolve(filePath).startsWith(logosDir()) && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
  setSetting('business_logo', '');
}

export function businessLogoInfo(): { filePath: string; mime: string } | null {
  const current = getSetting('business_logo').trim();
  if (!current) return null;
  const filePath = path.join(logosDir(), current);
  if (!fs.existsSync(filePath)) return null;
  const ext = path.extname(filePath).slice(1).toLowerCase();
  return { filePath, mime: MIME_BY_EXT[ext] ?? 'image/png' };
}