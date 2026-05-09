import React, { useEffect, useState, useCallback } from 'react';
import { getProjects, createProject, deleteProject, getProjectReport, getSuites, deleteSuite, runSuite, runStatus, getResults, updateSuite } from '../api';
import { Badge, Btn, Card, SectionTitle, EmptyState, Modal, CodeBlock, Spinner } from '../components';

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day:'2-digit', month:'short', year:'numeric' })
    + ' ' + d.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
}

function StatCard({ label, value, color }) {
  return (
    <div style={{
      background:'var(--bg3)', borderRadius:'var(--radius)', padding:'16px 18px',
      border:'1px solid var(--border)',
    }}>
      <div style={{ fontSize:10, color:'var(--txt3)', textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:6, fontWeight:700 }}>
        {label}
      </div>
      <div style={{ fontSize:28, fontWeight:800, color: color || 'var(--txt)', fontFamily:'var(--mono)' }}>
        {value}
      </div>
    </div>
  );
}

export default function Dashboard({ onNewSuite }) {
  const [view, setView] = useState('projects'); // 'projects' | 'suites'
  const [projects, setProjects] = useState([]);
  const [currentProject, setCurrentProject] = useState(null);

  const [suites,  setSuites]  = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSuite, setSelectedSuite] = useState(null);
  const [runningId, setRunningId] = useState(null);
  const [pollResult, setPollResult] = useState(null);

  const [showReport, setShowReport] = useState(null);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const ps = await getProjects();
      setProjects(ps);
    } catch(e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSuites = useCallback(async () => {
    if (!currentProject) return;
    setLoading(true);
    try {
      const [s, r] = await Promise.all([getSuites(currentProject.id), getResults()]);
      setSuites(s);
      setResults(r);
    } catch(e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [currentProject]);

  useEffect(() => {
    if (view === 'projects') loadProjects();
    else loadSuites();
  }, [view, loadProjects, loadSuites]);

  const handleCreateProject = async () => {
    const name = prompt('Nom du nouveau projet ?');
    if (!name) return;
    const desc = prompt('Description ? (optionnelle)', '');
    await createProject({ name, description: desc });
    loadProjects();
  };

  const handleDelProject = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Supprimer ce projet et toutes ses suites ?')) return;
    await deleteProject(id);
    loadProjects();
  };

  const handleGenReport = async () => {
    if (!currentProject) return;
    try {
      const r = await getProjectReport(currentProject.id);
      setShowReport(r);
    } catch (e) {
      alert("Erreur génération rapport: " + e.message);
    }
  };

  const handleDeleteSuite = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Supprimer cette suite de test ?')) return;
    await deleteSuite(id);
    loadSuites();
  };

  const handleRunSuite = async (suite, e) => {
    e?.stopPropagation();
    if (!suite.script) { alert('Aucun script généré pour cette suite.'); return; }
    setRunningId(suite.id);
    try {
      const result = await runSuite(suite.id);
      setPollResult(result);
      const poll = setInterval(async () => {
        try {
          const r = await runStatus(suite.id, result.id);
          setPollResult(r);
          if (r.status !== 'running') {
            clearInterval(poll);
            setRunningId(null);
            loadSuites();
          }
        } catch(err) {
          clearInterval(poll);
          setRunningId(null);
        }
      }, 2000);
    } catch(err) {
      setRunningId(null);
      alert('Erreur lors du lancement: ' + err.message);
    }
  };

  const total   = suites.length;
  const passed  = results.filter(r => r.status === 'pass' && suites.find(s=>s.id===r.suiteId)).length;
  const failed  = results.filter(r => r.status === 'fail' && suites.find(s=>s.id===r.suiteId)).length;

  const suiteResults = (id) => results.filter(r => r.suiteId === id);
  const lastStatus   = (id) => {
    const r = suiteResults(id);
    return r.length ? r[0].status : 'pending';
  };

  if (loading) return (
    <div style={{ display:'flex', justifyContent:'center', paddingTop:80 }}>
      <Spinner size={32} />
    </div>
  );

  if (showReport) return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:14 }}>
        <Btn onClick={() => setShowReport(null)}>← Retour</Btn>
        <Btn onClick={() => navigator.clipboard.writeText(showReport)}>📋 Copier Markdown</Btn>
      </div>
      <Card>
        <pre style={{ whiteSpace:'pre-wrap', fontFamily:'inherit', fontSize:14, lineHeight:1.5 }}>
          {showReport}
        </pre>
      </Card>
    </div>
  );

  if (view === 'projects') return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:28 }}>
        <SectionTitle>Mes Projets d'Automatisation</SectionTitle>
        <Btn variant="primary" onClick={handleCreateProject}>+ Nouveau Projet</Btn>
      </div>
      {!projects.length ? (
        <EmptyState icon="📁" title="Aucun projet" subtitle="Créez votre premier projet pour commencer" action={<Btn variant="primary" onClick={handleCreateProject}>Créer un projet</Btn>} />
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(300px, 1fr))', gap:16 }}>
          {projects.map(p => (
            <Card key={p.id} style={{ cursor:'pointer' }} onClick={() => { setCurrentProject(p); setView('suites'); }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                <div style={{ fontWeight:700, fontSize:16, marginBottom:6 }}>{p.name}</div>
                <Btn size="sm" variant="danger" onClick={e => handleDelProject(p.id, e)}>✕</Btn>
              </div>
              <div style={{ fontSize:12, color:'var(--txt2)', marginBottom:12 }}>{p.description || "Aucune description"}</div>
              <div style={{ fontSize:11, color:'var(--txt3)', fontFamily:'var(--mono)' }}>Créé le: {fmtDate(p.createdAt)}</div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <Btn onClick={() => { setView('projects'); setCurrentProject(null); }}>← Projets</Btn>
          <h2 style={{ fontSize:18, fontWeight:700 }}>{currentProject?.name}</h2>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn variant="ghost" onClick={handleGenReport}>📄 Résumé Texte</Btn>
          <Btn variant="primary" onClick={() => window.open(`http://localhost:5000/api/projects/${currentProject.id}/report/pdf`, '_blank')}>📥 Télécharger PDF</Btn>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:28 }}>
        <StatCard label="Cas de test"  value={total}   color="var(--accent2)" />
        <StatCard label="Succès"           value={passed}  color="var(--green)" />
        <StatCard label="Échecs"           value={failed}  color="var(--red)" />
      </div>

      {/* Poll status */}
      {pollResult && pollResult.status === 'running' && (
        <Card style={{ marginBottom:16, display:'flex', alignItems:'center', gap:12 }}>
          <Spinner />
          <span style={{ fontSize:13, color:'var(--txt2)' }}>
            Exécution en cours pour <strong>{pollResult.suiteName}</strong>…
          </span>
        </Card>
      )}

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
        <SectionTitle>Liste des cas de test</SectionTitle>
        <Btn variant="primary" onClick={() => onNewSuite(currentProject.id)}>+ Créer un cas de test</Btn>
      </div>

      {!suites.length ? (
        <EmptyState
          icon="🧪"
          title="Aucun test"
          subtitle="Créez votre premier cas de test"
          action={<Btn variant="primary" onClick={() => onNewSuite(currentProject.id)}>+ Nouveau test</Btn>}
        />
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {suites.map(s => (
            <div key={s.id}
              onClick={() => setSelectedSuite(s)}
              style={{
                background:'var(--bg2)', border:'1px solid var(--border)',
                borderRadius:'var(--radius-lg)', padding:'14px 18px',
                display:'flex', alignItems:'center', justifyContent:'space-between',
                cursor:'pointer', transition:'border-color 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor='var(--border2)'}
              onMouseLeave={e => e.currentTarget.style.borderColor='var(--border)'}
            >
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:700, fontSize:14, marginBottom:4 }}>{s.name}</div>
                <div style={{ fontSize:11, color:'var(--txt3)', fontFamily:'var(--mono)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {s.url} · {s.actions?.length || 0} actions · {fmtDate(s.createdAt)}
                </div>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0, marginLeft:16 }}>
                <Badge status={lastStatus(s.id)} />
                {runningId === s.id
                  ? <Spinner size={16} />
                  : <Btn size="sm" onClick={e => handleRunSuite(s, e)}>▶ Relancer</Btn>
                }
                <Btn size="sm" variant="danger" onClick={e => handleDeleteSuite(s.id, e)}>✕</Btn>
              </div>
            </div>
          ))}
        </div>
      )}

      <SuiteModal
        suite={selectedSuite}
        results={selectedSuite ? suiteResults(selectedSuite.id) : []}
        onClose={() => { setSelectedSuite(null); loadSuites(); }}
        onRun={handleRunSuite}
        onReload={loadSuites}
      />
    </div>
  );
}

function SuiteModal({ suite, results, onClose, onRun, onReload }) {
  const { patchResult } = require('../api');

  const markPass = async (rid) => {
    await patchResult(rid, { status: 'pass', note: 'Mis à jour manuellement.' });
    onReload();
  };

  if (!suite) return null;

  return (
    <Modal open={!!suite} onClose={onClose} title={suite.name} width={720}>
      <div style={{ marginBottom:16 }}>
        <div style={{ fontSize:12, color:'var(--txt3)', fontFamily:'var(--mono)', marginBottom:4 }}>
          🌐 {suite.url}
        </div>
        <div style={{ fontSize:13, color:'var(--txt2)' }}>{suite.task}</div>
      </div>

      {/* Actions list */}
      <SectionTitle>Actions enregistrées ({suite.actions?.length || 0})</SectionTitle>
      <div style={{ background:'var(--bg)', borderRadius:'var(--radius)', padding:'10px 14px', marginBottom:16, maxHeight:150, overflowY:'auto' }}>
        {(suite.actions || []).map((a, i) => (
          <div key={i} style={{ display:'flex', gap:10, padding:'4px 0', borderBottom:'1px solid var(--border)', fontSize:12, fontFamily:'var(--mono)' }}>
            <span style={{ color:'var(--txt3)', minWidth:20 }}>{i+1}.</span>
            <span style={{ color:'var(--accent2)', minWidth:60, fontWeight:600 }}>{a.action?.toUpperCase()}</span>
            <span style={{ color:'var(--txt2)' }}>
              {a.url || a.name || a.label || a.text || a.selector || (a.value ? `"${a.value}"` : '') || a.code || ''}
            </span>
          </div>
        ))}
        {!suite.actions?.length && <span style={{ color:'var(--txt3)', fontSize:12 }}>Aucune action.</span>}
      </div>

      {/* History */}
      <SectionTitle>Historique des exécutions</SectionTitle>
      {results.length ? (
        <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:16 }}>
          {results.map(r => (
            <div key={r.id} style={{
              display:'flex', alignItems:'center', gap:10, padding:'10px 14px',
              background:'var(--bg3)', borderRadius:'var(--radius)',
              border:`1px solid ${r.status==='fail' ? 'var(--red-bg)' : 'var(--border)'}`,
            }}>
              <span style={{ fontSize:16 }}>{r.status==='pass'?'✅':r.status==='fail'?'❌':'⏳'}</span>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:12, fontFamily:'var(--mono)', color:'var(--txt2)' }}>{fmtDate(r.startedAt)}</div>
                {r.note && <div style={{ fontSize:12, color:'var(--txt3)', marginTop:2 }}>{r.note}</div>}
                
                {/* Show full error string or output when failed */}
                {r.status === 'fail' && (r.error || r.output) && (
                  <pre style={{ 
                    fontSize:11, color:'var(--red)', marginTop:6, fontFamily:'var(--mono)',
                    background: 'var(--red-bg)', padding: '8px', borderRadius: '4px',
                    whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: '150px', overflowY: 'auto',
                    border: '1px solid rgba(248,113,113,0.3)'
                  }}>
                    {r.error || r.output || "Erreur inconnue"}
                  </pre>
                )}
              </div>
              <span style={{ fontSize:11, color:'var(--txt3)', fontFamily:'var(--mono)' }}>
                {r.duration ? `${r.duration}s` : ''}
              </span>
              <Badge status={r.status} />
              {r.status === 'fail' && (
                <Btn size="sm" variant="primary" onClick={() => markPass(r.id)}>→ Succès</Btn>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p style={{ fontSize:12, color:'var(--txt3)', marginBottom:16 }}>Aucune exécution enregistrée.</p>
      )}

      {/* Script */}
      <SectionTitle>Script Selenium Python</SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <textarea
          style={{
            width: '100%', height: 280, fontFamily: 'var(--mono)', fontSize: 12,
            padding: '12px', background: 'var(--bg)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', color: 'var(--txt)', resize: 'vertical'
          }}
          value={suite.script}
          onChange={e => {
            const val = e.target.value;
            suite.script = val;
            const { updateSuite } = require('../api');
            updateSuite(suite.id, { script: val });
          }}
        />
        <div style={{ fontSize: 11, color: 'var(--txt3)' }}>Modifications sauvegardées automatiquement</div>
      </div>

      <div style={{ display:'flex', gap:8, marginTop:14, justifyContent:'flex-end' }}>
        <Btn onClick={onClose}>Fermer</Btn>
        <Btn variant="primary" onClick={e => { onRun(suite, e); onClose(); }}>▶ Relancer</Btn>
      </div>
    </Modal>
  );
}
