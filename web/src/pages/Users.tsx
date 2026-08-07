import { useEffect, useState } from 'react';
import { api } from '../api';

type Role = 'admin' | 'operador' | 'lector';

interface User {
  id: number;
  username: string;
  role: Role;
  active: number;
  created_at: string;
  last_login: string | null;
}

const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrador',
  operador: 'Operador',
  lector: 'Solo lectura',
};

const empty = { username: '', password: '', role: 'operador' as Role };

export function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [me, setMe] = useState<{ username: string } | null>(null);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(empty);

  const load = () => {
    api<User[]>('/api/users').then(setUsers).catch((e) => setErr((e as Error).message));
    api<{ username: string }>('/api/me').then(setMe).catch(() => undefined);
  };

  useEffect(() => {
    load();
  }, []);

  const flash = (msg: string) => {
    setOk(msg);
    setTimeout(() => setOk(''), 3500);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      await api('/api/users', { body: form });
      setForm(empty);
      setCreating(false);
      await load();
      flash('Usuario creado');
    } catch (er) {
      setErr((er as Error).message);
    }
  };

  const update = async (u: User, patch: { role?: Role; active?: boolean }) => {
    try {
      await api(`/api/users/${u.id}`, { method: 'PUT', body: patch });
      await load();
    } catch (er) {
      alert((er as Error).message);
    }
  };

  const resetPassword = async (u: User) => {
    const password = prompt(`Nueva contraseña para "${u.username}" (mínimo 4 caracteres):`);
    if (!password) return;
    try {
      await api(`/api/users/${u.id}/password`, { method: 'PATCH', body: { password } });
      flash('Contraseña actualizada');
    } catch (er) {
      alert((er as Error).message);
    }
  };

  const del = async (u: User) => {
    if (!confirm(`¿Eliminar al usuario "${u.username}"?`)) return;
    try {
      await api(`/api/users/${u.id}`, { method: 'DELETE' });
      await load();
    } catch (er) {
      alert((er as Error).message);
    }
  };

  return (
    <div>
      <div className="head">
        <h1>Usuarios y permisos</h1>
        <button className="primary" onClick={() => setCreating((c) => !c)}>
          {creating ? 'Cancelar' : '+ Nuevo usuario'}
        </button>
      </div>
      {err && <div className="error">{err}</div>}
      {ok && <div className="ok-banner">{ok}</div>}

      {creating && (
        <form className="panel-form" onSubmit={save}>
          <h3>Nuevo usuario</h3>
          <div className="form-row">
            <label>
              Usuario
              <input
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                required
              />
            </label>
            <label>
              Contraseña
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
            </label>
            <label>
              Rol
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
              >
                <option value="operador">Operador (edita todo)</option>
                <option value="lector">Solo lectura</option>
                <option value="admin">Administrador</option>
              </select>
            </label>
          </div>
          <div className="form-actions">
            <button className="primary" type="submit">
              Crear usuario
            </button>
            <button type="button" onClick={() => setCreating(false)}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      <table>
        <thead>
          <tr>
            <th>Usuario</th>
            <th>Rol</th>
            <th>Estado</th>
            <th>Creado</th>
            <th>Último ingreso</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => {
            const isMe = u.username === me?.username;
            return (
              <tr key={u.id} className={!u.active ? 'inactive' : ''}>
                <td>
                  {u.username}
                  {isMe && <span className="tag">vos</span>}
                </td>
                <td>
                  <select
                    value={u.role}
                    disabled={isMe}
                    onChange={(e) => update(u, { role: e.target.value as Role })}
                  >
                    {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={Boolean(u.active)}
                      disabled={isMe}
                      onChange={(e) => update(u, { active: e.target.checked })}
                    />
                    {u.active ? 'activo' : 'inactivo'}
                  </label>
                </td>
                <td>{u.created_at.replace('T', ' ').slice(0, 16)}</td>
                <td>{u.last_login ? u.last_login.replace('T', ' ').slice(0, 16) : '—'}</td>
                <td className="actions">
                  <button onClick={() => resetPassword(u)}>Cambiar contraseña</button>
                  {!isMe && (
                    <button className="danger" onClick={() => del(u)}>
                      ×
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <section style={{ marginTop: 20 }}>
        <h3>Permisos por rol</h3>
        <ul className="muted" style={{ paddingLeft: 20, lineHeight: 1.9 }}>
          <li><b>Administrador</b> — acceso total: pedidos, presupuestos, stock, ajustes y usuarios.</li>
          <li><b>Operador</b> — edita pedidos, presupuestos y stock, pero no administra usuarios ni ajustes de negocio.</li>
          <li><b>Solo lectura</b> — puede ver todo (dashboard, listados, logs) pero no modificar nada.</li>
        </ul>
      </section>
    </div>
  );
}