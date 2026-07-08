import React, { useEffect, useState, useCallback } from 'react';
import { getResults, getSuites, patchResult, healSuite, updateSuite, artifactUrl } from '../api';
import { Badge, Btn, SectionTitle, EmptyState, Modal, CodeBlock, Spinner } from '../components';

function ArtifactLinks({ result }) {
  const arts = result.artifacts || [];
  if (!arts.length) return null;
  const shot = arts.find(a => a.endsWith('.png'));
  const trace = arts.find(a => a.endsWith('.zip'));
  return (
    <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12, flexWrap:'wrap' }}>
      {shot && (
        <a href={artifactUrl(result.id, shot)} target="_blank" rel="noreferrer" title="Ouvrir la capture d'écran">
          <img src={artifactUrl(result.id, shot)} alt="capture d'échec"
            style={{ maxHeight:120, borderRadius:6, border:'1px solid var(--border2)', display:'block' }} />
        </a>
      )}
      {trace && (
        <a href={artifactUrl(result.id, trace)} download
          style={{ fontSize:12, color:'var(--accent2)', fontFamily:'var(--mono)' }}
          title="Télécharger puis: npx playwright show-trace trace.zip">
          🎬 Télécharger la trace Playwright ({trace})
        </a>
      )}
    </div>
  );
}

const FILTERS = [
  { key:'all',     label:'Tous'       },
  { key:'pass',    label:'Succès'     },
  { key:'fail',    label:'Échecs'     },
  { key:'pending', label:'En attente' },
  { key:'running', label:'En cours'   },
];

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day:'2-digit', month:'short', year:'numeric' })
    + ' ' + d.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
}

