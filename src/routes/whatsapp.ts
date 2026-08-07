import { Router, raw } from 'express';
import { verifyWebhook, isSignatureValid, sendEnabled } from '../services/whatsapp';
import { handleIncoming } from '../services/bot';
import { ah } from '../lib/http';

export const whatsappRouter = Router();

whatsappRouter.get('/webhook', verifyWebhook);

whatsappRouter.post('/webhook', raw({ type: 'application/json' }), (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body ?? {});
  if (!isSignatureValid(req, rawBody)) {
    res.status(403).json({ error: 'Firma inválida' });
    return;
  }
  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    res.status(400).json({ error: 'JSON inválido' });
    return;
  }
  void handlePayload(payload);
  res.status(200).send('OK');
});

async function handlePayload(payload: any): Promise<void> {
  const entries = payload?.entry ?? [];
  for (const entry of entries) {
    const changes = entry?.changes ?? [];
    for (const change of changes) {
      if (change.field !== 'messages') continue;
      const messages = change?.value?.messages ?? [];
      const contacts = change?.value?.contacts ?? [];
      const fromMeta = change?.value?.metadata?.display_phone_number;
      void fromMeta;
      for (const msg of messages) {
        const from = msg.from;
        const text = msg.text?.body ?? '';
        if (!from || !text) continue;
        try {
          await handleIncoming(String(from), String(text));
        } catch (err) {
          console.error('[bot error]', err);
        }
      }
    }
  }
}
