import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money, fmtDate } from '../api';

interface DashboardData {
  orders: number;
  pending: number;
  confirmed: number;
  cancelled: number;
  quotes: number;
  quotesSent: number;
  products: number;
  totalRevenue: number;
  messagesIn: number;
  lowStock: Array<{ id: number; name: string; stock: number; min_stock: number }>;
  recentOrders: Array<{ id: number; order_number: string; customer_name: string; status: string; total: number }>;
}

export function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api<DashboardData>('/api/dashboard')
      .then(setData)
      .catch((e) => setErr((e as Error).message));
  }, []);

  if (err) return <div className="error">{err}</div>;
  if (!data) return <div className="loading">Cargando…</div>;

  const cards = [
    { label: 'Pedidos totales', value: data.orders, cls: '' },
    { label: 'Pendientes', value: data.pending, cls: 'warn' },
    { label: 'Confirmados', value: data.confirmed, cls: 'ok' },
    { label: 'Presupuestos', value: data.quotes, cls: '' },
    { label: 'Productos', value: data.products, cls: '' },
    { label: 'Ventas confirmadas', value: money(data.totalRevenue), cls: 'ok' },
  ];

  return (
    <div>
      <h1>Dashboard</h1>
      <div className="cards">
        {cards.map((c, i) => (
          <div key={i} className={`card ${c.cls}`}>
            <div className="value">{c.value}</div>
            <div className="label">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="grid2">
        <section>
          <h2>Últimos pedidos</h2>
          <table>
            <thead>
              <tr><th>Nro</th><th>Cliente</th><th>Estado</th><th>Total</th></tr>
            </thead>
            <tbody>
              {data.recentOrders.map((o) => (
                <tr key={o.id}>
                  <td>{o.order_number}</td>
                  <td>{o.customer_name}</td>
                  <td><span className={`pill pill-${o.status}`}>{o.status}</span></td>
                  <td>{money(o.total)}</td>
                </tr>
              ))}
              {data.recentOrders.length === 0 && (
                <tr><td colSpan={4} className="empty">Sin pedidos todavía</td></tr>
              )}
            </tbody>
          </table>
        </section>

        <section>
          <h2>Stock bajo</h2>
          {data.lowStock.length === 0 ? (
            <p className="empty">Todo el stock está por encima del mínimo.</p>
          ) : (
            <table>
              <thead>
                <tr><th>Producto</th><th>Stock</th><th>Mínimo</th></tr>
              </thead>
              <tbody>
                {data.lowStock.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td className="warn">{p.stock}</td>
                    <td>{p.min_stock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <Link className="link" to="/productos">Ver productos →</Link>
        </section>
      </div>
    </div>
  );
}