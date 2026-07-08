import React, { useEffect, useState, useCallback } from 'react';
import { getResults, getSuites, patchResult, healSuite, updateSuite, artifactUrl } from '../api';
import {
  Badge, Btn, SectionTitle, EmptyState, Modal, CodeBlock, Spinner,
  Segmented, Table, Row, Cell, SkeletonList,
} from '../components';

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function ArtifactLinks({ result }) {
  const arts = result.artifacts || [];
  if (!arts.length) return null;
  const shot = arts.find(a => a.endsWith('.png'));
  const trace = arts.find(a => a.endsWith('.zip'));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
      {shot && (
        <a href={artifactUrl(result.id, shot)} target="_blank" rel="noreferrer" title="Ouvrir la capture d'écran">
          <img src={artifactUrl(result.id, shot)} alt="capture d'échec"
            style={{ maxHeight: 130, borderRadius: 8, border: '1px solid var(--border2)', display: 'block' }} />
        </a>
      )}
      {trace && (
        <a href={artifactUrl(result.id, trace)} download
          style={{ fontSize: 12, color: 'var(--accent2)', fontFamily: 'var(--mono)' }}
          title="Télécharger puis: npx playwright show-trace trace.zip">
          🎬 Télécharger la trace Playwright ({trace})
        </a>
      )}
    </div>
  );
}

