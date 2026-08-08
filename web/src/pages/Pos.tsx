import { useEffect, useState } from 'react';
import { api } from '../api';

interface Deposit {
  id: number;
  name: string;
}
interface PosUser {
  id: number;
  username: string;
  role: string;
}
interface PosDetails {
  id: number;
  name: string;
  location: string;
  active: number;
  depositos: Deposit[];
  users: PosUser[];
}
interface UserRow {
  id: number;
  username: string;
}

export function PosPage() {
  const [posList, setPosList] = useState<PosDetails[]>([]);
  const [depositos, setDepositos] = useState<Deposit[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [err, setErr] = useState('');
  const [form, setForm] = useState({ name: '', location: '' });
  const [creating, setCreating] = useState(false);

  const load = () =>
    Promise.all([
      api<PosDetails[]>('/api/pos'),
      api<Deposit[]>('/api/depositos'),
      api<UserRow[]>('/api/users'),
    ])
      .then(([p, d, u]) => {
        setPosList(p);
        setDepositos(d);
        setUsers(u);
      })
      .catch((e) => setErr((e as Error).message));

  useEffect(() => {
    load();
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api('/api/pos', { body: form });
      setCreating(false);
      setForm({ name: '', location: '' });
      await load();
    } catch (er) {
      setErr((er as Error).message);
    }
  };

  const setDepos = async (id: number, depositoIds: number[]) => {
    try {
      await api(`/api/pos/${id}/depositos`, { method: 'POST', body: { depositoIds } });
      await load();
    } catch (er) {
      alert((er as Error).message);
    }
  };

  const setUsersForPos = async (id: number, assignments: Array<{ userId: number; role: 'operador' | 'lector' }>) => {
    try {
      await api(`/api/pos/${id}/users`, { method: 'POST', body: { assignments } });
      await load();
    } catch (er) {
      alert((er as Error).message);
    }
  };

  const del = async (p: PosDetails) => {
    if (!confirm(`¿Eliminar el punto de venta "${p.name}"?`)) return;
    try {
      await api(`/api/pos/${p.id}`, { method: 'DELETE' });
      await load();
    } catch (er) {
      alert((er as Error).message);
    }
  };

  const update = async (p: PosDetails, patch: { name?: string; active?: boolean }) => {
    try {
      await api(`/api/pos/${p.id}`, { method: 'PUT', body: patch });
      await load();
    } catch (er) {
      alert((er as Error).message);
    }
  };

  return (
    <div>
      <div className="head">
        <h1>Puntos de venta</h1>
        <button className="primary" onClick={() => setCreating((c) => !c)}>
          {creating ? 'Cancelar' : '+ Nuevo POS'}
        </button>
      </div>
      {err && <div className="error">{err}</div>}

      {creating && (
        <form className="panel-form" onSubmit={save}>
          <h3>Nuevo punto de venta</h3>
          <div className="form-row">
            <label>
              Nombre
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label>
              Ubicación
              <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </label>
          </div>
          <div className="form-actions">
            <button className="primary" type="submit">Crear</button>
          </div>
        </form>
      )}

      <table>
        <thead>
          <tr><th>POS</th><th>Depósitos asignados</th><th>Usuarios con acceso</th><th>Acciones</th></tr>
        </thead>
        <tbody>
          {posList.map((p) => (
            <tr key={p.id} className={!p.active ? 'inactive' : ''}>
              <td>
                <strong>{p.name}</strong>
                <div className="muted">{p.location || '—'}</div>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={Boolean(p.active)}
                    onChange={(e) => update(p, { active: e.target.checked })}
                  />
                  activo
                </label>
              </td>
              <td>
                <div className="tag-row">
                  {depositos.map((d) => (
                    <label key={d.id} className="check">
                      <input
                        type="checkbox"
                        checked={p.depositos.some((x) => x.id === d.id)}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...p.depositos.map((x) => x.id), d.id]
                            : p.depositos.map((x) => x.id).filter((x) => x !== d.id);
                          setDepos(p.id, next);
                        }}
                      />
                      {d.name}
                    </label>
                  ))}
                </div>
              </td>
              <td>
                <div className="tag-row">
                  {users.map((u) => (
                    <label key={u.id} className="check">
                      <input
                        type="checkbox"
                        checked={p.users.some((x) => x.id === u.id && x.role === 'operador')}
                        onChange={(e) => {
                          const has = p.users.some((x) => x.id === u.id && x.role === 'operador');
                          const assignments = p.users
                            .filter((x) => x.id !== u.id)
                            .map((x) => ({ userId: x.id, role: x.role as 'operador' | 'lector' }));
                          if (e.target.checked) assignments.push({ userId: u.id, role: 'operador' });
                          setUserForPos(p.id, assignments);
                        }}
                      />
                      {u.username}
                    </label>
                  ))}
                </div>
              </td>
              <td className="actions">
                <button onClick={() => updateName(p)}>Renombrar</button>
                <button className="danger" onClick={() => del(p)}>×</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function setUserForPos(id: number, assignments: Array<{ userId: number; role: 'operador' | 'lector' }>): Promise<void> {
  await api(`/api/pos/${id}/users`, { method: 'POST', body: { assignments } });
}

function updateName(p: { id: number; name: string }): void {
  const name = prompt('Nuevo nombre:', p.name);
  if (!name) return;
  void api(`/api/pos/${p.id}`, { method: 'PUT', body: { name } });
}