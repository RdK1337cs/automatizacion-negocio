import { useEffect, useState } from 'react';
import { api, getToken, money, fmtDate } from '../api';

interface QuoteItem {
  id: number;
  quote_id?: number;
  product_id?: number | null;
  description: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}
interface Quote {
  id: number;
  quote_number: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  source: string;
  status: string;
  status_label?: string;
  valid_days: number;
  notes: string;
  total: number;
  created_at: string;
  items?: QuoteItem[];
}
interface Product {
  id: number;
  name: string;
  price: number;
}

export function Quotes() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [err, setErr] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState({
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    validDays: 7,
    rows: [{ productId: 0, quantity: 1, unitPrice: '' as string | number }],
  });

  const load = () =>
    Promise.all([api<Quote[]>('/api/quotes'), api<Product[]>('/api/products')])
      .then(([q, p]) => {
        setQuotes(q);
        setProducts(p);
      })
      .catch((e) => setErr((e as Error).message));

  useEffect(() => {
    load();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      const rows = form.rows
        .filter((r) => r.productId || r.unitPrice !== '')
        .map((r) => ({
          productId: r.productId ? Number(r.productId) : undefined,
          quantity: Number(r.quantity),
          unitPrice: r.unitPrice !== '' ? Number(r.unitPrice) : undefined,
        }));
      await api('/api/quotes', {
        body: {
          customerName: form.customerName,
          customerPhone: form.customerPhone,
          customerEmail: form.customerEmail,
          validDays: Number(form.validDays),
          source: 'panel',
          items: rows,
        },
      });
      setShowForm(false);
      setForm({ customerName: '', customerPhone: '', customerEmail: '', validDays: 7, rows: [{ productId: 0, quantity: 1, unitPrice: '' }] });
      await load();
    } catch (er) {
      setErr((er as Error).message);
    }
  };

  const send = async (q: Quote, by: 'whatsapp' | 'email' | 'both') => {
    try {
      const res = await api<{ ok: boolean; whatsapp?: boolean; email?: boolean; sandbox?: boolean }>(
        `/api/quotes/${q.id}/send?by=${by}`,
        { method: 'POST' }
      );
      const canales: string[] = [];
      if (res.whatsapp) canales.push('WhatsApp');
      if (res.email) canales.push('email');
      if (canales.length === 0) {
        setNotice(`El presupuesto ${q.quote_number} no tiene ${by === 'both' ? 'teléfono ni email' : by === 'whatsapp' ? 'teléfono' : 'email'} cargados.`);
      } else {
        setNotice(
          res.sandbox
            ? `✓ Enviado por ${canales.join(' y ')} (SIMULADO: configurá credenciales para envío real)`
            : `✓ Enviado por ${canales.join(' y ')}`
        );
      }
      await load();
    } catch (er) {
      setNotice('');
      alert((er as Error).message);
    }
  };

  const setStatus = async (q: Quote, status: string) => {
    await api(`/api/quotes/${q.id}/status`, { body: status });
    await load();
  };

  const del = async (q: Quote) => {
    if (!confirm(`¿Eliminar presupuesto ${q.quote_number}?`)) return;
    await api(`/api/quotes/${q.id}`, { method: 'DELETE' });
    await load();
  };

  return (
    <div>
      <div className="head">
        <h1>Presupuestos</h1>
        <button className="primary" onClick={() => setShowForm(true)}>+ Nuevo presupuesto</button>
      </div>
      {err && <div className="error">{err}</div>}
      {notice && <div className="ok-banner">{notice}</div>}

      {showForm && (
        <form className="form-form" onSubmit={submit}>
          <h3>Nuevo presupuesto</h3>
          <div className="form-row">
            <label>Cliente <input required value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} /></label>
            <label>WhatsApp <input value={form.customerPhone} onChange={(e) => setForm({ ...form, customerPhone: e.target.value })} /></label>
            <label>Email <input type="email" value={form.customerEmail} onChange={(e) => setForm({ ...form, customerEmail: e.target.value })} /></label>
            <label>Validez (días) <input type="number" min={1} value={form.validDays} onChange={(e) => setForm({ ...form, validDays: Number(e.target.value) })} /></label>
          </div>
          <h4 className="muted">Items (el precio se toma del catálogo, podés modificarlo)</h4>
          {form.rows.map((row, i) => (
            <div className="form-row" key={i}>
              <select value={row.productId} onChange={(e) => {
                const id = Number(e.target.value);
                const p = products.find((x) => x.id === id);
                setForm({
                  ...form,
                  rows: form.rows.map((r, j) => (j === i ? { ...r, productId: id, unitPrice: p ? String(p.price) : r.unitPrice } : r)),
                });
              }}>
                <option value={0}>— Elegir producto —</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name} (${p.price})</option>)}
              </select>
              <input type="number" min={1} value={row.quantity} onChange={(e) => setForm({ ...form, rows: form.rows.map((r, j) => (j === i ? { ...r, quantity: Number(e.target.value) } : r)) })} />
              <input placeholder="Precio unitario" value={row.unitPrice} onChange={(e) => setForm({ ...form, rows: form.rows.map((r, j) => (j === i ? { ...r, unitPrice: e.target.value } : r)) })} />
              {form.rows.length > 1 && <button type="button" onClick={() => setForm({ ...form, rows: form.rows.filter((_, j) => j !== i) })}>Quitar</button>}
            </div>
          ))}
          <button type="button" onClick={() => setForm({ ...form, rows: [...form.rows, { productId: 0, quantity: 1, unitPrice: '' }] })}>+ Agregar item</button>
          <div className="form-actions">
            <button className="primary" type="submit">Guardar</button>
            <button type="button" onClick={() => setShowForm(false)}>Cancelar</button>
          </div>
        </form>
      )}

      <table>
        <thead>
          <tr><th>Nro</th><th>Cliente</th><th>Estado</th><th>Total</th><th>Válido</th><th>Acciones</th></tr>
        </thead>
        <tbody>
          {quotes.map((q) => (
            <FragmentRow key={q.id} q={q} expanded={expanded === q.id} onToggle={() => setExpanded(expanded === q.id ? null : q.id)} onSend={send} onStatus={setStatus} onDel={del} />
          ))}
          {quotes.length === 0 && <tr><td colSpan={6} className="empty">Sin presupuestos</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function FragmentRow({ q, expanded, onToggle, onSend, onStatus, onDel }: {
  q: Quote;
  expanded: boolean;
  onToggle: () => void;
  onSend: (q: Quote, by: 'whatsapp' | 'email' | 'both') => void;
  onStatus: (q: Quote, s: string) => void;
  onDel: (q: Quote) => void;
}) {
  return (
    <>
      <tr onClick={onToggle} className="clickable">
        <td>{q.quote_number}</td>
        <td>{q.customer_name}</td>
        <td><span className={`pill pill-${q.status}`}>{q.status_label ?? q.status}</span></td>
        <td>{money(q.total)}</td>
        <td>{q.valid_days} días</td>
        <td className="actions" onClick={(e) => e.stopPropagation()}>
          {q.customer_phone && <button onClick={() => onSend(q, 'whatsapp')} title="Enviar por WhatsApp">WP</button>}
          {q.customer_email && <button onClick={() => onSend(q, 'email')} title="Enviar por email">✉</button>}
          <button onClick={() => { window.open(`/api/quotes/${q.id}/pdf?token=${encodeURIComponent(getToken())}`, '_blank'); }} title="Ver PDF">▤</button>
          <select value={q.status} onChange={(e) => onStatus(q, e.target.value)}>
            <option value="draft">Borrador</option>
            <option value="sent">Enviado</option>
            <option value="approved">Aprobado</option>
            <option value="rejected">Rechazado</option>
            <option value="expired">Vencido</option>
          </select>
          <button className="danger" onClick={() => onDel(q)}>×</button>
        </td>
      </tr>
      {expanded && (
        <tr className="detail">
          <td colSpan={6}>
            <table className="inner">
              <thead><tr><th>Descripción</th><th>Cant.</th><th>P. unit.</th><th>Subtotal</th></tr></thead>
              <tbody>
                {(q.items ?? []).map((it) => (
                  <tr key={it.id}>
                    <td>{it.description}</td><td>{it.quantity}</td><td>{money(it.unit_price)}</td><td>{money(it.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted">Creado {fmtDate(q.created_at)} · {q.notes}</p>
          </td>
        </tr>
      )}
    </>
  );
}