export default function Results() {
  const [results, setResults] = useState([]);
  const [suites,  setSuites]  = useState([]);
  const [filter,  setFilter]  = useState('all');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    try {
      const [r, s] = await Promise.all([getResults(), getSuites()]);
      setResults(r);
      setSuites(s);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // auto-refresh running
  useEffect(() => {
    const hasRunning = results.some(r => r.status === 'running');
    if (!hasRunning) return;
    const t = setTimeout(load, 3000);
    return () => clearTimeout(t);
  }, [results, load]);

  const filtered = filter === 'all' ? results : results.filter(r => r.status === filter);

  const suiteMap = Object.fromEntries(suites.map(s => [s.id, s]));

  const handleMarkPass = async (r, e) => {
    e.stopPropagation();
    await patchResult(r.id, { status: 'pass', note: 'Marqué succès manuellement.' });
    load();
  };

  const counts = {
    all:     results.length,
    pass:    results.filter(r=>r.status==='pass').length,
    fail:    results.filter(r=>r.status==='fail').length,
    pending: results.filter(r=>r.status==='pending').length,
    running: results.filter(r=>r.status==='running').length,
  };

  if (loading) return (
    <div style={{ display:'flex', justifyContent:'center', paddingTop:80 }}>
      <Spinner size={32} />
    </div>
  );

  return (
    <div>
      {/* Filter pills */}
      <div style={{ display:'flex', gap:6, marginBottom:20, flexWrap:'wrap' }}>
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            style={{
              padding:'5px 14px', fontSize:12, borderRadius:100, fontFamily:'var(--sans)',
              fontWeight:600, cursor:'pointer', transition:'all 0.15s',
              background: filter===f.key ? 'var(--accent)' : 'var(--bg3)',
              color:      filter===f.key ? '#fff' : 'var(--txt2)',
              border:     filter===f.key ? '1px solid var(--accent)' : '1px solid var(--border2)',
            }}>
            {f.label}
            <span style={{ marginLeft:6, opacity:0.7 }}>({counts[f.key]})</span>
          </button>
        ))}
      </div>

      {/* Results list */}
      {!filtered.length ? (
        <EmptyState icon="📊" title="Aucun résultat" subtitle="Les résultats d'exécution s'affichent ici." />
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {filtered.map(r => {
            const suite = suiteMap[r.suiteId];
            return (
              <div key={r.id}
                onClick={() => setSelected({ r, suite })}
                style={{
                  display:'flex', alignItems:'center', gap:12,
                  padding:'12px 16px',
                  background:'var(--bg2)', border:`1px solid ${r.status==='fail'?'rgba(248,113,113,0.2)':'var(--border)'}`,
                  borderRadius:'var(--radius)', cursor:'pointer', transition:'border-color 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor='var(--border2)'}
                onMouseLeave={e => e.currentTarget.style.borderColor=r.status==='fail'?'rgba(248,113,113,0.2)':'var(--border)'}
              >
                <span style={{ fontSize:18 }}>
                  {r.status==='pass'?'✅':r.status==='fail'?'❌':r.status==='running'?'🔄':'⏳'}
                </span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:600, marginBottom:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {r.note || r.suiteName || 'Exécution'}
                  </div>
                  <div style={{ fontSize:11, color:'var(--txt3)', fontFamily:'var(--mono)' }}>
                    {r.suiteName} · {fmtDate(r.startedAt)}
                    {r.duration && ` · ${r.duration}s`}
                    {r.attempts > 1 && ` · ${r.attempts} tentatives`}
                    {r.flaky && <span style={{ color:'var(--amber)' }}> · ⚠ flaky</span>}
                    {(r.artifacts || []).length > 0 && <span style={{ color:'var(--accent2)' }}> · 📎 {r.artifacts.length}</span>}
                  </div>
                </div>
                <Badge status={r.status} />
                {r.status === 'fail' && (
                  <Btn size="sm" variant="primary" onClick={e => handleMarkPass(r, e)}>→ Succès</Btn>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Detail modal */}
      {selected && (
        <ResultModal
          result={selected.r}
          suite={selected.suite}
          onClose={() => { setSelected(null); load(); }}
          onReload={load}
          onMarkPass={async () => {
            await patchResult(selected.r.id, { status:'pass', note:'Marqué succès manuellement.' });
            setSelected(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function ResultModal({ result: r, suite, onClose, onMarkPass, onReload }) {
  const [healing, setHealing] = useState(false);
  const [proposed, setProposed] = useState(null);
  const [healErr, setHealErr] = useState('');

  const handleHeal = async () => {
    if (!suite) { setHealErr('Suite introuvable (peut-être supprimée).'); return; }
    setHealing(true); setHealErr(''); setProposed(null);
    try {
      const { proposedScript, error } = await healSuite(suite.id, r.id);
      if (error) setHealErr(error);
      else setProposed(proposedScript);
    } catch (e) {
      setHealErr(e.message);
    } finally {
      setHealing(false);
    }
  };

  const applyProposed = async () => {
    await updateSuite(suite.id, { script: proposed });
    setProposed(null);
    onReload && onReload();
    onClose();
  };

  return (
    <Modal open title={`Résultat — ${r.suiteName}`} onClose={onClose} width={680}>
      <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:16 }}>
        <Badge status={r.status} />
        <span style={{ fontSize:12, color:'var(--txt3)', fontFamily:'var(--mono)' }}>
          Démarré: {fmtDate(r.startedAt)}
          {r.finishedAt && ` · Terminé: ${fmtDate(r.finishedAt)}`}
          {r.duration && ` · Durée: ${r.duration}s`}
          {r.attempts > 1 && ` · ${r.attempts} tentatives`}
          {r.flaky && <span style={{ color:'var(--amber)' }}> · ⚠ flaky</span>}
        </span>
      </div>

      {r.note && (
        <div style={{ background:'var(--bg3)', borderRadius:'var(--radius)', padding:'8px 12px', marginBottom:12, fontSize:12, color:'var(--txt2)' }}>
          {r.note}
        </div>
      )}

      {(r.artifacts || []).length > 0 && (
        <>
          <SectionTitle>Artefacts</SectionTitle>
          <ArtifactLinks result={r} />
        </>
      )}

      {r.output && (
        <>
          <SectionTitle>Sortie pytest</SectionTitle>
          <pre style={{
            background:'var(--bg)', border:'1px solid var(--border)', borderRadius:'var(--radius)',
            padding:12, fontSize:11, fontFamily:'var(--mono)', color:'var(--green)',
            whiteSpace:'pre-wrap', wordBreak:'break-all', maxHeight:200, overflowY:'auto',
            marginBottom:12,
          }}>
            {r.output}
          </pre>
        </>
      )}

      {r.error && (
        <>
          <SectionTitle>Erreurs</SectionTitle>
          <pre style={{
            background:'var(--red-bg)', border:'1px solid rgba(248,113,113,0.3)', borderRadius:'var(--radius)',
            padding:12, fontSize:11, fontFamily:'var(--mono)', color:'var(--red)',
            whiteSpace:'pre-wrap', wordBreak:'break-all', maxHeight:160, overflowY:'auto',
            marginBottom:12,
          }}>
            {r.error}
          </pre>
        </>
      )}

      {suite?.script && (
        <>
          <SectionTitle>Script Playwright utilisé</SectionTitle>
          <CodeBlock code={suite.script} maxHeight={200} />
        </>
      )}

      {healErr && (
        <div style={{ background:'var(--red-bg)', border:'1px solid var(--red)', borderRadius:'var(--radius)', padding:'8px 12px', margin:'12px 0', fontSize:12, color:'var(--red)' }}>
          ⚠ Réparation impossible : {healErr}
        </div>
      )}

      {proposed && (
        <div style={{ marginTop:12, border:'1px solid var(--accent)', borderRadius:'var(--radius)', padding:12 }}>
          <SectionTitle>🩹 Script corrigé proposé par l'IA</SectionTitle>
          <CodeBlock code={proposed} maxHeight={220} />
          <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:10 }}>
            <Btn size="sm" onClick={() => setProposed(null)}>Ignorer</Btn>
            <Btn size="sm" variant="primary" onClick={applyProposed}>Appliquer au test</Btn>
          </div>
        </div>
      )}

      <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:16 }}>
        {r.status === 'fail' && suite && (
          <Btn onClick={handleHeal} disabled={healing}>
            {healing ? <Spinner size={14} /> : '🩹 Réparer avec l\'IA'}
          </Btn>
        )}
        {r.status === 'fail' && (
          <Btn variant="primary" onClick={onMarkPass}>→ Marquer comme Succès</Btn>
        )}
        <Btn onClick={onClose}>Fermer</Btn>
      </div>
    </Modal>
  );
}
