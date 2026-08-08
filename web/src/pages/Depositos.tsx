import { useEffect, useState } from 'react';
import { api, money } from '../api';

interface Deposito {
  id: number;
  name: string;
  location: string;
  active: number;
}
interface Base {
  id: number;
  name: string;
}
interface ProductView {
  id: number;
  code: string;
  name: string;
  price: number;
  min_stock: number;
  stock_total: number;
  by_deposito: Array<{ deposito_id: number; quantity: number }>;
}

export function DepositosPage() {
  const [depositos, setDepositos] = useState<Deposito[]>([]);
  const [bases, setBases] = useState<Base[]>([]);
  const [baseId, setBaseId] = useState(0);
  const [selected, setSelected] = useState(0);
  const [products, setProducts] = useState<ProductView[]>([]);
  const [err, setErr] = useState('');
  const [newName, setNewName] = useState('');
  const [adj, setAdj] = useState<Record<number, string>>({});

  const load = () =>
    Promise.all([api<Deposito[]>('/api/depositos'), api<Base[]>('/api/bases')])
      .then(([d, b]) => {
        setDepositos(d);
        setBases(b);
        setSelected((prev) => prev || d[0]?.id || 0);
        setBaseId((prev) => prev || b[0]?.id || 0);
      })
      .catch((e) => setErr((e as Error).message));

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!selected || !baseId) return;
    api<ProductView[]>(`/api/bases/${baseId}/products`)
      .then(setProducts)
      .catch((e) => setErr((e as Error).message));
  }, [selected, baseId]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api('/api/depositos', { body: { name: newName } });
      setNewName('');
      await load();
    } catch (er) {
      setErr((er as Error).message);
    }
  };

  const rename = async (d: Deposito) => {
    const name = prompt('Nuevo nombre:', d.name);
    if (!name) return;
    try {
      await api(`/api/depositos/${d.id}`, { method: 'PUT', body: { name } });
      await load();
    } catch (er) {
      alert((er as Error).message);
    }
  };

  const toggleActive = async (d: Deposito) => {
    try {
      await api(`/api/depositos/${d.id}`, { method: 'PUT', body: { active: !d.active } });
      await load();
    } catch (er) {
      alert((er as Error).message);
    }
  };

  const del = async (d: Deposito) => {
    if (!confirm(`¿Eliminar el depósito "${d.name}"?`)) return;
    try {
      await api(`/api/depositos/${d.id}`, { method: 'DELETE' });
      await load();
    } catch (er) {
      alert((er as Error).message);
    }
  };

  const adjust = async (productId: number) => {
    const delta = Number(adj[productId] ?? 0);
    if (!delta || !selected) return;
    try {
      await api(`/api/depositos/${selected}/stock`, {
        method: 'POST',
        body: { productId, delta, note: 'Ajuste desde depósitos' },
      });
      setAdj((a) => ({ ...a, [productId]: '' }));
      const list = await api<ProductView[]>(`/api/bases/${baseId}/products`);
      setProducts(list);
    } catch (er) {
      alert((er as Error).message);
    }
  };

  return (
    <div>
      <div className="head">
        <h1>Depósitos y stock</h1>
      </div>
      {err && <div className="error">{err}</div>}

      <div className="form-row">
        <label>
          Depósito
          <select value={selected} onChange={(e) => setSelected(Number(e.target.value))}>
            {depositos.map((d) => (
              <option key={d.id} value={d.id}>{d.name}{!d.active ? ' (inactivo)' : ''}</option>
            ))}
          </select>
        </label>
        <label>
          Base
          <select value={baseId} onChange={(e) => setBaseId(Number(e.target.value))}>
            {bases.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="form-row">
        <form className="inline-form" onSubmit={create}>
          <input
            placeholder="Nuevo depósito…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            required
          />
          <button type="submit">Crear</button>
        </form>
        <button onClick={() => rename(depositos.find((d) => d.id === selected)!)}>Renombrar</button>
        <button onClick={() => toggleActive(depositos.find((d) => d.id === selected)!)}>
          {depositos.find((d) => d.id === selected)?.active ? 'Desactivar' : 'Activar'}
        </button>
        <button className="danger" onClick={() => del(depositos.find((d) => d.id === selected)!)}>Eliminar</button>
      </div>

      <h4 className="muted">Stock en este depósito (base: {bases.find((b) => b.id === baseId)?.name})</h4>
      <table>
        <thead>
          <tr><th>Código</th><th>Producto</th><th>Precio base</th><th>En este depósito</th><th>Total (POS)</th><th>Ajustar</th></tr>
        </thead>
        <tbody>
          {products.map((p) => {
            const here = p.by_deposito.find((d) => d.deposito_id === selected)?.quantity ?? 0;
            return (
              <tr key={p.id}>
                <td>{p.code}</td>
                <td>{p.name}</td>
                <td>{money(p.price)}</td>
                <td className={here <= p.min_stock ? 'warn' : ''}>{here}</td>
                <td>{p.stock_total}</td>
                <td>
                  <div className="adj">
                    <input
                      type="number"
                      placeholder="±"
                      value={adj[p.id] ?? ''}
                      onChange={(e) => setAdj({ ...adj, [p.id]: e.target.value })}
                    />
                    <button onClick={() => adjust(p.id)}>Aplicar</button>
                  </div>
                </td>
              </tr>
            );
          })}
          {products.length === 0 && <tr><td colSpan={6} className="empty">Sin productos cargados en esta base</td></tr>}
        </tbody>
      </table>
    </div>
  );
}