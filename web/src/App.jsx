import React, { useState } from 'react';
import { Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth, canEditKind, isAdmin, isManager } from './auth.jsx';
import { ToastProvider, Icon, Loading, useApi, BusyBar } from './components/ui.jsx';
import { ROLE } from './format.js';
import Login from './pages/Login.jsx';
import Onboarding from './pages/Onboarding.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Contracts from './pages/Contracts.jsx';
import ContractForm from './pages/ContractForm.jsx';
import ContractDetail from './pages/ContractDetail.jsx';
import Dossier from './pages/Dossier.jsx';
import Partners from './pages/Partners.jsx';
import Dossiers from './pages/Dossiers.jsx';
import Users from './pages/Users.jsx';
import Settings from './pages/Settings.jsx';
import Audit from './pages/Audit.jsx';
import Profile from './pages/Profile.jsx';

function Shell() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  React.useEffect(() => setOpen(false), [loc.pathname]);
  const admin = isAdmin(user);
  const s = useApi('/stats/summary', [loc.pathname]);
  const count = (kind) => (s.data?.byKind || []).filter((x) => x.kind === kind && ['PROPOSTA', 'FIRMATO'].includes(x.status)).reduce((a, x) => a + x.n, 0);
  const L = ({ to, icon, children, count: c, end }) => (
    <NavLink to={to} end={end}><Icon name={icon} />{children}{c ? <span className="count">{c}</span> : null}</NavLink>
  );
  return (
    <div className="shell">
      <aside className={`side ${open ? 'open' : ''}`}>
        <div className="brand"><img src="/logo-light.svg" alt="Toscana Diagnostica" /><div className="app">Business · Contratti</div></div>
        <nav>
          <L to="/" icon="home" end>Dashboard</L>
          <div className="group">Anagrafiche</div>
          <L to="/partner" icon="building">Partner e clienti B2B</L>
          <L to="/contratti" icon="archive">Tutti i contratti</L>
          <L to="/fascicoli" icon="folder">Fascicoli autorizzazione</L>
          <div className="group">Sezioni</div>
          <L to="/punti-prelievo" icon="pin" count={count('PP')}>Punti Prelievo</L>
          <L to="/sedi" icon="bank" count={count('SEDE')}>Sedi TD in locazione</L>
          <L to="/service" icon="truck" count={count('SRV')}>Service di Laboratorio</L>
          <L to="/medicina-del-lavoro" icon="stetho" count={count('MDL')}>Medicina del Lavoro</L>
          {admin && <>
            <div className="group">Amministrazione</div>
            <L to="/utenti" icon="users">Utenti</L>
            <L to="/impostazioni" icon="gear">Impostazioni</L>
            <L to="/audit" icon="shield">Registro attività</L>
          </>}
        </nav>
        <div className="me">
          <div className="name">{user.full_name}</div>
          <div>{ROLE[user.role]}</div>
          <div className="row" style={{ marginTop: 8 }}>
            <NavLink to="/profilo" className="btn sm ghost" style={{ color: 'var(--teal)' }}>Profilo</NavLink>
            <button className="btn sm dark" onClick={logout}>Esci</button>
          </div>
        </div>
      </aside>
      <main className="main">
        <div className="topbar"><button onClick={() => setOpen(!open)} aria-label="Menu">☰</button><img src="/logo-light.svg" alt="" /></div>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/punti-prelievo" element={<Contracts kind="PP" />} />
          <Route path="/service" element={<Contracts kind="SRV" />} />
          <Route path="/medicina-del-lavoro" element={<Contracts kind="MDL" />} />
          <Route path="/sedi" element={<Contracts kind="SEDE" />} />
          <Route path="/fascicoli" element={<Dossiers />} />
          <Route path="/contratti" element={<Contracts />} />
          {isManager(user) && <Route path="/contratti/nuovo/:kind" element={<ContractForm />} />}
          {isManager(user) && <Route path="/contratti/:id/modifica" element={<ContractForm />} />}
          <Route path="/contratti/:id" element={<ContractDetail />} />
          <Route path="/contratti/:id/fascicolo" element={<Dossier />} />
          <Route path="/partner" element={<Partners />} />
          {admin && <Route path="/utenti" element={<Users />} />}
          {admin && <Route path="/impostazioni" element={<Settings />} />}
          {admin && <Route path="/audit" element={<Audit />} />}
          <Route path="/profilo" element={<Profile />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function Gate() {
  const { loading, user, onboarding } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Routes><Route path="*" element={<Login />} /></Routes>;
  if (onboarding) return <Onboarding />;
  return <Shell />;
}

export default function App() {
  return (
    <ToastProvider>
      <BusyBar />
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </ToastProvider>
  );
}
export { canEditKind };
