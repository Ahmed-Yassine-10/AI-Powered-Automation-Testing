import React, { useState, useEffect } from 'react';
import Dashboard from './views/Dashboard';
import CreateSuite from './views/CreateSuite';
import Results from './views/Results';
import { Toast } from './components';
import { checkBackend } from './api';

const VIEWS = { dashboard: 'dashboard', create: 'create', results: 'results' };

export default function App() {
  const [view,  setView]  = useState(VIEWS.dashboard);
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

  const showToast = (message, type='info') => {
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

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh' }}>

      {/* ── Top bar ── */}
      <header style={{
        display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'0 24px', height:56, flexShrink:0,
        background:'var(--bg2)', borderBottom:'1px solid var(--border)',
      }}>
        {/* Logo */}
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{
            width:34, height:34, background:'var(--accent)', borderRadius:9,
            display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:14, fontWeight:800, color:'#fff', fontFamily:'var(--mono)',
          }}>🐍</div>
          <div>
            <div style={{ fontSize:15, fontWeight:800, lineHeight:1.2 }}>Medusa</div>
            <div style={{ fontSize:10, color:'var(--txt3)', fontFamily:'var(--mono)' }}>QA Automation Hub</div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ display:'flex', gap:4 }}>
          {[
            { key:VIEWS.dashboard, label:'🏠 Dashboard' },
            { key:VIEWS.create,   label:'+ Nouveau test' },
            { key:VIEWS.results,  label:'📊 Résultats'   },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => setView(key)}
              style={{
                padding:'6px 16px', fontSize:13, fontWeight:600, borderRadius:'var(--radius)',
                border:'1px solid', cursor:'pointer', transition:'all 0.15s',
                background: view===key ? 'var(--accent)' : 'transparent',
                borderColor: view===key ? 'var(--accent)' : 'var(--border2)',
                color: view===key ? '#fff' : 'var(--txt2)',
              }}>
              {label}
            </button>
          ))}
        </nav>

        {/* Status indicator */}
        <div
          title={backendUp === null ? 'Vérification du backend…' : backendUp ? 'Backend joignable' : 'Backend injoignable — mode localStorage'}
          style={{ display:'flex', alignItems:'center', gap:8, fontSize:11, color:'var(--txt3)', fontFamily:'var(--mono)' }}>
          <span style={{
            width:7, height:7, borderRadius:'50%', display:'inline-block',
            background: backendUp === null ? 'var(--amber)' : backendUp ? 'var(--green)' : 'var(--red)',
          }} />
          {backendUp === false ? 'Hors ligne' : 'Backend :5000'}
        </div>
      </header>

      {/* ── Main content ── */}
      <main style={{ flex:1, overflowY:'auto', padding:24 }}>
        {view === VIEWS.dashboard && (
          <Dashboard onNewSuite={handleNewSuite} />
        )}
        {view === VIEWS.create && (
          <CreateSuite
            projectId={currentProjectId}
            onSaved={handleSaved}
            onCancel={() => setView(VIEWS.dashboard)}
          />
        )}
        {view === VIEWS.results && (
          <Results />
        )}
      </main>

      {/* ── Toast ── */}
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
