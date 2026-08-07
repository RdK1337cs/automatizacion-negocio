import 'dotenv/config';

export const config = {
  nodeEnv: envStr('NODE_ENV', 'development'),
  port: envNum('PORT', 4000),
  baseUrl: envStr('BASE_URL', 'http://localhost:4000'),
  dataDir: envStr('DATA_DIR', 'data'),
  dbFile: envStr('DB_FILE', 'app.db'),
  jwtSecret: envStr('JWT_SECRET', 'dev_secret_change_me'),
  adminUser: envStr('ADMIN_USER', 'admin'),
  adminPassword: envStr('ADMIN_PASSWORD', 'admin123'),
  whatsapp: {
    accessToken: envStr('WHATSAPP_ACCESS_TOKEN'),
    phoneNumberId: envStr('WHATSAPP_PHONE_NUMBER_ID'),
    verifyToken: envStr('WHATSAPP_WEBHOOK_VERIFY_TOKEN', 'verify_token_change_me'),
    appSecret: envStr('WHATSAPP_WEBHOOK_APP_SECRET'),
    defaultTemplate: envStr('WHATSAPP_DEFAULT_TEMPLATE', 'respuesta_general'),
    apiVersion: envStr('WHATSAPP_API_VERSION', 'v21.0'),
  },
  email: {
    provider: envStr('EMAIL_PROVIDER', 'resend'),
    apiKey: envStr('RESEND_API_KEY'),
    from: envStr('EMAIL_FROM', 'Mi Negocio <onboarding@resend.dev>'),
  },
} as const;

function envStr(key: string, def = ''): string {
  const v = process.env[key];
  return v === undefined || v === '' ? def : v;
}

function envNum(key: string, def: number): number {
  const v = parseFloat(process.env[key] ?? '');
  return Number.isFinite(v) ? v : def;
}
