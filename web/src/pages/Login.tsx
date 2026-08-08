import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setToken } from '../api';
import { CompanyLogo } from '../components/CompanyLogo';

type LoginResponse = { token: string; role: string } | { pending2fa: true; token: string; phone: string };

export function Login() {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [phone, setPhone] = useState('');
  const [pendingToken, setPendingToken] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api<LoginResponse>('/login', {
        body: { username, password },
      });
      if ('pending2fa' in res) {
        setPendingToken(res.token);
        setPhone(res.phone);
        setCode('');
        return;
      }
      setToken(res.token, res.role);
      navigate('/dashboard');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api<{ token: string; role: string }>('/2fa/verify', {
        body: { token: pendingToken, code },
      });
      setToken(res.token, res.role);
      navigate('/dashboard');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (pendingToken) {
    return (
      <div className="login-wrap">
        <form className="login-card" onSubmit={submitCode}>
          <div className="login-brand">
            <CompanyLogo className="login-logo" />
            <span className="login-badge">Verificación en dos pasos</span>
          </div>
          <p className="login-hint">
            Enviamos un código de 6 dígitos al celular <strong>{phone}</strong>.
            <br />
            <small>Modo prueba: el código se muestra en la página Logs / consola.</small>
          </p>
          <label className="field">
            <span>Código de seguridad</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Ingresá el código de 6 dígitos"
              inputMode="numeric"
              autoFocus
            />
          </label>
          {error && <div className="error">{error}</div>}
          <button className="btn-primary" disabled={busy}>
            {busy ? 'Verificando…' : 'Verificar'}
          </button>
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              setPendingToken('');
              setCode('');
            }}
          >
            ← Volver al inicio de sesión
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <CompanyLogo className="login-logo" />
          <span className="login-name">Panel de administración</span>
        </div>
        <h1 className="login-title">Automatización de Negocio</h1>
        <label className="field">
          <span>Usuario</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Tu usuario"
            autoComplete="username"
          />
        </label>
        <label className="field">
          <span>Contraseña</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Tu contraseña"
            autoComplete="current-password"
          />
        </label>
        {error && <div className="error">{error}</div>}
        <button className="btn-primary" disabled={busy}>
          {busy ? 'Ingresando…' : 'Ingresar'}
        </button>
        <p className="login-footer">© 2026 · Automatización de Negocio — acceso restringido</p>
      </form>
    </div>
  );
}