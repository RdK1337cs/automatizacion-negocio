import { useEffect, useState } from 'react';
import { api, money, assetUrl } from '../api';

interface Base {
  id: number;
  name: string;
  active: number;
  created_at: string;
}
interface BaseProduct {
  id: number;
  code: string;
  name: string;
  description: string;
  image?: string | null;
  price: number;
  min_stock: number;
  stock_total: number;
}
interface ProductView {
  id: number;
  code: string;
  name: string;
  description: string;
  active: number;
  image?: string | null;
}

export function BasesPage() {
  const [bases, setBases] = useState<Base[]>([]);
  const [selected, setSelected] = useState(0);
  const [products, setProducts] = useState<BaseProduct[]>([]);
  const [master, setMaster] = useState<ProductView[]>([]);
  const [err, setErr] = useState('');
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState<{ productId: number; price: string; min: string } | null>(null);

  const loadProducts = (baseId: number) =>
    api<BaseProduct[]>(`/api/bases/${baseId}/products`).then(setProducts).catch((e) => setErr((e as Error).message));

  useEffect(() => {
    Promise.all([api<Base[]>('/api/bases'), api<ProductView[]>('/api/products')])
      .then(([b, m]) => {
        setBases(b);
        setMaster(m);
        setSelected((prev) => prev || b[0]?.id || 0);
      })
      .catch((e) => setErr((e as Error).message));
  }, []);

  useEffect(() => {
    if (selected) loadProducts(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api('/api/bases', { body: { name: newName } });
      setNewName('');
      const list = await api<Base[]>('/api/bases');
      setBases(list);
      setSelected(list[list.length - 1].id);
    } catch (er) {
      setErr((er as Error).message);
    }
  };

  const rename = async (b: Base) => {
    const name = prompt('Nuevo nombre:', b.name);
    if (!name) return;
    try {
      await api(`/api/bases/${b.id}`, { method: 'PUT', body: { name } });
      setBases(await api<Base[]>('/api/bases'));
    } catch (er) {
      alert((er as Error).message);
    }
  };

  const del = async (b: Base) => {
    if (!confirm(`¿Eliminar la base "${b.name}"?`)) return;
    try {
      await api(`/api/bases/${b.id}`, { method: 'DELETE' });
      const list = await api<Base[]>('/api/bases');
      setBases(list);
      setSelected(list[0]?.id ?? 0);
    } catch (er) {
      alert((er as Error).message);
    }
  };

  const addProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adding || !selected) return;
    try {
      await api(`/api/bases/${selected}/products`, {
        method: 'POST',
        body: { productId: adding.productId, price: Number(adding.price), min_stock: Number(adding.min) },
      });
      setAdding(null);
      await loadProducts(selected);
    } catch (er) {
      alert((er as Error).message);
    }
  };

  const editPrice = async (p: BaseProduct, price: number, min: number) => {
    try {
      await api(`/api/bases/${selected}/products/${p.id}`, {
        method: 'PATCH',
        body: { price, min_stock: min },
      });
      await loadProducts(selected);
    } catch (er) {
      alert((er as Error).message);
    }
  };

  const remove = async (p: BaseProduct) => {
    if (!confirm(`¿Quitar "${p.name}" de la base?`)) return;
    try {
      await api(`/api/bases/${selected}/products/${p.id}`, { method: 'DELETE' });
      await loadProducts(selected);
    } catch (er) {
      alert((er as Error).message);
    }
  };

  return (
    <div>
      <div className="head">
        <h1>Bases y precios</h1>
      </div>
      {err && <div className="error">{err}</div>}

      <div className="form-row">
        <label>
          Base de precios
          <select value={selected} onChange={(e) => setSelected(Number(e.target.value))}>
            {bases.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </label>
        <form className="inline-form" onSubmit={create}>
          <input
            placeholder="Nueva base…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            required
          />
          <button type="submit">Crear base</button>
        </form>
        <button onClick={() => rename(bases.find((b) => b.id === selected)!)}>Renombrar</button>
        <button className="danger" onClick={() => del(bases.find((b) => b.id === selected)!)}>Eliminar base</button>
      </div>

      <h4 className="muted">Productos de la base (definen precio y mínimo)</h4>
      <table>
        <thead>
          <tr><th>Foto</th><th>Código</th><th>Nombre</th><th>Precio</th><th>Mín.</th><th>Stock total</th><th>Acciones</th></tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <PriceRow key={p.id} p={p} onEdit={editPrice} onRemove={remove} />
          ))}
          {products.length === 0 && <tr><td colSpan={7} className="empty">La base no tiene productos</td></tr>}
        </tbody>
      </table>

      <section style={{ marginTop: 20 }}>
        <h3>Agregar producto a la base</h3>
        <form className="inline-form" onSubmit={addProduct}>
          <select value={adding?.productId ?? 0} onChange={(e) => setAdding({ productId: Number(e.target.value), price: '', min: '5' })} required>
            <option value={0}>— Producto —</option>
            {master.map((m) => (
              <option key={m.id} value={m.id}>{m.name} ({m.code})</option>
            ))}
          </select>
          <input
            type="number" step="0.01" placeholder="Precio" required
            value={adding?.price ?? ''}
            onChange={(e) => setAdding((a) => a ? { ...a, price: e.target.value } : null)}
          />
          <input
            type="number" placeholder="Mínimo" value={adding?.min ?? '5'}
            onChange={(e) => setAdding((a) => a ? { ...a, min: e.target.value } : null)}
          />
          <button type="submit">Agregar</button>
        </form>
      </section>
    </div>
  );
}

function PriceRow({ p, onEdit, onRemove }: {
  p: BaseProduct;
  onEdit: (p: BaseProduct, price: number, min: number) => Promise<void>;
  onRemove: (p: BaseProduct) => Promise<void>;
}) {
  const [price, setPrice] = useState(String(p.price));
  const [min, setMin] = useState(String(p.min_stock));
  return (
    <tr>
      <td>
        {p.image ? (
          <img className="thumb" src={assetUrl(`/api/products/${p.id}/image`)} alt={p.name} />
        ) : (
          <div className="thumb empty">—</div>
        )}
      </td>
      <td>{p.code}</td>
      <td>{p.name}</td>
      <td>
        <input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} style={{ width: 90 }} />
        <button onClick={() => onEdit(p, Number(price), Number(min))}>OK</button>
      </td>
      <td>
        <input type="number" value={min} onChange={(e) => setMin(e.target.value)} style={{ width: 70 }} />
      </td>
      <td>{p.stock_total}</td>
      <td className="actions">
        <button className="danger" onClick={() => onRemove(p)}>Quitar</button>
      </td>
    </tr>
  );
}