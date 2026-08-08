import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setToken } from '../api';

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
        <form className="login" onSubmit={submitCode}>
          <h1>⚡ Verificación en dos pasos</h1>
          <p>
            Enviamos un código de 6 dígitos al celular {phone}. <br />
            <small>(Modo prueba: el código se muestra en la página Logs / consola)</small>
          </p>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Código de 6 dígitos"
            inputMode="numeric"
            autoFocus
          />
          {error && <div className="error">{error}</div>}
          <button disabled={busy}>{busy ? 'Verificando…' : 'Verificar'}</button>
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              setPendingToken('');
              setCode('');
            }}
          >
            ← Volver
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="login-wrap">
      <form className="login" onSubmit={submit}>
        <h1>⚡ Automatización de Negocio</h1>
        <p>Panel de administración</p>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Usuario"
          autoComplete="username"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Contraseña"
          autoComplete="current-password"
        />
        {error && <div className="error">{error}</div>}
        <button disabled={busy}>{busy ? 'Ingresando…' : 'Ingresar'}</button>
      </form>
    </div>
  );
}