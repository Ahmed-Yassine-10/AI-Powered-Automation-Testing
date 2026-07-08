import React, { useState, useEffect } from 'react';
import Dashboard from './views/Dashboard';
import CreateSuite from './views/CreateSuite';
import Results from './views/Results';
import { Toast } from './components';
import { checkBackend } from './api';

const VIEWS = { dashboard: 'dashboard', create: 'create', results: 'results' };

const NAV = [
  { key: VIEWS.dashboard, label: 'Dashboard', icon: '◧' },
  { key: VIEWS.create,    label: 'Nouveau test', icon: '＋' },
  { key: VIEWS.results,   label: 'Résultats', icon: '▤' },
];

const PAGE_META = {
  dashboard: { title: 'Dashboard', desc: 'Vos projets et cas de test automatisés' },
  create:    { title: 'Nouveau cas de test', desc: 'Enregistrez, générez et sauvegardez un test' },
  results:   { title: 'Résultats', desc: "Historique et analyse des exécutions" },
};

export default function App() {
  const [view, setView] = useState(VIEWS.dashboard);
  const [toast, setToast] = useState(null);
  const [currentProjectId, setCurrentProjectId] = useState(null);
  const [backendUp, setBackendUp] = useState(null);

  useEffect(() => {
    let active = true;
    const ping = async () => {
      const ok = await checkBackend();
      if (active) setBackendUp(ok);
    };
    ping();
    const t = setInterval(ping, 30000);
    return () => { active = false; clearInterval(t); };
  }, []);

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleSaved = () => {
    showToast('Cas de test enregistré avec succès !', 'success');
    setView(VIEWS.dashboard);
  };

  const handleNewSuite = (pid) => {
    setCurrentProjectId(pid);
    setView(VIEWS.create);
  };

  const meta = PAGE_META[view];

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>

      {/* ── Sidebar ── */}
      <aside style={{
        width: 'var(--sidebar-w)', flexShrink: 0, background: 'var(--bg-elev-1)',
        borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column',
        padding: '20px 14px',
      }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '4px 8px 22px' }}>
          <div style={{
            width: 38, height: 38, borderRadius: 11,
            background: 'linear-gradient(135deg, var(--accent), #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 19, boxShadow: '0 4px 14px var(--accent-ring)',
          }}>🪼</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.1, fontFamily: 'var(--display)' }}>Medusa</div>
            <div style={{ fontSize: 10, color: 'var(--txt3)', fontWeight: 500, letterSpacing: '0.3px' }}>QA AUTOMATION HUB</div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {NAV.map(({ key, label, icon }) => {
            const active = view === key;
            return (
              <button key={key} onClick={() => setView(key)} style={{
                display: 'flex', alignItems: 'center', gap: 11, padding: '10px 12px',
                fontSize: 13.5, fontWeight: 600, borderRadius: 'var(--radius)', textAlign: 'left',
                background: active ? 'var(--accent-bg)' : 'transparent',
                color: active ? 'var(--accent2)' : 'var(--txt2)',
                border: `1px solid ${active ? 'color-mix(in srgb, var(--accent) 28%, transparent)' : 'transparent'}`,
                transition: 'all 0.15s',
              }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--surface-hover)'; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{ fontSize: 16, width: 18, textAlign: 'center' }}>{icon}</span>
                {label}
              </button>
            );
          })}
        </nav>

        <div style={{ flex: 1 }} />

        {/* Backend status */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px',
          background: 'var(--bg-elev-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
        }}
          title={backendUp === null ? 'Vérification…' : backendUp ? 'Backend joignable' : 'Backend injoignable — mode localStorage'}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
            background: backendUp === null ? 'var(--amber)' : backendUp ? 'var(--green)' : 'var(--red)',
            boxShadow: `0 0 0 3px color-mix(in srgb, ${backendUp === null ? 'var(--amber)' : backendUp ? 'var(--green)' : 'var(--red)'} 22%, transparent)`,
          }} />
          <div style={{ fontSize: 11.5, lineHeight: 1.3 }}>
            <div style={{ fontWeight: 600, color: 'var(--txt2)' }}>
              {backendUp === null ? 'Connexion…' : backendUp ? 'Backend en ligne' : 'Hors ligne'}
            </div>
            <div style={{ color: 'var(--txt3)', fontFamily: 'var(--mono)', fontSize: 10 }}>localhost:5000</div>
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <header style={{
          height: 'var(--header-h)', flexShrink: 0, display: 'flex', alignItems: 'center',
          padding: '0 32px', borderBottom: '1px solid var(--border)', background: 'var(--bg)',
        }}>
          <div>
            <h1 style={{ fontSize: 17, fontWeight: 800 }}>{meta.title}</h1>
            <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 1 }}>{meta.desc}</div>
          </div>
        </header>

        <main style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>
          <div className="fade-in" style={{ maxWidth: 1180, margin: '0 auto' }}>
            {view === VIEWS.dashboard && <Dashboard onNewSuite={handleNewSuite} />}
            {view === VIEWS.create && (
              <CreateSuite
                projectId={currentProjectId}
                onSaved={handleSaved}
                onCancel={() => setView(VIEWS.dashboard)}
              />
            )}
            {view === VIEWS.results && <Results />}
          </div>
        </main>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
