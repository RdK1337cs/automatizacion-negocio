import { Navigate, Route, Routes, Link, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { getToken, clearToken, api, isAdmin } from './api';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Products } from './pages/Products';
import { Orders } from './pages/Orders';
import { Quotes } from './pages/Quotes';
import { Logs } from './pages/Logs';
import { Settings } from './pages/Settings';
import { Users } from './pages/Users';

function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const links = [
    { to: '/dashboard', label: 'Dashboard', icon: '◫' },
    { to: '/productos', label: 'Productos y stock', icon: '▤' },
    { to: '/pedidos', label: 'Pedidos', icon: '☰' },
    { to: '/presupuestos', label: 'Presupuestos', icon: '⅍' },
    { to: '/logs', label: 'Logs', icon: '≣' },
    { to: '/ajustes', label: 'Ajustes', icon: '⚙' },
  ];
  if (isAdmin()) links.push({ to: '/usuarios', label: 'Usuarios', icon: '👤' });
  const logout = () => {
    clearToken();
    navigate('/');
  };
  return (
    <aside className="sidebar">
      <div className="logo">⚡ Negocio</div>
      <nav>
        {links.map((l) => (
          <Link key={l.to} to={l.to} className={location.pathname.startsWith(l.to) ? 'active' : ''}>
            {l.icon} {l.label}
          </Link>
        ))}
      </nav>
      <button className="logout" onClick={logout}>Cerrar sesión</button>
    </aside>
  );
}

function Layout({ children, health }: { children: React.ReactNode; health?: { whatsapp?: string; email?: string } }) {
  const sim = health && (health.whatsapp === 'simulacion' || health.email === 'simulacion');
  return (
    <div className="app">
      <Sidebar />
      <main className="content">
        {sim && (
          <div className="sim-banner">
            <b>Modo simulación:</b>{' '}
            {health.whatsapp === 'simulacion' && 'WhatsApp '}
            {health.email === 'simulacion' && (health.whatsapp === 'simulacion' ? 'y email ' : 'Email ')}
            se registran en Logs pero no se envían. Configurá{' '}
            <code>WHATSAPP_ACCESS_TOKEN</code> y <code>RESEND_API_KEY</code> en <code>.env</code> para envíos reales.
          </div>
        )}
        {children}
      </main>
    </div>
  );
}

function Protected() {
  const [health, setHealth] = useState<{ whatsapp?: string; email?: string } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    api<{ whatsapp?: string; email?: string }>('/api/health')
      .then(setHealth)
      .catch(() => setFailed(true));
  }, []);
  const token = getToken();
  if (!token) return <Navigate to="/" replace />;
  if (!health && !failed) return <div className="loading">Cargando…</div>;
  return (
    <Layout health={health ?? undefined}>
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/productos" element={<Products />} />
        <Route path="/pedidos" element={<Orders />} />
        <Route path="/presupuestos" element={<Quotes />} />
        <Route path="/logs" element={<Logs />} />
        <Route path="/ajustes" element={<Settings />} />
        <Route
          path="/usuarios"
          element={isAdmin() ? <Users /> : <Navigate to="/dashboard" replace />}
        />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/*" element={<Protected />} />
    </Routes>
  );
}