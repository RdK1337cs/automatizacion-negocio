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
  const [logoUrl, setLogoUrl] = useState('');
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoErr, setLogoErr] = useState('');
  const [logoSaved, setLogoSaved] = useState(false);

  const refreshLogo = () => {
    setLogoUrl(`/api/logo?v=${Date.now()}`);
    window.dispatchEvent(new Event('logochange'));
  };

  useEffect(() => {
    api<Record<string, string>>('/api/settings').then(setValues).catch((e) => setErr((e as Error).message));
    refreshLogo();
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setSaved(false);
    try {
      await api('/api/settings', { method: 'PUT', body: values });
      setSaved(true);
      refreshLogo();
    } catch (er) {
      setErr((er as Error).message);
    }
  };

  const uploadLogo = async (file: File) => {
    setLogoErr('');
    setLogoSaved(false);
    setLogoBusy(true);
    try {
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
        reader.readAsDataURL(file);
      });
      setLogoUrl(dataUrl);
      await api('/api/logo', { body: { imageBase64: dataUrl } });
      refreshLogo();
      setLogoSaved(true);
    } catch (er) {
      setLogoErr((er as Error).message);
      refreshLogo();
    } finally {
      setLogoBusy(false);
    }
  };

  const removeLogo = async () => {
    if (!confirm('¿Quitar el logo de la empresa?')) return;
    setLogoErr('');
    try {
      await api('/api/logo', { method: 'DELETE' });
      refreshLogo();
    } catch (er) {
      setLogoErr((er as Error).message);
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

      <section className="logo-section">
        <h2>Logo de la empresa</h2>
        <p className="muted">
          Se muestra en la pantalla de inicio de sesión y en el panel de control (barra lateral).
        </p>
        {logoErr && <div className="error">{logoErr}</div>}
        {logoSaved && <div className="ok-banner">Logo actualizado.</div>}
        <div className="logo-editor">
          <img className="logo-preview" src={logoUrl} alt="Logo de la empresa"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            onLoad={(e) => { (e.target as HTMLImageElement).style.display = ''; }}
          />
          <div className="form-actions">
            <label className="primary file-upload">
              {logoBusy ? 'Subiendo…' : 'Subir logo'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                disabled={logoBusy}
                onChange={(e) => {
                  if (e.target.files?.[0]) uploadLogo(e.target.files[0]);
                  e.target.value = '';
                }}
              />
            </label>
            <button className="danger" type="button" onClick={removeLogo}>Quitar logo</button>
          </div>
        </div>
      </section>
    </div>
  );
}