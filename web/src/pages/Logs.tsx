import { useEffect, useState } from 'react';
import { api, fmtDate } from '../api';

interface Message {
  id: number;
  direction: 'in' | 'out';
  from_number: string;
  to_number: string;
  type: string;
  body: string;
  intent: string;
  meta: string;
  error: string;
  created_at: string;
}
interface Email {
  id: number;
  to_email: string;
  subject: string;
  status: string;
  error: string;
  meta: string;
  created_at: string;
}
interface Movement {
  id: number;
  product_id: number;
  product_name: string;
  type: 'in' | 'out' | 'adjust';
  quantity: number;
  note: string;
  reference: string;
  created_at: string;
}

export function Logs() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [emails, setEmails] = useState<Email[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [tab, setTab] = useState<'wa' | 'email' | 'stock'>('wa');

  useEffect(() => {
    api<Message[]>('/api/logs/messages?limit=200').then(setMessages).catch(() => undefined);
    api<Email[]>('/api/logs/emails?limit=200').then(setEmails).catch(() => undefined);
    api<Movement[]>('/api/logs/movements?limit=200').then(setMovements).catch(() => undefined);
  }, []);

  return (
    <div>
      <h1>Logs</h1>
      <div className="tabs">
        <button className={tab === 'wa' ? 'active' : ''} onClick={() => setTab('wa')}>WhatsApp ({messages.length})</button>
        <button className={tab === 'email' ? 'active' : ''} onClick={() => setTab('email')}>Emails ({emails.length})</button>
        <button className={tab === 'stock' ? 'active' : ''} onClick={() => setTab('stock')}>Movimientos stock ({movements.length})</button>
      </div>

      {tab === 'wa' && (
        <table>
          <thead><tr><th>Dir</th><th>Número</th><th>Intención</th><th>Mensaje</th><th>Meta</th><th>Fecha</th></tr></thead>
          <tbody>
            {messages.map((m) => (
              <tr key={m.id}>
                <td><span className={`pill pill-${m.direction === 'out' ? 'confirmed' : 'pending'}`}>{m.direction === 'out' ? 'salida' : 'entrada'}</span></td>
                <td>{m.direction === 'in' ? m.from_number : m.to_number}</td>
                <td>{m.intent || '—'}</td>
                <td className="msg">{m.body}</td>
                <td className={`muted ${m.error ? 'warn' : ''}`}>{m.error || m.meta || '—'}</td>
                <td>{fmtDate(m.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {tab === 'email' && (
        <table>
          <thead><tr><th>Para</th><th>Asunto</th><th>Estado</th><th>Error/Meta</th><th>Fecha</th></tr></thead>
          <tbody>
            {emails.map((e) => (
              <tr key={e.id}>
                <td>{e.to_email}</td>
                <td>{e.subject}</td>
                <td><span className={`pill pill-${e.status === 'failed' ? 'cancelled' : e.status === 'sandbox' ? 'pending' : 'confirmed'}`}>{e.status}</span></td>
                <td className={`muted ${e.error ? 'warn' : ''}`}>{e.error || e.meta || '—'}</td>
                <td>{fmtDate(e.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {tab === 'stock' && (
        <table>
          <thead><tr><th>Producto</th><th>Tipo</th><th>Cant.</th><th>Referencia</th><th>Nota</th><th>Fecha</th></tr></thead>
          <tbody>
            {movements.map((m) => (
              <tr key={m.id}>
                <td>{m.product_name}</td>
                <td><span className={`pill pill-${m.type === 'out' ? 'cancelled' : m.type === 'adjust' ? 'pending' : 'confirmed'}`}>{m.type}</span></td>
                <td className={m.type === 'out' ? 'warn' : 'ok'}>{m.type === 'out' ? `-${m.quantity}` : `+${m.quantity}`}</td>
                <td>{m.reference || '—'}</td>
                <td className="muted">{m.note || '—'}</td>
                <td>{fmtDate(m.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}