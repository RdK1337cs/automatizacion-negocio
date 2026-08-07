import { useEffect, useState } from 'react';
import { api, money, fmtDate } from '../api';

interface Item {
  id: number;
  order_id?: number;
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}
interface Order {
  id: number;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  source: string;
  status: string;
  total: number;
  notes: string;
  created_at: string;
  status_label?: string;
  items?: Item[];
}
interface Product {
  id: number;
  name: string;
  price: number;
  stock: number;
}

export function Orders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [err, setErr] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    notes: '',
    autoConfirm: false,
    rows: [{ productId: 0, quantity: 1 }],
  });
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = () =>
    Promise.all([api<Order[]>('/api/orders'), api<Product[]>('/api/products')])
      .then(([o, p]) => {
        setOrders(o);
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
      await api('/api/orders', {
        body: {
          customerName: form.customerName,
          customerEmail: form.customerEmail,
          customerPhone: form.customerPhone,
          notes: form.notes,
          autoConfirm: form.autoConfirm,
          items: form.rows.filter((r) => r.productId).map((r) => ({ productId: Number(r.productId), quantity: Number(r.quantity) })),
        },
      });
      setShowForm(false);
      setForm({ customerName: '', customerEmail: '', customerPhone: '', notes: '', autoConfirm: false, rows: [{ productId: 0, quantity: 1 }] });
      await load();
    } catch (er) {
      setErr((er as Error).message);
    }
  };

  const doAction = async (id: number, action: 'confirm' | 'cancel' | 'delete') => {
    if (action === 'delete' && !confirm('¿Eliminar pedido?')) return;
    if (action === 'cancel' && !confirm('¿Cancelar pedido? (reponerá stock si estaba confirmado)')) return;
    try {
      if (action === 'delete') await api(`/api/orders/${id}`, { method: 'DELETE' });
      else await api(`/api/orders/${id}/${action}`, { method: 'POST' });
      await load();
    } catch (er) {
      alert((er as Error).message);
    }
  };

  return (
    <div>
      <div className="head">
        <h1>Pedidos</h1>
        <button className="primary" onClick={() => setShowForm(true)}>+ Cargar pedido</button>
      </div>
      {err && <div className="error">{err}</div>}

      {showForm && (
        <form className="panel-form" onSubmit={submit}>
          <h3>Nuevo pedido</h3>
          <div className="form-row">
            <label>Cliente <input required value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} /></label>
            <label>Email <input type="email" value={form.customerEmail} onChange={(e) => setForm({ ...form, customerEmail: e.target.value })} /></label>
            <label>WhatsApp <input value={form.customerPhone} onChange={(e) => setForm({ ...form, customerPhone: e.target.value })} /></label>
          </div>
          <label>Notas <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
          <h4 className="muted">Detalle</h4>
          {form.rows.map((row, i) => (
            <div className="form-row" key={i}>
              <select
                value={row.productId}
                onChange={(e) => setForm({ ...form, rows: form.rows.map((r, j) => (j === i ? { ...r, productId: Number(e.target.value) } : r)) })}
              >
                <option value={0}>— Elegir producto —</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} (${p.price} · stock {p.stock})</option>
                ))}
              </select>
              <input
                type="number" min={1} value={row.quantity}
                onChange={(e) => setForm({ ...form, rows: form.rows.map((r, j) => (j === i ? { ...r, quantity: Number(e.target.value) } : r)) })}
              />
              {form.rows.length > 1 && (
                <button type="button" onClick={() => setForm({ ...form, rows: form.rows.filter((_, j) => j !== i) })}>Quitar</button>
              )}
            </div>
          ))}
          <button type="button" onClick={() => setForm({ ...form, rows: [...form.rows, { productId: 0, quantity: 1 }] })}>
            + Agregar producto
          </button>
          <label className="check">
            <input type="checkbox" checked={form.autoConfirm} onChange={(e) => setForm({ ...form, autoConfirm: e.target.checked })} />
            Confirmar automáticamente (descuenta stock y envía email)
          </label>
          <div className="form-actions">
            <button className="primary" type="submit">Guardar</button>
            <button type="button" onClick={() => setShowForm(false)}>Cancelar</button>
          </div>
        </form>
      )}

      <table>
        <thead>
          <tr><th>Nro</th><th>Cliente</th><th>Origen</th><th>Estado</th><th>Total</th><th>Fecha</th><th>Acciones</th></tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <FragmentRow key={o.id} o={o} expanded={expanded === o.id} onToggle={() => setExpanded(expanded === o.id ? null : o.id)} onAction={doAction} />
          ))}
          {orders.length === 0 && <tr><td colSpan={7} className="empty">Sin pedidos</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function FragmentRow({ o, expanded, onToggle, onAction }: { o: Order; expanded: boolean; onToggle: () => void; onAction: (id: number, a: 'confirm' | 'cancel' | 'delete') => void }) {
  return (
    <>
      <tr onClick={onToggle} className="clickable">
        <td>{o.order_number}</td>
        <td>{o.customer_name}</td>
        <td>{o.source}</td>
        <td><span className={`pill pill-${o.status}`}>{o.status_label ?? o.status}</span></td>
        <td>{money(o.total)}</td>
        <td>{fmtDate(o.created_at)}</td>
        <td className="actions" onClick={(e) => e.stopPropagation()}>
          {o.status === 'pending' && <button onClick={() => onAction(o.id, 'confirm')}>Confirmar</button>}
          {(o.status === 'pending' || o.status === 'confirmed') && <button onClick={() => onAction(o.id, 'cancel')}>Cancelar</button>}
          <button className="danger" onClick={() => onAction(o.id, 'delete')}>×</button>
        </td>
      </tr>
      {expanded && (
        <tr className="detail">
          <td colSpan={7}>
            <table className="inner">
              <thead><tr><th>Producto</th><th>Cant.</th><th>P. unitario</th><th>Subtotal</th></tr></thead>
              <tbody>
                {(o.items ?? []).map((it) => (
                  <tr key={it.id}>
                    <td>{it.product_name}</td><td>{it.quantity}</td><td>{money(it.unit_price)}</td><td>{money(it.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted">
              {o.customer_phone && `Tel: ${o.customer_phone} · `}
              {o.customer_email && `Email: ${o.customer_email}`}
              {o.notes && ` · Notas: ${o.notes}`}
            </p>
          </td>
        </tr>
      )}
    </>
  );
}