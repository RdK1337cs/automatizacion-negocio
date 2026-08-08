import { useEffect, useRef, useState } from 'react';
import { api, money, isReadOnly, assetUrl } from '../api';

interface Base {
  id: number;
  name: string;
}

interface Deposito {
  id: number;
  name: string;
}

interface ProductView {
  id: number;
  code: string;
  name: string;
  description: string;
  active: number;
  image?: string | null;
  price: number;
  min_stock: number;
  stock_total: number;
  by_deposito: Array<{ deposito_id: number; deposito_name?: string; quantity: number }>;
}

export function Products({ pos }: { pos: number }) {
  const [bases, setBases] = useState<Base[]>([]);
  const [depositos, setDepositos] = useState<Deposito[]>([]);
  const [baseId, setBaseId] = useState(0);
  const [depositoId, setDepositoId] = useState(0);
  const [products, setProducts] = useState<ProductView[]>([]);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState<null | ProductView>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ code: '', name: '', description: '' });
  const [priceForm, setPriceForm] = useState<Record<number, { price: string; min_stock: string }>>({});
  const [adj, setAdj] = useState<Record<number, string>>({});
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const photoFileRef = useRef<HTMLInputElement>(null);
  const readonly = isReadOnly();

  const load = () => {
    if (!baseId) {
      setProducts([]);
      return;
    }
    const q = baseId ? `?base=${baseId}${pos ? `&pos=${pos}` : ''}` : '';
    api<ProductView[]>(`/api/products${q}`).then(setProducts).catch((e) => setErr((e as Error).message));
  };

  useEffect(() => {
    Promise.all([api<Base[]>('/api/bases'), api<Deposito[]>('/api/depositos')])
      .then(([b, d]) => {
        setBases(b);
        setDepositos(d);
        setBaseId((prev) => prev || b[0]?.id || 0);
        if (d[0]) setDepositoId(d[0].id);
      })
      .catch((e) => setErr((e as Error).message));
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseId, pos]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      const body = photoPreview ? { ...form, image_base64: photoPreview } : form;
      if (creating) {
        await api('/api/products', { body });
      } else if (editing) {
        await api(`/api/products/${editing.id}`, { method: 'PUT', body });
      }
      setCreating(false);
      setEditing(null);
      setPhotoPreview(null);
      await load();
    } catch (er) {
      setErr((er as Error).message);
    }
  };

  const adjust = async (id: number) => {
    const delta = Number(adj[id] ?? 0);
    if (!delta || !depositoId) return;
    try {
      await api(`/api/products/${id}/stock`, { body: { depositoId, delta, note: 'Ajuste desde panel' } });
      await load();
      setAdj((a) => ({ ...a, [id]: '' }));
    } catch (er) {
      alert((er as Error).message);
    }
  };

  const savePrice = async (p: ProductView) => {
    const v = priceForm[p.id] ?? { price: String(p.price), min_stock: String(p.min_stock) };
    try {
      await api<{ ok: boolean }>(`/api/bases/${baseId}/products/${p.id}`, {
        method: 'PATCH',
        body: { price: Number(v.price), min_stock: Number(v.min_stock) },
      });
      setPriceForm((f) => {
        const next = { ...f };
        delete next[p.id];
        return next;
      });
      await load();
    } catch (er) {
      alert((er as Error).message);
    }
  };

  const pickPhoto = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const toggleActive = async (p: ProductView) => {
    await api(`/api/products/${p.id}/active`, { body: !p.active });
    await load();
  };

  const del = async (p: ProductView) => {
    if (!confirm(`¿Eliminar ${p.name}?`)) return;
    await api(`/api/products/${p.id}`, { method: 'DELETE' });
    await load();
  };

  const openNew = () => {
    setForm({ code: '', name: '', description: '' });
    setCreating(true);
    setEditing(null);
    setPhotoPreview(null);
  };
  const openEdit = (p: ProductView) => {
    setForm({ code: p.code, name: p.name, description: p.description });
    setEditing(p);
    setCreating(false);
    setPhotoPreview(null);
  };

  return (
    <div>
      <div className="head">
        <h1>Productos y stock</h1>
        {!readonly && (
          <button className="primary" onClick={openNew}>+ Nuevo producto</button>
        )}
      </div>
      <div className="form-row">
        <label>
          Base de precios
          <select value={baseId} onChange={(e) => setBaseId(Number(e.target.value))}>
            {bases.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </label>
        <label>
          Depósito (para ajustes)
          <select value={depositoId} onChange={(e) => setDepositoId(Number(e.target.value))}>
            {depositos.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </label>
      </div>
      {err && <div className="error">{err}</div>}

      {(creating || editing) && !readonly && (
        <form className="panel-form" onSubmit={save}>
          <h3>{creating ? 'Nuevo producto' : `Editar ${editing?.name}`}</h3>
          <div className="form-row">
            <label>Código <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required /></label>
            <label>Nombre <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
          </div>
          <label>Descripción
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </label>
          <div>
            <h4>Foto del producto</h4>
            <div className="photo-picker">
              {photoPreview && <img className="thumb lg" src={photoPreview} alt="preview" />}
              <div>
                <input
                  ref={photoFileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  style={{ display: 'none' }}
                  onChange={(e) => pickPhoto(e.target.files?.[0] ?? null)}
                />
                <button type="button" onClick={() => photoFileRef.current?.click()}>
                  {photoPreview ? 'Cambiar foto' : 'Subir foto'}
                </button>
                {photoPreview && (
                  <button type="button" onClick={() => setPhotoPreview(null)}>Quitar</button>
                )}
              </div>
            </div>
          </div>
          <div className="form-actions">
            <button className="primary" type="submit">Guardar</button>
            <button type="button" onClick={() => { setCreating(false); setEditing(null); setPhotoPreview(null); }}>Cancelar</button>
          </div>
        </form>
      )}

      <table>
        <thead>
          <tr><th>Foto</th><th>Código</th><th>Nombre</th><th>Precio</th><th>Mín.</th><th>Stock total</th><th>Por depósito</th><th>Ajustar</th><th>Acciones</th></tr>
        </thead>
        <tbody>
          {products.map((p) => {
            const low = p.stock_total <= p.min_stock;
            const pf = priceForm[p.id] ?? { price: String(p.price), min_stock: String(p.min_stock) };
            return (
              <tr key={p.id} className={!p.active ? 'inactive' : ''}>
                <td>
                  <div className="photo-cell">
                    {p.image ? (
                      <img className="thumb" src={assetUrl(`/api/products/${p.id}/image`)} alt={p.name} />
                    ) : (
                      <div className="thumb empty">—</div>
                    )}
                  </div>
                </td>
                <td>{p.code}</td>
                <td>{p.name}{!p.active && <span className="tag"> inactivo</span>}</td>
                <td>
                  <div className="adj">
                    <input
                      type="number" step="0.01" value={pf.price}
                      onChange={(e) => setPriceForm({ ...priceForm, [p.id]: { price: e.target.value, min_stock: pf.min_stock } })}
                      title="Precio en la base actual"
                    />
                    <button onClick={() => savePrice(p)} disabled={readonly}>Guardar</button>
                  </div>
                </td>
                <td>
                  <input
                    className="w-input" type="number" value={pf.min_stock}
                    onChange={(e) => setPriceForm({ ...priceForm, [p.id]: { price: pf.price, min_stock: e.target.value } })}
                    onBlur={() => savePrice(p)}
                    disabled={readonly}
                  />
                </td>
                <td className={low ? 'warn' : ''}>
                  {p.stock_total}
                  {low && <span className="tag"> bajo</span>}
                </td>
                <td>
                  {p.by_deposito?.length
                    ? p.by_deposito.map((d) => `${d.deposito_name ?? `#${d.deposito_id}`}: ${d.quantity}`).join(' · ')
                    : '—'}
                </td>
                <td>
                  <div className="adj">
                    <input type="number" placeholder="±" value={adj[p.id] ?? ''} onChange={(e) => setAdj({ ...adj, [p.id]: e.target.value })} />
                    <button onClick={() => adjust(p.id)} title="Ajuste en el depósito elegido" disabled={readonly}>Aplicar</button>
                  </div>
                </td>
                <td className="actions">
                  <button onClick={() => openEdit(p)} disabled={readonly}>Editar</button>
                  <button onClick={() => toggleActive(p)} disabled={readonly}>{p.active ? 'Desactivar' : 'Activar'}</button>
                  <button className="danger" onClick={() => del(p)} disabled={readonly}>×</button>
                </td>
              </tr>
            );
          })}
          {products.length === 0 && <tr><td colSpan={9} className="empty">Sin productos en esta base</td></tr>}
        </tbody>
      </table>
    </div>
  );
}