export default function Results() {
  const [results, setResults] = useState([]);
  const [suites, setSuites] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    try {
      const [r, s] = await Promise.all([getResults(), getSuites()]);
      setResults(r);
      setSuites(s);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const hasRunning = results.some(r => r.status === 'running');
    if (!hasRunning) return;
    const t = setTimeout(load, 3000);
    return () => clearTimeout(t);
  }, [results, load]);

  const filtered = filter === 'all' ? results
    : filter === 'flaky' ? results.filter(r => r.flaky)
      : results.filter(r => r.status === filter);

  const suiteMap = Object.fromEntries(suites.map(s => [s.id, s]));

  const handleMarkPass = async (r, e) => {
    e.stopPropagation();
    await patchResult(r.id, { status: 'pass', note: 'Marqué succès manuellement.' });
    load();
  };

  const counts = {
    all: results.length,
    pass: results.filter(r => r.status === 'pass').length,
    fail: results.filter(r => r.status === 'fail').length,
    running: results.filter(r => r.status === 'running').length,
    flaky: results.filter(r => r.flaky).length,
  };

  const FILTERS = [
    { key: 'all', label: 'Tous', count: counts.all },
    { key: 'pass', label: 'Succès', count: counts.pass },
    { key: 'fail', label: 'Échecs', count: counts.fail },
    { key: 'running', label: 'En cours', count: counts.running },
    { key: 'flaky', label: 'Flaky', count: counts.flaky },
  ];

  return (
    <div className="fade-in">
      <div style={{ marginBottom: 20 }}>
        <Segmented options={FILTERS} value={filter} onChange={setFilter} />
      </div>

      {loading ? <SkeletonList rows={5} /> : !filtered.length ? (
        <EmptyState icon="📊" title="Aucun résultat" subtitle="Les exécutions de vos tests apparaîtront ici." />
      ) : (
        <Table columns={[
          { label: 'Statut', width: 120 }, { label: 'Test' }, { label: 'Détails' },
          { label: 'Durée', width: 90 }, { label: '', align: 'right', width: 130 },
        ]}>
          {filtered.map(r => {
            const suite = suiteMap[r.suiteId];
            return (
              <Row key={r.id} onClick={() => setSelected({ r, suite })} danger={r.status === 'fail'}>
                <Cell><Badge status={r.status} /></Cell>
                <Cell>
                  <div style={{ fontSize: 13, fontWeight: 600, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.suiteName || 'Exécution'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--txt3)', fontFamily: 'var(--mono)' }}>{fmtDate(r.startedAt)}</div>
                </Cell>
                <Cell>
                  <span style={{ fontSize: 11.5, color: 'var(--txt3)', fontFamily: 'var(--mono)' }}>
                    {r.attempts > 1 && `${r.attempts} tentatives`}
                    {r.flaky && <span style={{ color: 'var(--amber)' }}> ⚠ flaky</span>}
                    {(r.artifacts || []).length > 0 && <span style={{ color: 'var(--accent2)' }}> 📎 {r.artifacts.length}</span>}
                    {!r.attempts && !r.flaky && !(r.artifacts || []).length && '—'}
                  </span>
                </Cell>
                <Cell><span style={{ fontSize: 12, color: 'var(--txt2)', fontFamily: 'var(--mono)' }}>{r.duration ? `${r.duration}s` : '—'}</span></Cell>
                <Cell align="right">
                  {r.status === 'fail' && (
                    <span onClick={e => e.stopPropagation()}>
                      <Btn size="sm" variant="success" onClick={e => handleMarkPass(r, e)}>→ Succès</Btn>
                    </span>
                  )}
                </Cell>
              </Row>
            );
          })}
        </Table>
      )}

      {selected && (
        <ResultModal
          result={selected.r}
          suite={selected.suite}
          onClose={() => { setSelected(null); load(); }}
          onReload={load}
          onMarkPass={async () => {
            await patchResult(selected.r.id, { status: 'pass', note: 'Marqué succès manuellement.' });
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
    } catch (e) { setHealErr(e.message); }
    finally { setHealing(false); }
  };

  const applyProposed = async () => {
    await updateSuite(suite.id, { script: proposed });
    setProposed(null);
    onReload && onReload();
    onClose();
  };

  return (
    <Modal open title={`Résultat — ${r.suiteName}`} onClose={onClose} width={700}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <Badge status={r.status} />
        <span style={{ fontSize: 12, color: 'var(--txt3)', fontFamily: 'var(--mono)' }}>
          Démarré: {fmtDate(r.startedAt)}
          {r.finishedAt && ` · Terminé: ${fmtDate(r.finishedAt)}`}
          {r.duration && ` · Durée: ${r.duration}s`}
          {r.attempts > 1 && ` · ${r.attempts} tentatives`}
          {r.flaky && <span style={{ color: 'var(--amber)' }}> · ⚠ flaky</span>}
        </span>
      </div>

      {r.note && (
        <div style={{ background: 'var(--bg-elev-2)', borderRadius: 'var(--radius)', padding: '8px 12px', marginBottom: 12, fontSize: 12, color: 'var(--txt2)' }}>{r.note}</div>
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
            background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
            padding: 12, fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--green)',
            whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 200, overflowY: 'auto', marginBottom: 12,
          }}>{r.output}</pre>
        </>
      )}

      {r.error && (
        <>
          <SectionTitle>Erreurs</SectionTitle>
          <pre style={{
            background: 'var(--red-bg)', border: '1px solid color-mix(in srgb, var(--red) 30%, transparent)', borderRadius: 'var(--radius)',
            padding: 12, fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--red)',
            whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 160, overflowY: 'auto', marginBottom: 12,
          }}>{r.error}</pre>
        </>
      )}

      {suite?.script && (
        <>
          <SectionTitle>Script Playwright utilisé</SectionTitle>
          <CodeBlock code={suite.script} maxHeight={200} />
        </>
      )}

      {healErr && (
        <div style={{ background: 'var(--red-bg)', border: '1px solid var(--red)', borderRadius: 'var(--radius)', padding: '8px 12px', margin: '12px 0', fontSize: 12, color: 'var(--red)' }}>
          ⚠ Réparation impossible : {healErr}
        </div>
      )}

      {proposed && (
        <div style={{ marginTop: 12, border: '1px solid var(--accent)', borderRadius: 'var(--radius)', padding: 12 }}>
          <SectionTitle>🩹 Script corrigé proposé par l'IA</SectionTitle>
          <CodeBlock code={proposed} maxHeight={220} />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
            <Btn size="sm" onClick={() => setProposed(null)}>Ignorer</Btn>
            <Btn size="sm" variant="primary" onClick={applyProposed}>Appliquer au test</Btn>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
        {r.status === 'fail' && suite && (
          <Btn onClick={handleHeal} disabled={healing}>{healing ? <Spinner size={14} /> : "🩹 Réparer avec l'IA"}</Btn>
        )}
        {r.status === 'fail' && (
          <Btn variant="success" onClick={onMarkPass}>→ Marquer comme Succès</Btn>
        )}
        <Btn onClick={onClose}>Fermer</Btn>
      </div>
    </Modal>
  );
}
