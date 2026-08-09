import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setToken } from '../api';
import { CompanyLogo } from '../components/CompanyLogo';

type LoginResponse =
  | { token: string; role: string; must_change_password?: boolean }
  | { pending2fa: true; token: string; phone: string; must_change_password?: boolean };

export function Login() {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [phone, setPhone] = useState('');
  const [pendingToken, setPendingToken] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [finalToken, setFinalToken] = useState('');
  const [mustChange, setMustChange] = useState(false);
  const [newPass, setNewPass] = useState('');
  const [newPass2, setNewPass2] = useState('');
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
        setMustChange(Boolean(res.must_change_password));
        setFinalToken('');
        setCode('');
        return;
      }
      if (res.must_change_password) {
        setFinalToken(res.token);
        setMustChange(true);
        setToken(res.token, res.role);
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
      const res = await api<{ token: string; role: string; must_change_password?: boolean }>('/2fa/verify', {
        body: { token: pendingToken, code },
      });
      setPendingToken('');
      if (res.must_change_password || mustChange) {
        setFinalToken(res.token);
        setMustChange(true);
        setToken(res.token, res.role);
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

  const submitNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPass.length < 4) {
      setError('La contraseña debe tener al menos 4 caracteres');
      return;
    }
    if (newPass !== newPass2) {
      setError('Las contraseñas no coinciden');
      return;
    }
    setBusy(true);
    try {
      await api('/me/password', {
        body: { password: newPass },
        method: 'POST',
      });
      setMustChange(false);
      navigate('/dashboard');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (mustChange && finalToken) {
    return (
      <div className="login-wrap">
        <form className="login-card" onSubmit={submitNewPassword}>
          <div className="login-brand">
            <CompanyLogo className="login-logo" />
            <span className="login-badge">Primer ingreso</span>
          </div>
          <h1 className="login-title">Cambiá tu contraseña</h1>
          <p className="login-hint">
            Estás usando la contraseña por defecto (tu DNI). Por seguridad, elegí una
            contraseña nueva antes de continuar.
          </p>
          <label className="field">
            <span>Contraseña nueva</span>
            <input
              type="password"
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
              placeholder="Mínimo 4 caracteres"
              autoFocus
            />
          </label>
          <label className="field">
            <span>Confirmar contraseña</span>
            <input
              type="password"
              value={newPass2}
              onChange={(e) => setNewPass2(e.target.value)}
              placeholder="Repetí la contraseña"
            />
          </label>
          {error && <div className="error">{error}</div>}
          <button className="btn-primary" disabled={busy}>
            {busy ? 'Guardando…' : 'Guardar y continuar'}
          </button>
        </form>
      </div>
    );
  }

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
              setMustChange(false);
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