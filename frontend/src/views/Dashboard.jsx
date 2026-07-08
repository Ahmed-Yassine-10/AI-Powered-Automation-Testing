import React, { useEffect, useState, useCallback } from 'react';
import {
  getProjects, createProject, deleteProject, getProjectReport,
  getSuites, deleteSuite, runSuite, runStatus, getResults, updateSuite,
  runAllSuites, healSuite, artifactUrl, patchResult, refineSuite, runDatasets,
} from '../api';
import {
  Badge, Btn, Card, SectionTitle, EmptyState, Modal, CodeBlock, Spinner,
  StatTile, Table, Row, Cell, Toggle, MiniBars, ProgressBar, SkeletonList, AiVerdict,
} from '../components';

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

/* Construit les tendances pass/fail par jour sur les N derniers jours. */
function buildTrend(results, suiteIds, days = 14) {
  const set = new Set(suiteIds);
  const buckets = {};
  const now = new Date();
  const order = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    buckets[key] = { label: d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }), pass: 0, fail: 0 };
    order.push(key);
  }
  for (const r of results) {
    if (!set.has(r.suiteId)) continue;
    const key = (r.startedAt || '').slice(0, 10);
    if (!buckets[key]) continue;
    if (r.status === 'pass') buckets[key].pass++;
    else if (r.status === 'fail') buckets[key].fail++;
  }
  return order.map(k => buckets[k]);
}

function StatsInline({ stats }) {
  if (!stats || stats.runCount === 0) {
    return <span style={{ fontSize: 11, color: 'var(--txt3)', fontFamily: 'var(--mono)' }}>jamais exécuté</span>;
  }
  const rate = stats.passRate;
  const color = rate == null ? 'var(--txt3)' : rate >= 90 ? 'var(--green)' : rate >= 50 ? 'var(--amber)' : 'var(--red)';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 11, fontFamily: 'var(--mono)' }}>
      {rate != null && <span style={{ color, fontWeight: 700 }}>{rate}%</span>}
      {stats.avgDuration != null && <span style={{ color: 'var(--txt3)' }}>~{stats.avgDuration}s</span>}
      {stats.flaky && <span style={{ color: 'var(--amber)', fontWeight: 700 }}>⚠ flaky</span>}
    </span>
  );
}

function ArtifactLinks({ result }) {
  const arts = result.artifacts || [];
  if (!arts.length) return null;
  const shot = arts.find(a => a.endsWith('.png'));
  const trace = arts.find(a => a.endsWith('.zip'));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
      {shot && (
        <a href={artifactUrl(result.id, shot)} target="_blank" rel="noreferrer" title="Ouvrir la capture d'écran">
          <img src={artifactUrl(result.id, shot)} alt="capture d'échec"
            style={{ height: 64, borderRadius: 6, border: '1px solid var(--border2)', display: 'block' }} />
        </a>
      )}
      {trace && (
        <a href={artifactUrl(result.id, trace)} download
          style={{ fontSize: 11, color: 'var(--accent2)', fontFamily: 'var(--mono)' }}
          title="Télécharger puis: npx playwright show-trace trace.zip">
          🎬 Trace ({trace})
        </a>
      )}
    </div>
  );
}

