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
  last_ip: string;
  dni: string;
  email: string;
  phone: string;
  email_verified: number;
  phone_verified: number;
  pos_ids: number[];
}
interface Pos {
  id: number;
  name: string;
}

const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrador',
  operador: 'Operador',
  lector: 'Solo lectura',
};

const empty = {
  username: '',
  password: '',
  role: 'operador' as Role,
  dni: '',
  email: '',
  phone: '',
  posIds: [] as number[],
};

export function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [posList, setPosList] = useState<Pos[]>([]);
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
    api<Pos[]>('/api/pos').then(setPosList).catch(() => undefined);
  }, []);

  const togglePos = (ids: number[], id: number) =>
    ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];

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

  const update = async (u: User, patch: { role?: Role; active?: boolean; posIds?: number[] }) => {
    try {
      await api(`/api/users/${u.id}`, { method: 'PUT', body: patch });
      await load();
    } catch (er) {
      alert((er as Error).message);
    }
  };

  const verify = async (u: User, channel: 'email' | 'sms') => {
    const label = channel === 'email' ? 'email' : 'WhatsApp';
    const target = channel === 'email' ? u.email : u.phone;
    if (!target) {
      alert(`El usuario "${u.username}" no tiene ${channel === 'email' ? 'email' : 'teléfono'} cargado.`);
      return;
    }
    const sendAndAsk = async (reintento = false) => {
      await api(`/api/users/${u.id}/verify/send`, { body: { channel } });
      const code = prompt(
        `${reintento ? 'Se reenvió' : 'Se envió'} un código de verificación por ${label} (${target}).\n\n` +
          'Ingresá el código de 6 dígitos (modo prueba: se ve en la página Logs):'
      );
      return code;
    };
    try {
      const code = await sendAndAsk();
      if (!code) return;
      await api(`/api/users/${u.id}/verify/confirm`, { body: { channel, code } });
      await load();
      flash(`${label} verificado`);
    } catch (er) {
      const msg = (er as Error).message;
      if (/no hay un código pendiente|expiró|ya fue utilizado|Demasiados/.test(msg)) {
        try {
          const retry = await sendAndAsk(true);
          if (!retry) return;
          await api(`/api/users/${u.id}/verify/confirm`, { body: { channel, code: retry } });
          await load();
          flash(`${label} verificado`);
          return;
        } catch (er2) {
          alert((er2 as Error).message);
          return;
        }
      }
      alert(msg);
    }
  };

  const resetPassword = async (u: User) => {
    const password = prompt(
      `Nueva contraseña para "${u.username}" (mínimo 4 caracteres; vacío = su DNI ${u.dni}):`
    );
    if (password === null) return;
    try {
      await api(`/api/users/${u.id}/password`, { method: 'PATCH', body: { password: password || u.dni } });
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
              DNI (obligatorio)
              <input
                value={form.dni}
                onChange={(e) => setForm({ ...form, dni: e.target.value.replace(/\D/g, '') })}
                inputMode="numeric"
                required
                placeholder="Número de documento"
              />
            </label>
            <label>
              Email
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="usuario@empresa.com"
              />
            </label>
            <label>
              Teléfono (WhatsApp)
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="Ej: 5491160000000"
              />
            </label>
            <label>
              Contraseña
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Vacío = su DNI"
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
          {posList.length > 0 && (
            <div>
              <h4 className="muted">Puntos de venta asignados</h4>
              <div className="tag-row">
                {posList.map((p) => (
                  <label key={p.id} className="check">
                    <input
                      type="checkbox"
                      checked={form.posIds.includes(p.id)}
                      onChange={(e) =>
                        setForm({ ...form, posIds: e.target.checked ? [...form.posIds, p.id] : form.posIds.filter((x) => x !== p.id) })
                      }
                    />
                    {p.name}
                  </label>
                ))}
              </div>
            </div>
          )}
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
            <th>DNI</th>
            <th>Email</th>
            <th>Teléfono</th>
            <th>Rol</th>
            <th>POS asignados</th>
            <th>Estado</th>
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
                <td>{u.dni || '—'}</td>
                <td className="pos-list">
                  {u.email ? (
                    <>
                      {u.email}
                      <br />
                      <span className={u.email_verified ? 'pill pill-confirmed' : 'pill pill-pending'}>
                        {u.email_verified ? 'verificado' : 'sin verificar'}
                      </span>
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="pos-list">
                  {u.phone ? (
                    <>
                      {u.phone}
                      <br />
                      <span className={u.phone_verified ? 'pill pill-confirmed' : 'pill pill-pending'}>
                        {u.phone_verified ? 'verificado' : 'sin verificar'}
                      </span>
                    </>
                  ) : (
                    '—'
                  )}
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
                <td className="pos-list">
                  {posList.length === 0
                    ? '—'
                    : posList.map((p) => (
                        <span key={p.id}>
                          <label className="check">
                            <input
                              type="checkbox"
                              disabled={isMe}
                              checked={(u.pos_ids ?? []).includes(p.id)}
                              onChange={(e) => {
                                const next = togglePos(u.pos_ids ?? [], p.id);
                                update(u, { posIds: next });
                              }}
                            />
                            {p.name}
                          </label>
                        </span>
                      ))}
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
                <td>
                  {u.last_login ? `${u.last_login.replace('T', ' ').slice(0, 16)}` : '—'}
                  {u.last_ip && (
                    <div className="muted" style={{ fontSize: 11.5 }}>IP: {u.last_ip}</div>
                  )}
                </td>
                <td className="actions">
                  <button onClick={() => verify(u, 'email')} title="Enviar y comprobar código por email">Verificar email</button>
                  <button onClick={() => verify(u, 'sms')} title="Enviar y comprobar código por WhatsApp">Verificar teléfono</button>
                  <button onClick={() => resetPassword(u)}>Contraseña</button>
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