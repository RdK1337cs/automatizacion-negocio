import { useEffect, useState } from 'react';
import { api } from '../api';

const FIELDS: Array<{ key: string; label: string; textarea?: boolean }> = [
  { key: 'business_name', label: 'Nombre del negocio' },
  { key: 'business_phone', label: 'Teléfono (mostrado en PDFs)' },
  { key: 'business_email', label: 'Email del negocio' },
  { key: 'currency', label: 'Moneda (ej: ARS, USD)' },
  { key: 'low_stock_threshold', label: 'Umbral alerta de stock bajo' },
  { key: 'quote_validity_days', label: 'Validez de presupuestos (días)' },
  { key: 'email_notify_low_stock', label: 'Email para alertas de stock (vacío = desactivado)' },
  { key: 'security_admin_2fa', label: 'Verificación en dos pasos para administradores (1 = activado)' },
  { key: 'security_2fa_phone', label: 'Celular para código de verificación (2FA)' },
  { key: 'whatsapp_greeting', label: 'Saludo de WhatsApp ({business} = nombre)', textarea: true },
  { key: 'whatsapp_menu', label: 'Menú de opciones de WhatsApp', textarea: true },
];

export function Settings() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    api<Record<string, string>>('/api/settings').then(setValues).catch((e) => setErr((e as Error).message));
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setSaved(false);
    try {
      await api('/api/settings', { method: 'PUT', body: values });
      setSaved(true);
    } catch (er) {
      setErr((er as Error).message);
    }
  };

  return (
    <div>
      <h1>Ajustes</h1>
      {err && <div className="error">{err}</div>}
      {saved && <div className="ok-banner">Configuración guardada.</div>}
      <form className="panel-form" onSubmit={save}>
        {FIELDS.map((f) => (
          <label key={f.key}>
            {f.label}
            {f.textarea ? (
              <textarea
                rows={3}
                value={values[f.key] ?? ''}
                onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
              />
            ) : (
              <input
                value={values[f.key] ?? ''}
                onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
              />
            )}
          </label>
        ))}
        <div className="form-actions">
          <button className="primary" type="submit">Guardar</button>
        </div>
      </form>
    </div>
  );
}