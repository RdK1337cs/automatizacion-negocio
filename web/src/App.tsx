import { Navigate, Route, Routes, Link, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { getToken, clearToken, api, isAdmin, getPos, setPos } from './api';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Products } from './pages/Products';
import { Orders } from './pages/Orders';
import { Quotes } from './pages/Quotes';
import { Logs } from './pages/Logs';
import { Settings } from './pages/Settings';
import { Users } from './pages/Users';
import { PosPage } from './pages/Pos';
import { BasesPage } from './pages/Bases';
import { DepositosPage } from './pages/Depositos';
import { CompanyLogo } from './components/CompanyLogo';

interface Pos {
  id: number;
  name: string;
}

function PosSelector({ pos, onPick }: { pos: string; onPick: (id: string) => void }) {
  const [options, setOptions] = useState<Pos[]>([]);
  useEffect(() => {
    api<Pos[]>('/api/pos/mine')
      .then((mine) => setOptions(mine.length > 0 ? mine : ([] as Pos[])))
      .catch(() => api<Pos[]>('/api/pos').then(setOptions).catch(() => undefined));
  }, []);
  if (options.length === 0) return null;
  return (
    <div className="pos-selector">
      <label>Punto de venta: </label>
      <select value={pos} onChange={(e) => onPick(e.target.value)}>
        {options.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function Sidebar({ pos, onPickPos }: { pos: string; onPickPos: (id: string) => void }) {
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
  if (isAdmin()) {
    links.push(
      { to: '/pos', label: 'Puntos de venta', icon: '⚑' },
      { to: '/bases', label: 'Bases y precios', icon: '◐' },
      { to: '/depositos', label: 'Depósitos y stock', icon: '▣' },
      { to: '/usuarios', label: 'Usuarios', icon: '👤' }
    );
  }
  const logout = () => {
    clearToken();
    navigate('/');
  };
  return (
    <aside className="sidebar">
      <CompanyLogo className="logo" />
      <PosSelector pos={pos} onPick={onPickPos} />
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

function Layout({ children, health, pos, onPickPos }: {
  children: React.ReactNode;
  health?: { whatsapp?: string; email?: string };
  pos: string;
  onPickPos: (id: string) => void;
}) {
  const sim = health && (health.whatsapp === 'simulacion' || health.email === 'simulacion');
  return (
    <div className="app">
      <Sidebar pos={pos} onPickPos={onPickPos} />
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
  const [pos, setPosState] = useState(getPos());
  useEffect(() => {
    api<{ whatsapp?: string; email?: string }>('/api/health')
      .then(setHealth)
      .catch(() => setFailed(true));
  }, []);
  const token = getToken();
  if (!token) return <Navigate to="/" replace />;
  if (!health && !failed) return <div className="loading">Cargando…</div>;
  const pickPos = (id: string) => {
    setPos(String(id));
    setPosState(String(id));
    window.dispatchEvent(new Event('poschange'));
  };
  return (
    <Layout health={health ?? undefined} pos={pos} onPickPos={pickPos}>
      <Routes>
        <Route path="/dashboard" element={<Dashboard pos={Number(pos)} />} />
        <Route path="/productos" element={<Products pos={Number(pos)} />} />
        <Route path="/pedidos" element={<Orders pos={Number(pos)} />} />
        <Route path="/presupuestos" element={<Quotes pos={Number(pos)} />} />
        <Route path="/logs" element={<Logs />} />
        <Route path="/ajustes" element={<Settings />} />
        <Route path="/pos" element={isAdmin() ? <PosPage /> : <Navigate to="/dashboard" replace />} />
        <Route path="/bases" element={isAdmin() ? <BasesPage /> : <Navigate to="/dashboard" replace />} />
        <Route path="/depositos" element={isAdmin() ? <DepositosPage /> : <Navigate to="/dashboard" replace />} />
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