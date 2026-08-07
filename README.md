# Automatización de Negocio (MVP)

Sistema que responde WhatsApp automáticamente, genera presupuestos en PDF, envía
emails, carga pedidos y controla el stock de un negocio físico.

## Funcionalidades

- **WhatsApp automático** (Meta Cloud API): responde saludos, da precios, informa
  stock, toma pedidos y arma presupuestos por chat.
- **Presupuestos**: se generan en PDF y se envían por WhatsApp y/o email.
- **Pedidos**: carga manual desde el panel o automática desde WhatsApp. Al confirmar,
  descuenta stock, registra el movimiento y envía email de confirmación.
- **Stock**: control con movimientos auditables, alertas de stock bajo y ajustes manuales.
- **Fotos de productos**: cada ítem del inventario puede tener su foto (PNG/JPG/WEBP/GIF,
  máximo 1,5 MB), subida desde el panel y mostrada en la lista de productos.
- **Emails**: enviados con Resend (también soporta modo simulación sin API key).
- **Usuarios y permisos**: el administrador gestiona cuentas desde el panel con tres roles:
  *Administrador* (acceso total, administra usuarios), *Operador* (edita productos/pedidos/
  presupuestos pero no usuarios ni ajustes) y *Solo lectura* (ve todo pero no modifica).
- **Panel web**: dashboard, productos (con fotos), pedidos, presupuestos, logs, ajustes y usuarios.

## Requisitos

- Node.js 22.5+ (Node 24 recomendado; incluye `node:sqlite` sin compilación nativa).

## Puesta en marcha

```bash
npm install
cp .env.example .env        # ajustá credenciales
npm run setup               # crea la DB, carga catálogo demo y compila el panel
npm start                   # sirve panel + API en http://localhost:4000
```

Para desarrollo (con hot reload en el panel):

```bash
npm run db:init
npm run dev          # API en :4000 con tsx watch
npm run dev:web      # panel en :5173 con proxy hacia la API
```

Por defecto **WhatsApp y email corren en modo simulación**: los mensajes salientes y
correos se registran en el panel (pestaña Logs) pero no se envían. Al llenar las
credenciales en `.env` se activa el envío real.

## Conexión con WhatsApp (Meta Cloud API)

1. Creá una app en <https://developers.facebook.com/apps> y agregale el producto
   **WhatsApp > Setup**.
2. En *WhatsApp > API Setup* obtené:
   - `WHATSAPP_ACCESS_TOKEN` (token temporal para testear; generá un token permanente luego).
   - `WHATSAPP_PHONE_NUMBER_ID`.
3. Definí `WHATSAPP_WEBHOOK_VERIFY_TOKEN` (token que vos elijas) y `WHATSAPP_WEBHOOK_APP_SECRET`.
4. En **Webhook**, configurá la URL: `https://TU-DOMINIO/webhook` con el mismo *verify token*.
   - En local usá [ngrok](https://ngrok.com): `ngrok http 4000` y configura la URL de esa sesión.
   - Suscribí el webhook al campo **messages**.
5. Escribile al número de WhatsApp Business desde tu teléfono para probar (ej: "precio de mate",
   "necesito 2 de té", "presupuesto de alfajores").

> Regla de Meta: solo se pueden enviar mensajes libres dentro de la ventana de 24 h
> desde que el cliente escribe. Fuera de la ventana hace falta un *template* aprobado.
> Dejá `WHATSAPP_DEFAULT_TEMPLATE` con el nombre del template a usar cuando toque.

## Email (Resend)

- Creá una cuenta en <https://resend.com>, agregá tu dominio y generá una API key.
- Completá `RESEND_API_KEY` y `EMAIL_FROM` en `.env`.
- Sin API key, los correos quedan logueados en el panel en estado `sandbox`.

## Docker

```bash
docker compose up -d --build
```

## Usuario por defecto del panel

`admin` / `admin123` (cambiá `ADMIN_USER` y `ADMIN_PASSWORD` en `.env`).

## Tests

```bash
npm test
```

Cubre stock, pedidos (descuento/restauración), generación de PDF y el bot.

## Estructura

```
src/
  server.ts            # Express + API + panel estático
  config.ts            # env
  db/                  # SQLite (node:sqlite) + schema + seed
  services/
    bot.ts             # intenciones y respuestas de WhatsApp
    whatsapp.ts        # Meta Cloud API (webhook + envío)
    order.ts           # pedidos + stock + email
    quote.ts           # presupuestos + envío
    pdf.ts             # generación de PDF
    email.ts           # Resend (o sandbox)
    stock.ts           # movimientos y bajas de stock
    settings.ts        # configuración del negocio
  routes/              # API REST (auth, products, orders, quotes, logs, dashboard)
web/                   # panel React + Vite
```

## API principal

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/login` | Login del panel → JWT |
| GET | `/api/health` | Estado (whatsapp/email) |
| GET/POST | `/api/products` | Listar / crear productos |
| GET/POST/DELETE | `/api/products/:id/image` | Ver / subir / quitar foto del producto |
| PUT/P/DELETE | `/api/products/:id` | Editar / stock / eliminar |
| GET/POST | `/api/orders` | Listar / crear pedido |
| POST | `/api/orders/:id/confirm` | Confirmar pedido (descuenta stock) |
| POST | `/api/orders/:id/cancel` | Cancelar pedido (reponer stock) |
| GET/POST | `/api/quotes` | Listar / crear presupuesto |
| POST | `/api/quotes/:id/send?by=both` | Enviar PDF por WhatsApp/email |
| GET | `/api/quotes/:id/pdf` | Descargar PDF |
| GET/POST/PUT/DELETE | `/api/users` | Gestionar usuarios y roles (solo admin) |
| GET | `/api/logs/messages|emails|movements` | Logs |
| GET/P | `/api/dashboard` | Resumen |
| GET/PUT | `/api/settings` | Ajustes |
| GET/POST | `/webhook` | Webhook WhatsApp |