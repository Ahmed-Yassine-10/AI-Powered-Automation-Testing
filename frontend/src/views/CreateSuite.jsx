import React, { useState } from 'react';
import { parsePlaywright, generateScriptStream, createSuite, recordPlaywright, validateScript } from '../api';
import { Btn, Card, Field, StepBar, CodeBlock, SectionTitle, Spinner } from '../components';

const STEPS = 4;

export default function CreateSuite({ projectId, onSaved, onCancel }) {
  const [step, setStep]         = useState(1);
  const [name, setName]         = useState('');
  const [url, setUrl]           = useState('');
  const [task, setTask]         = useState('');
  const [pwCode, setPwCode]     = useState('');
  const [actions, setActions]   = useState([]);
  const [extraSel, setExtraSel] = useState('');
  const [script, setScript]     = useState('');
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError]       = useState('');

  /* ── Step 1 → 2 ── */
  const goStep2 = () => {
    if (!name.trim() || !url.trim() || !task.trim()) {
      setError('Remplissez tous les champs obligatoires.');
      return;
    }
    setError('');
    setStep(2);
  };

  /* ── Step 2 → Record ── */
  const doRecord = async () => {
    setError('');
    setRecording(true);
    try {
      const res = await recordPlaywright(url);
      setPwCode(res.code);
    } catch(e) {
      setError("Erreur d'enregistrement : " + e.message);
    } finally {
      setRecording(false);
    }
  };

  /* ── Step 2 → 3 : parse ── */
  const goStep3 = async () => {
    if (!pwCode.trim()) { setError('Collez le script Playwright Codegen.'); return; }
    setError('');
    try {
      const res = await parsePlaywright(pwCode);
      if (!res.actions.length) {
        setError('Aucune action détectée. Vérifiez le format du script.');
        return;
      }
      setActions(res.actions);
      setStep(3);
    } catch(e) {
      setError('Erreur de parsing: ' + e.message);
    }
  };

  /* ── Step 3 → 4 : generate ── */
  const goStep4 = async () => {
    setStep(4);
    setGenerating(true);
    setScript('');
    setError('');

    try {
      const resp = await generateScriptStream({ name, url, task, actions, extraSelectors: extraSel });
      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(txt);
      }
      const reader  = resp.body.getReader();
      const decoder = new TextDecoder();
      let full = '';
      let streamError = '';
      let sseBuffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          // Flush any remaining partial SSE line when stream closes.
          const tail = sseBuffer.trim();
          if (tail.startsWith('data: ')) {
            const payload = tail.slice(6).trim();
            if (payload && payload !== '[DONE]') {
              try {
                const parsed = JSON.parse(payload);
                if (parsed?.error) {
                  const errMsg = typeof parsed.error === 'string' ? parsed.error : (parsed.error.message || JSON.stringify(parsed.error));
                  streamError = errMsg;
                  setError(errMsg);
                } else {
                  const delta = parsed.choices?.[0]?.delta?.content
                    || parsed.choices?.[0]?.message?.content
                    || '';
                  if (delta) {
                    full += delta;
                    setScript(full);
                  }
                }
              } catch (_) {}
            }
          }
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        sseBuffer += chunk;

        const lines = sseBuffer.split('\n');
        sseBuffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') break;
          try {
            const parsed = JSON.parse(payload);
            if (parsed?.error) {
              const errMsg = typeof parsed.error === 'string' ? parsed.error : (parsed.error.message || JSON.stringify(parsed.error));
              streamError = errMsg;
              setError(errMsg);
              continue;
            }
            const delta  = parsed.choices?.[0]?.delta?.content
              || parsed.choices?.[0]?.message?.content
              || '';
            full += delta;
            setScript(full);
          } catch(_) {}
        }
      }

      if (!full.trim() && !streamError) {
        setError('La génération n\'a renvoyé aucun contenu. Vérifiez OPENROUTER_API_KEY côté backend.');
      }
    } catch(e) {
      setError('Erreur API OpenRouter: ' + e.message);
    } finally {
      setGenerating(false);
    }
  };

  /* ── Save suite ── */
  const handleSave = async () => {
    if (!script) { setError('Aucun script généré.'); return; }
    setSaving(true);
    try {
      const check = await validateScript(script);
      if (!check.valid) {
        setError('Erreur de syntaxe dans le script : ' + check.error + ' — corrigez ou régénérez avant d\'enregistrer.');
        setSaving(false);
        return;
      }
      await createSuite({ projectId, name, url, task, playwrightCode: pwCode, actions, script });
      onSaved();
    } catch(e) {
      setError('Erreur de sauvegarde: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const actionTypeColor = { goto:'var(--amber)', click:'var(--green)', fill:'var(--accent2)', raw:'var(--txt3)' };

  return (
    <div style={{ maxWidth:760, margin:'0 auto' }}>
      <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:18 }}>
        <Btn onClick={onCancel} variant="ghost" size="sm">✕ Annuler</Btn>
      </div>

      <StepBar current={step} total={STEPS} labels={['Configuration', 'Enregistrement', 'Actions', 'Génération']} />

      {error && (
        <div style={{
          background:'var(--red-bg)', border:'1px solid var(--red)',
          borderRadius:'var(--radius)', padding:'10px 14px',
          fontSize:12, color:'var(--red)', marginBottom:14,
        }}>
          ⚠ {error}
        </div>
      )}

      {/* ──── STEP 1 : Config ──── */}
      {step === 1 && (
        <Card>
          <SectionTitle>1. Configuration du test</SectionTitle>
          <Field label="Nom du cas de test *">
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="ex: Login Test, Cart Checkout, Search Product…" />
          </Field>
          <Field label="URL du site à tester *">
            <input value={url} onChange={e => setUrl(e.target.value)}
              placeholder="https://example.com" type="url" />
          </Field>
          <Field label="Description de la tâche *"
            hint="Décrivez ce que le test doit vérifier.">
            <input value={task} onChange={e => setTask(e.target.value)}
              placeholder="ex: Vérifier le login avec identifiants valides et invalides" />
          </Field>
          <div style={{ display:'flex', justifyContent:'flex-end', marginTop:8 }}>
            <Btn variant="primary" onClick={goStep2}>Suivant →</Btn>
          </div>
        </Card>
      )}

      {/* ──── STEP 2 : Playwright code ──── */}
      {step === 2 && (
        <Card>
          <SectionTitle>2. Enregistrement des actions</SectionTitle>
          <div style={{ display:'flex', flexDirection:'column', gap:14, marginBottom:20 }}>
            {recording ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', background: 'var(--amber-bg)', width: '100%', borderRadius: 'var(--radius)', border: '1px solid var(--amber)' }}>
                <Spinner />
                <div style={{ marginTop: 12, fontWeight: 600, color: 'var(--amber)' }}>
                  Navigateur Playwright ouvert !
                </div>
                <div style={{ fontSize: 13, color: 'var(--txt2)' }}>
                  Effectuez vos actions sur <b>{url}</b> puis fermez le navigateur pour récupérer le script automatiquement.
                </div>
              </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <Btn variant="primary" style={{ padding: '16px', fontSize: 16, justifyContent: 'center' }} onClick={doRecord}>
                    🔴 Lancer l'Enregistrement Playwright
                  </Btn>
                  <p style={{ fontSize: 12, color: 'var(--txt3)', textAlign: 'center' }}>
                    Le navigateur s'ouvrira, naviguez pour enregistrer les actions, puis fermez-le.
                  </p>
                </div>
            )}
          </div>

          <Field label="Code Playwright récupéré" hint="Vous pouvez également coller ou modifier manuellement un script codegen existant.">
            <textarea
              style={{
                width:'100%', height:200, fontFamily:'var(--mono)', fontSize:12,
                padding:'12px', background:'var(--bg)', border:'1px solid var(--border)',
                borderRadius:'var(--radius)', color:'var(--txt)', resize:'vertical',
                opacity: recording ? 0.5 : 1
              }}
              placeholder={`page.goto('https://example.com/login')
page.get_by_role('textbox', name='Email').fill('user@example.com')
page.get_by_role('button', name='Se connecter').click()`}
              value={pwCode}
              onChange={e => setPwCode(e.target.value)}
              disabled={recording}
            />
          </Field>

          <div style={{ display:'flex', justifyContent:'space-between', marginTop:8 }}>
            <Btn onClick={() => setStep(1)}>← Retour</Btn>
            <Btn variant="primary" onClick={goStep3} disabled={recording}>Analyser les actions →</Btn>
          </div>
        </Card>
      )}

      {/* ──── STEP 3 : Actions ──── */}
      {step === 3 && (
        <Card>
          <SectionTitle>3. Actions détectées ({actions.length})</SectionTitle>
          <div style={{
            background:'var(--bg)', borderRadius:'var(--radius)',
            border:'1px solid var(--border)', marginBottom:16,
            maxHeight:220, overflowY:'auto',
          }}>
            {actions.map((a, i) => {
              const detail = a.url || a.name || a.label || a.text || a.selector || (a.value ? `"${a.value}"` : '') || a.code || '';
              const selectorPreview = a.selector || a.source || '';
              return (
                <div key={i} style={{
                  display:'flex', gap:10, padding:'7px 12px',
                  borderBottom:'1px solid var(--border)', fontSize:12,
                  fontFamily:'var(--mono)',
                }}>
                  <span style={{ color:'var(--txt3)', minWidth:22 }}>{i+1}.</span>
                  <span style={{ color: actionTypeColor[a.action] || 'var(--txt2)', minWidth:56, fontWeight:600 }}>
                    {a.action?.toUpperCase()}
                  </span>
                  <div style={{ minWidth:0, flex:1 }}>
                    <div style={{ color:'var(--txt2)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {detail}
                    </div>
                    {selectorPreview && (
                      <div style={{ color:'var(--txt3)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginTop:2 }}>
                        selector: {selectorPreview}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <Field label="Sélecteurs additionnels (JSON — optionnel)"
            hint='Exemple: {"loginBtn": "By.ID, \"submit\""}'>
            <textarea
              value={extraSel}
              onChange={e => setExtraSel(e.target.value)}
              rows={3}
              placeholder='{"loginBtn": "By.ID, \"submit\"", "emailInput": "By.NAME, \"email\""}'
            />
          </Field>

          <div style={{ display:'flex', justifyContent:'space-between', marginTop:8 }}>
            <Btn onClick={() => setStep(2)}>← Retour</Btn>
            <Btn variant="primary" onClick={goStep4}>⚡ Générer le script Playwright →</Btn>
          </div>
        </Card>
      )}

      {/* ──── STEP 4 : Generated script ──── */}
      {step === 4 && (
        <Card>
          <SectionTitle>4. Script Playwright Python généré</SectionTitle>

          {generating && (
            <div style={{
              display:'flex', alignItems:'center', gap:10, padding:'10px 14px',
              background:'var(--accent-bg)', borderRadius:'var(--radius)', marginBottom:12,
              fontSize:12, color:'var(--accent2)',
            }}>
              <Spinner size={16} />
              <span>Génération via OpenRouter API… streaming en cours</span>
            </div>
          )}

          {generating ? (
            <CodeBlock code={script || '// Génération en cours…'} maxHeight={380} />
          ) : (
            <textarea
              style={{
                width: '100%', height: 380, fontFamily: 'var(--mono)', fontSize: 12,
                padding: '12px', background: 'var(--bg)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', color: 'var(--txt)', resize: 'vertical'
              }}
              value={script}
              onChange={e => setScript(e.target.value)}
              placeholder="// Le script généré s'affichera ici, vous pouvez l'éditer..."
            />
          )}

          <div style={{ display:'flex', gap:8, justifyContent:'space-between', marginTop:14 }}>
            <Btn onClick={() => setStep(3)}>← Modifier</Btn>
            <div style={{ display:'flex', gap:8 }}>
              <Btn onClick={() => navigator.clipboard.writeText(script)}>📋 Copier</Btn>
              <Btn variant="primary" disabled={!script || saving} onClick={handleSave}>
                {saving ? <Spinner size={14} /> : '💾 Enregistrer la suite'}
              </Btn>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