export default function Dashboard({ onNewSuite }) {
  const [view, setView] = useState('projects');
  const [projects, setProjects] = useState([]);
  const [currentProject, setCurrentProject] = useState(null);

  const [suites, setSuites] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSuite, setSelectedSuite] = useState(null);
  const [runningId, setRunningId] = useState(null);
  const [pollResult, setPollResult] = useState(null);
  const [headless, setHeadless] = useState(false);
  const [batchRunning, setBatchRunning] = useState(false);

  const [showReport, setShowReport] = useState(null);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try { setProjects(await getProjects()); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  const loadSuites = useCallback(async () => {
    if (!currentProject) return;
    setLoading(true);
    try {
      const [s, r] = await Promise.all([getSuites(currentProject.id), getResults()]);
      setSuites(s);
      setResults(r);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
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
    try { setShowReport(await getProjectReport(currentProject.id)); }
    catch (e) { alert('Erreur génération rapport: ' + e.message); }
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
      const result = await runSuite(suite.id, { headless, retries: 1 });
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
        } catch (err) {
          clearInterval(poll);
          setRunningId(null);
        }
      }, 2000);
    } catch (err) {
      setRunningId(null);
      alert('Erreur lors du lancement: ' + err.message);
    }
  };

  const handleRunAll = async () => {
    if (!currentProject) return;
    const runnable = suites.filter(s => s.script);
    if (!runnable.length) { alert('Aucune suite avec un script à exécuter.'); return; }
    if (!window.confirm(`Exécuter les ${runnable.length} suite(s) du projet en mode ${headless ? 'headless' : 'visible'} ?`)) return;
    setBatchRunning(true);
    try {
      const { resultIds } = await runAllSuites(currentProject.id, { headless, retries: 0 });
      const pending = new Set(resultIds);
      const poll = setInterval(async () => {
        try {
          const all = await getResults();
          for (const id of Array.from(pending)) {
            const r = all.find(x => x.id === id);
            if (r && r.status !== 'running') pending.delete(id);
          }
          setResults(all);
          if (pending.size === 0) {
            clearInterval(poll);
            setBatchRunning(false);
            loadSuites();
          }
        } catch (err) {
          clearInterval(poll);
          setBatchRunning(false);
        }
      }, 2500);
    } catch (err) {
      setBatchRunning(false);
      alert('Erreur exécution groupée: ' + err.message);
    }
  };

  const total = suites.length;
  const passed = results.filter(r => r.status === 'pass' && suites.find(s => s.id === r.suiteId)).length;
  const failed = results.filter(r => r.status === 'fail' && suites.find(s => s.id === r.suiteId)).length;
  const totalRuns = passed + failed;
  const passRate = totalRuns ? Math.round(100 * passed / totalRuns) : null;

  const suiteResults = (id) => results.filter(r => r.suiteId === id);
  const lastStatus = (id) => {
    const r = suiteResults(id);
    return r.length ? r[0].status : 'pending';
  };

  /* ── Report view ── */
  if (showReport) return (
    <div className="fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Btn onClick={() => setShowReport(null)}>← Retour</Btn>
        <Btn variant="primary" onClick={() => navigator.clipboard.writeText(showReport)}>📋 Copier le Markdown</Btn>
      </div>
      <Card>
        <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 14, lineHeight: 1.6 }}>{showReport}</pre>
      </Card>
    </div>
  );

  /* ── Projects grid ── */
  if (view === 'projects') return (
    <div className="fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 800 }}>Projets d'automatisation</h2>
          <p style={{ fontSize: 13, color: 'var(--txt3)', marginTop: 2 }}>Regroupez vos cas de test par application ou par équipe.</p>
        </div>
        <Btn variant="primary" onClick={handleCreateProject}>＋ Nouveau projet</Btn>
      </div>

      {loading ? <SkeletonList rows={3} /> : !projects.length ? (
        <EmptyState icon="📁" title="Aucun projet" subtitle="Créez votre premier projet pour commencer à générer des tests."
          action={<Btn variant="primary" onClick={handleCreateProject}>Créer un projet</Btn>} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {projects.map(p => (
            <Card key={p.id} hover style={{ cursor: 'pointer' }} onClick={() => { setCurrentProject(p); setView('suites'); }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 11, background: 'var(--accent-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>📦</div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{p.name}</div>
                </div>
                <Btn size="sm" variant="ghost" onClick={e => handleDelProject(p.id, e)}>✕</Btn>
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--txt2)', marginBottom: 14, minHeight: 18 }}>{p.description || 'Aucune description'}</div>
              <div style={{ fontSize: 11, color: 'var(--txt3)', fontFamily: 'var(--mono)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Créé le {fmtDate(p.createdAt)}</span>
                <span style={{ color: 'var(--accent2)' }}>Ouvrir →</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );

  /* ── Suites view ── */
  const trend = buildTrend(results, suites.map(s => s.id));
  const anyRuns = trend.some(d => d.pass + d.fail > 0);

  return (
    <div className="fade-in">
      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Btn variant="ghost" onClick={() => { setView('projects'); setCurrentProject(null); }}>← Projets</Btn>
          <h2 style={{ fontSize: 19, fontWeight: 800 }}>{currentProject?.name}</h2>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Toggle checked={headless} onChange={setHeadless} label="👻 Headless" title="Exécuter sans fenêtre de navigateur visible" />
          <Btn onClick={handleRunAll} disabled={batchRunning}>{batchRunning ? <Spinner size={14} /> : '▶ Tout exécuter'}</Btn>
          <Btn variant="ghost" onClick={handleGenReport}>📄 Résumé</Btn>
          <Btn variant="primary" onClick={() => window.open(`http://localhost:5000/api/projects/${currentProject.id}/report/pdf`, '_blank')}>📥 Rapport PDF</Btn>
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 16 }}>
        <StatTile label="CAS DE TEST" value={total} icon="🧪" color="var(--accent2)" />
        <StatTile label="SUCCÈS" value={passed} icon="✅" color="var(--green)" />
        <StatTile label="ÉCHECS" value={failed} icon="❌" color="var(--red)" />
        <StatTile label="TAUX DE RÉUSSITE" value={passRate != null ? `${passRate}%` : '—'} icon="📈"
          color={passRate == null ? 'var(--txt)' : passRate >= 90 ? 'var(--green)' : passRate >= 50 ? 'var(--amber)' : 'var(--red)'}>
          {totalRuns > 0 && <div style={{ marginTop: 8 }}><ProgressBar value={passed} total={totalRuns} color="var(--green)" /></div>}
        </StatTile>
      </div>

      {/* Trend (Phase 4.1) */}
      {anyRuns && (
        <Card style={{ marginBottom: 20 }}>
          <SectionTitle>Tendance des exécutions — 14 derniers jours</SectionTitle>
          <MiniBars days={trend} height={72} />
        </Card>
      )}

      {/* Running banners */}
      {pollResult && pollResult.status === 'running' && (
        <Card style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Spinner /><span style={{ fontSize: 13, color: 'var(--txt2)' }}>Exécution en cours pour <strong>{pollResult.suiteName}</strong>…</span>
        </Card>
      )}
      {batchRunning && (
        <Card style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Spinner /><span style={{ fontSize: 13, color: 'var(--txt2)' }}>Exécution groupée en cours… (mode {headless ? 'headless' : 'visible'})</span>
        </Card>
      )}

      {/* Suites table */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <SectionTitle>Cas de test</SectionTitle>
        <Btn variant="primary" size="sm" onClick={() => onNewSuite(currentProject.id)}>＋ Créer un cas de test</Btn>
      </div>

      {loading ? <SkeletonList rows={4} /> : !suites.length ? (
        <EmptyState icon="🧪" title="Aucun test" subtitle="Créez votre premier cas de test pour ce projet."
          action={<Btn variant="primary" onClick={() => onNewSuite(currentProject.id)}>＋ Nouveau test</Btn>} />
      ) : (
        <Table columns={[
          { label: 'Nom' }, { label: 'Fiabilité' }, { label: 'Dernier statut' },
          { label: 'Créé le' }, { label: '', align: 'right', width: 180 },
        ]}>
          {suites.map(s => (
            <Row key={s.id} onClick={() => setSelectedSuite(s)} danger={lastStatus(s.id) === 'fail'}>
              <Cell>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{s.name}</div>
                <div style={{ fontSize: 11, color: 'var(--txt3)', fontFamily: 'var(--mono)', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.url} · {s.actions?.length || 0} actions
                </div>
              </Cell>
              <Cell><StatsInline stats={s.stats} /></Cell>
              <Cell><Badge status={lastStatus(s.id)} /></Cell>
              <Cell><span style={{ fontSize: 11.5, color: 'var(--txt3)', fontFamily: 'var(--mono)' }}>{fmtDate(s.createdAt)}</span></Cell>
              <Cell align="right">
                <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                  {runningId === s.id
                    ? <Spinner size={16} />
                    : <Btn size="sm" onClick={e => handleRunSuite(s, e)}>▶ Relancer</Btn>}
                  <Btn size="sm" variant="ghost" onClick={e => handleDeleteSuite(s.id, e)}>✕</Btn>
                </div>
              </Cell>
            </Row>
          ))}
        </Table>
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
  const [healing, setHealing] = useState(false);
  const [proposed, setProposed] = useState(null);
  const [healErr, setHealErr] = useState('');
  const [refining, setRefining] = useState(false);
  const [varsText, setVarsText] = useState('');
  const [datasetsText, setDatasetsText] = useState('');
  const [dataErr, setDataErr] = useState('');

  React.useEffect(() => {
    if (suite) {
      setVarsText(JSON.stringify(suite.variables || {}, null, 2));
      setDatasetsText(JSON.stringify(suite.datasets || [], null, 2));
      setDataErr(''); setProposed(null); setHealErr('');
    }
  }, [suite]);

  const markPass = async (rid) => {
    await patchResult(rid, { status: 'pass', note: 'Mis à jour manuellement.' });
    onReload();
  };

  const handleHeal = async (rid) => {
    setHealing(true); setHealErr(''); setProposed(null);
    try {
      const { proposedScript, error } = await healSuite(suite.id, rid);
      if (error) setHealErr(error);
      else setProposed(proposedScript);
    } catch (e) { setHealErr(e.message); }
    finally { setHealing(false); }
  };

  const handleRefine = async () => {
    setRefining(true); setHealErr(''); setProposed(null);
    try {
      const { proposedScript, error } = await refineSuite(suite.id, {
        instruction: 'Regenerate only the final assertions so they robustly verify the task; keep the rest of the script identical.',
        script: suite.script,
      });
      if (error) setHealErr(error);
      else setProposed(proposedScript);
    } catch (e) { setHealErr(e.message); }
    finally { setRefining(false); }
  };

  const applyProposed = async (andRun) => {
    await updateSuite(suite.id, { script: proposed });
    suite.script = proposed;
    setProposed(null);
    onReload();
    if (andRun) onRun(suite);
  };

  const saveData = async () => {
    setDataErr('');
    let variables, datasets;
    try { variables = JSON.parse(varsText || '{}'); }
    catch { setDataErr('Variables : JSON invalide.'); return; }
    try { datasets = JSON.parse(datasetsText || '[]'); }
    catch { setDataErr('Jeux de données : JSON invalide.'); return; }
    await updateSuite(suite.id, { variables, datasets });
    suite.variables = variables; suite.datasets = datasets;
    setDataErr('✓ Enregistré');
  };

  const runDs = async () => {
    try {
      await runDatasets(suite.id, { headless: true, retries: 0 });
      onReload();
      onClose();
    } catch (e) { setDataErr(e.message); }
  };

  if (!suite) return null;

  return (
    <Modal open={!!suite} onClose={onClose} title={suite.name} subtitle={suite.url} width={760}>
      <div style={{ fontSize: 13, color: 'var(--txt2)', marginBottom: 18, background: 'var(--bg-elev-2)', padding: '10px 14px', borderRadius: 'var(--radius)' }}>
        🎯 {suite.task}
      </div>

      {/* Actions */}
      <SectionTitle>Actions enregistrées ({suite.actions?.length || 0})</SectionTitle>
      <div style={{ background: 'var(--bg)', borderRadius: 'var(--radius)', padding: '10px 14px', marginBottom: 18, maxHeight: 150, overflowY: 'auto', border: '1px solid var(--border)' }}>
        {(suite.actions || []).map((a, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, padding: '4px 0', borderBottom: '1px solid var(--border)', fontSize: 12, fontFamily: 'var(--mono)' }}>
            <span style={{ color: 'var(--txt3)', minWidth: 20 }}>{i + 1}.</span>
            <span style={{ color: 'var(--accent2)', minWidth: 60, fontWeight: 600 }}>{a.action?.toUpperCase()}</span>
            <span style={{ color: 'var(--txt2)' }}>{a.url || a.name || a.label || a.text || a.selector || (a.value ? `"${a.value}"` : '') || a.code || ''}</span>
          </div>
        ))}
        {!suite.actions?.length && <span style={{ color: 'var(--txt3)', fontSize: 12 }}>Aucune action.</span>}
      </div>

      {/* History */}
      <SectionTitle>Historique des exécutions</SectionTitle>
      {results.length ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
          {results.map(r => (
            <div key={r.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
              background: 'var(--bg-elev-2)', borderRadius: 'var(--radius)',
              border: `1px solid ${r.status === 'fail' ? 'color-mix(in srgb, var(--red) 25%, transparent)' : 'var(--border)'}`,
            }}>
              <span style={{ fontSize: 16 }}>{r.status === 'pass' ? '✅' : r.status === 'fail' ? '❌' : '⏳'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--txt2)' }}>{fmtDate(r.startedAt)}</div>
                {r.note && <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 2 }}>{r.note}</div>}
                {r.status === 'fail' && (r.error || r.output) && (
                  <pre style={{
                    fontSize: 11, color: 'var(--red)', marginTop: 6, fontFamily: 'var(--mono)',
                    background: 'var(--red-bg)', padding: '8px', borderRadius: 4,
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 150, overflowY: 'auto',
                    border: '1px solid color-mix(in srgb, var(--red) 30%, transparent)',
                  }}>{r.error || r.output || 'Erreur inconnue'}</pre>
                )}
                {r.analysis && <div style={{ marginTop: 8 }}><AiVerdict analysis={r.analysis} /></div>}
                <ArtifactLinks result={r} />
              </div>
              <span style={{ fontSize: 11, color: 'var(--txt3)', fontFamily: 'var(--mono)' }}>
                {r.duration ? `${r.duration}s` : ''}
                {r.flaky && <span style={{ color: 'var(--amber)', marginLeft: 6 }}>⚠</span>}
              </span>
              <Badge status={r.status} />
              {r.status === 'fail' && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <Btn size="sm" onClick={() => handleHeal(r.id)} disabled={healing}>{healing ? <Spinner size={12} /> : '🩹 Réparer'}</Btn>
                  <Btn size="sm" variant="success" onClick={() => markPass(r.id)}>→ Succès</Btn>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p style={{ fontSize: 12, color: 'var(--txt3)', marginBottom: 16 }}>Aucune exécution enregistrée.</p>
      )}

      {healErr && (
        <div style={{ background: 'var(--red-bg)', border: '1px solid var(--red)', borderRadius: 'var(--radius)', padding: '8px 12px', marginBottom: 12, fontSize: 12, color: 'var(--red)' }}>
          ⚠ Réparation impossible : {healErr}
        </div>
      )}

      {proposed && (
        <div style={{ marginBottom: 16, border: '1px solid var(--accent)', borderRadius: 'var(--radius)', padding: 12 }}>
          <SectionTitle>🩹 Script corrigé proposé par l'IA</SectionTitle>
          <CodeBlock code={proposed} maxHeight={220} />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
            <Btn size="sm" onClick={() => setProposed(null)}>Ignorer</Btn>
            <Btn size="sm" onClick={() => applyProposed(false)}>Appliquer</Btn>
            <Btn size="sm" variant="primary" onClick={() => applyProposed(true)}>Appliquer &amp; relancer</Btn>
          </div>
        </div>
      )}

      {/* Data-driven (Phase 4.3) */}
      <SectionTitle action={
        <div style={{ display: 'flex', gap: 6 }}>
          <Btn size="sm" onClick={saveData}>💾 Enregistrer</Btn>
          <Btn size="sm" variant="primary" onClick={runDs} title="Exécute une fois par jeu de données">▶ Exécuter les jeux</Btn>
        </div>
      }>Variables &amp; jeux de données</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--txt3)', marginBottom: 4 }}>Variables (JSON) — injectées en <code>VAR_CLE</code></div>
          <textarea value={varsText} onChange={e => setVarsText(e.target.value)} spellCheck={false}
            style={{ width: '100%', height: 110, fontFamily: 'var(--mono)', fontSize: 11.5, padding: 10, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--txt)' }}
            placeholder={'{\n  "USERNAME": "user@test.com",\n  "QTY": "10"\n}'} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--txt3)', marginBottom: 4 }}>Jeux de données (JSON) — un run par entrée</div>
          <textarea value={datasetsText} onChange={e => setDatasetsText(e.target.value)} spellCheck={false}
            style={{ width: '100%', height: 110, fontFamily: 'var(--mono)', fontSize: 11.5, padding: 10, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--txt)' }}
            placeholder={'[\n  { "name": "Valide", "values": { "QTY": "5" } },\n  { "name": "Limite", "values": { "QTY": "9999" } }\n]'} />
        </div>
      </div>
      {dataErr && <div style={{ fontSize: 11.5, color: dataErr.startsWith('✓') ? 'var(--green)' : 'var(--red)', marginBottom: 14 }}>{dataErr}</div>}
      <div style={{ marginBottom: 18 }} />

      {/* Script */}
      <SectionTitle action={
        <Btn size="sm" onClick={handleRefine} disabled={refining} title="Régénère uniquement les assertions finales via l'IA">
          {refining ? <Spinner size={12} /> : '✨ Régénérer les assertions'}
        </Btn>
      }>Script Playwright Python</SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <textarea
          style={{ width: '100%', height: 280, fontFamily: 'var(--mono)', fontSize: 12, padding: 12, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--txt)', resize: 'vertical' }}
          value={suite.script}
          onChange={e => { const val = e.target.value; suite.script = val; updateSuite(suite.id, { script: val }); }}
        />
        <div style={{ fontSize: 11, color: 'var(--txt3)' }}>Modifications sauvegardées automatiquement</div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
        <Btn onClick={onClose}>Fermer</Btn>
        <Btn variant="primary" onClick={e => { onRun(suite, e); onClose(); }}>▶ Relancer</Btn>
      </div>
    </Modal>
  );
}
