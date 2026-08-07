import { useEffect, useRef, useState } from 'react';
import { api, money, isReadOnly } from '../api';

interface Product {
  id: number;
  code: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  min_stock: number;
  active: number;
  image?: string | null;
}

const empty = { code: '', name: '', description: '', price: 0, min_stock: 5, stock: 0 };

export function Products() {
  const [products, setProducts] = useState<Product[]>([]);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState<null | Product>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<typeof empty>(empty);
  const [adj, setAdj] = useState<Record<number, string>>({});
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const photoFileRef = useRef<HTMLInputElement>(null);
  const rowFileRef = useRef<HTMLInputElement>(null);
  const [photoFor, setPhotoFor] = useState<number | null>(null);
  const readonly = isReadOnly();

  const load = () =>
    api<Product[]>('/api/products').then(setProducts).catch((e) => setErr((e as Error).message));

  useEffect(() => {
    load();
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      const body = photoPreview
        ? { ...form, image_base64: photoPreview }
        : { ...form };
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

  const pickFormPhoto = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const uploadRowPhoto = async (id: number, file: File | null) => {
    if (!file || id == null) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await api(`/api/products/${id}/image`, { body: { image_base64: reader.result } });
        await load();
      } catch (er) {
        alert((er as Error).message);
      }
    };
    reader.readAsDataURL(file);
  };

  const removePhoto = async (p: Product) => {
    if (!confirm(`¿Quitar la foto de ${p.name}?`)) return;
    try {
      await api(`/api/products/${p.id}/image`, { method: 'DELETE' });
      await load();
    } catch (er) {
      alert((er as Error).message);
    }
  };

  const adjust = async (id: number) => {
    const delta = Number(adj[id] ?? 0);
    if (!delta) return;
    try {
      await api(`/api/products/${id}/stock`, { body: { delta, note: 'Ajuste desde panel' } });
      await load();
      setAdj((a) => ({ ...a, [id]: '' }));
    } catch (er) {
      alert((er as Error).message);
    }
  };

  const toggleActive = async (p: Product) => {
    await api(`/api/products/${p.id}/active`, { body: !p.active });
    await load();
  };

  const del = async (p: Product) => {
    if (!confirm(`¿Eliminar ${p.name}?`)) return;
    await api(`/api/products/${p.id}`, { method: 'DELETE' });
    await load();
  };

  const openNew = () => {
    setForm(empty);
    setCreating(true);
    setEditing(null);
    setPhotoPreview(null);
  };
  const openEdit = (p: Product) => {
    setForm({ code: p.code, name: p.name, description: p.description, price: p.price, min_stock: p.min_stock, stock: p.stock });
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
      {err && <div className="error">{err}</div>}

      {(creating || editing) && !readonly && (
        <form className="panel-form" onSubmit={save}>
          <h3>{creating ? 'Nuevo producto' : `Editar ${editing?.name}`}</h3>
          <div className="form-row">
            <label>Código <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required /></label>
            <label>Nombre <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
            <label>Precio <input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} required /></label>
            <label>Stock inicial {creating && <input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })} />}
              {!creating && <span className="muted">{editing?.stock} (edita con ajuste)</span>}
            </label>
            <label>Stock mínimo <input type="number" value={form.min_stock} onChange={(e) => setForm({ ...form, min_stock: Number(e.target.value) })} /></label>
          </div>
          <label>Descripción
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </label>
          {(creating || editing) && (
            <div>
              <h4>Foto del producto</h4>
              <div className="photo-picker">
                {photoPreview && (
                  <img className="thumb lg" src={photoPreview} alt="preview" />
                )}
                {!photoPreview && editing?.image && (
                  <img className="thumb lg" src={`/api/products/${editing.id}/image`} alt={editing.name} />
                )}
                <div>
                  <input
                    ref={photoFileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    style={{ display: 'none' }}
                    onChange={(e) => pickFormPhoto(e.target.files?.[0] ?? null)}
                  />
                  <button type="button" onClick={() => photoFileRef.current?.click()}>
                    {photoPreview || editing?.image ? 'Cambiar foto' : 'Subir foto'}
                  </button>
                  {(photoPreview || editing?.image) && (
                    <button type="button" onClick={() => setPhotoPreview(null)}>Quitar</button>
                  )}
                </div>
              </div>
            </div>
          )}
          <div className="form-actions">
            <button className="primary" type="submit">Guardar</button>
            <button type="button" onClick={() => { setCreating(false); setEditing(null); setPhotoPreview(null); }}>Cancelar</button>
          </div>
        </form>
      )}

      <input
        ref={rowFileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        style={{ display: 'none' }}
        onChange={(e) => {
          uploadRowPhoto(photoFor!, e.target.files?.[0] ?? null);
          e.target.value = '';
        }}
      />

      <table>
        <thead>
          <tr><th>Foto</th><th>Código</th><th>Nombre</th><th>Precio</th><th>Stock</th><th>Mín.</th><th>Ajustar</th><th>Acciones</th></tr>
        </thead>
        <tbody>
          {products.map((p) => {
            const low = p.stock <= p.min_stock;
            return (
              <tr key={p.id} className={!p.active ? 'inactive' : ''}>
                <td>
                  <div className="photo-cell">
                    {p.image ? (
                      <>
                        <img className="thumb" src={`/api/products/${p.id}/image`} alt={p.name} />
                        {!readonly && <button className="mini danger" title="Quitar foto" onClick={() => removePhoto(p)}>×</button>}
                      </>
                    ) : (
                      <>
                        <div className="thumb empty">—</div>
                        {!readonly && (
                          <button className="mini" title="Subir foto" onClick={() => { setPhotoFor(p.id); rowFileRef.current?.click(); }}>
                            +
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </td>
                <td>{p.code}</td>
                <td>{p.name}{!p.active && <span className="tag"> inactivo</span>}</td>
                <td>{money(p.price)}</td>
                <td className={low ? 'warn' : ''}>{p.stock}</td>
                <td>{p.min_stock}</td>
                <td>
                  <div className="adj">
                    <input type="number" placeholder="±" value={adj[p.id] ?? ''} onChange={(e) => setAdj({ ...adj, [p.id]: e.target.value })} />
                    <button onClick={() => adjust(p.id)} title="Aplicar ajuste de stock">Aplicar</button>
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
        </tbody>
      </table>
    </div>
  );
}