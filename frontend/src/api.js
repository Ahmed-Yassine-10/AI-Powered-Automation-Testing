import axios from 'axios';

const BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

// ── Axios instance avec gestion d'erreur CORS ────────────────────────────────
const api = axios.create({
  baseURL: BASE,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// ── Stockage local (fallback si backend indisponible) ────────────────────────
const LOCAL_KEY = 'st_suites';
const LOCAL_RES = 'st_results';
const LOCAL_PROJ = 'st_projects';

function lsGet(key, def) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') || def; } catch { return def; }
}
function lsSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

// ── Détection backend ─────────────────────────────────────────────────────────
let _backendOk = null;
async function backendAvailable() {
  if (_backendOk !== null) return _backendOk;
  try {
    await axios.get(`${BASE}/health`, { timeout: 2000 });
    _backendOk = true;
  } catch {
    _backendOk = false;
    console.warn('[API] Backend non disponible — mode localStorage activé');
  }
  return _backendOk;
}

// ── Projects ──────────────────────────────────────────────────────────────────
export async function getProjects() {
  if (await backendAvailable()) {
    return api.get('/projects').then(r => r.data);
  }
  return lsGet(LOCAL_PROJ, []);
}

export async function createProject(data) {
  if (await backendAvailable()) {
    return api.post('/projects', data).then(r => r.data);
  }
  const proj = { ...data, id: Date.now().toString(), createdAt: new Date().toISOString() };
  const projs = lsGet(LOCAL_PROJ, []);
  projs.unshift(proj);
  lsSet(LOCAL_PROJ, projs);
  return proj;
}

export async function deleteProject(id) {
  if (await backendAvailable()) {
    return api.delete(`/projects/${id}`).then(r => r.data);
  }
  lsSet(LOCAL_PROJ, lsGet(LOCAL_PROJ, []).filter(p => p.id !== id));
  lsSet(LOCAL_KEY, lsGet(LOCAL_KEY, []).filter(s => s.projectId !== id));
  return { ok: true };
}

export async function getProjectReport(id) {
  if (await backendAvailable()) {
    return api.get(`/projects/${id}/report`).then(r => r.data.report);
  }
  return "Mode local : la génération de rapport nécessite le backend.";
}

// ── Playwright Record ────────────────────────────────────────────────────────
export async function recordPlaywright(url) {
  if (await backendAvailable()) {
    // Le timeout est mis à 0 (infini) car l'utilisateur peut passer plusieurs minutes à enregistrer
    return api.post('/record', { url }, { timeout: 0 }).then(r => r.data);
  }
  throw new Error("L'enregistrement nécessite le backend.");
}

// ── Suites (backend avec fallback localStorage) ───────────────────────────────
export async function getSuites(projectId) {
  if (await backendAvailable()) {
    const p = projectId ? `?projectId=${projectId}` : '';
    return api.get(`/suites${p}`).then(r => r.data);
  }
  let suites = lsGet(LOCAL_KEY, []);
  if (projectId) suites = suites.filter(s => s.projectId === projectId);
  return suites;
}

export async function getSuite(id) {
  if (await backendAvailable()) {
    return api.get(`/suites/${id}`).then(r => r.data);
  }
  return lsGet(LOCAL_KEY, []).find(s => s.id === id) || null;
}

export async function createSuite(data) {
  if (await backendAvailable()) {
    return api.post('/suites', data).then(r => r.data);
  }
  const suite = { ...data, id: Date.now().toString(), createdAt: new Date().toISOString() };
  const suites = lsGet(LOCAL_KEY, []);
  suites.unshift(suite);
  lsSet(LOCAL_KEY, suites);
  return suite;
}

export async function deleteSuite(id) {
  if (await backendAvailable()) {
    return api.delete(`/suites/${id}`).then(r => r.data);
  }
  lsSet(LOCAL_KEY, lsGet(LOCAL_KEY, []).filter(s => s.id !== id));
  lsSet(LOCAL_RES, lsGet(LOCAL_RES, []).filter(r => r.suiteId !== id));
  return { ok: true };
}

export async function updateSuite(id, data) {
  if (await backendAvailable()) {
    return api.put(`/suites/${id}`, data).then(r => r.data);
  }
  const suites = lsGet(LOCAL_KEY, []);
  const i = suites.findIndex(s => s.id === id);
  if (i >= 0) { suites[i] = { ...suites[i], ...data }; lsSet(LOCAL_KEY, suites); return suites[i]; }
  return null;
}

// ── Parse Playwright — 100% côté frontend, aucun appel réseau ────────────────
export function parsePlaywright(code) {
  const actions = [];
  for (const rawLine of code.split('\n')) {
    const line = rawLine.trim();
    let m;

    if ((m = line.match(/page\.goto\(['"]([^'"]+)['"]\)/)))
      { actions.push({ action:'goto', url:m[1], source: line }); continue; }

    // Playwright JS style: getByRole/getByLabel/getByText/getByPlaceholder
    if ((m = line.match(/getByRole\(['"]([^'"]+)['"],\s*\{\s*name:\s*['"]([^'"]+)['"][^}]*\}\)\.fill\(['"]([^'"]*)['"]\)/)))
      { actions.push({ action:'fill', strategy:'role', role:m[1], name:m[2], value:m[3], selector:`getByRole('${m[1]}', { name: '${m[2]}' })`, source: line }); continue; }

    if ((m = line.match(/getByRole\(['"]([^'"]+)['"],\s*\{\s*name:\s*['"]([^'"]+)['"][^}]*\}\)\.click\(\)/)))
      { actions.push({ action:'click', strategy:'role', role:m[1], name:m[2], selector:`getByRole('${m[1]}', { name: '${m[2]}' })`, source: line }); continue; }

    if ((m = line.match(/getByLabel\(['"]([^'"]+)['"](?:,\s*\{[^}]*\})?\)\.fill\(['"]([^'"]*)['"]\)/)))
      { actions.push({ action:'fill', strategy:'label', label:m[1], value:m[2], selector:`getByLabel('${m[1]}')`, source: line }); continue; }

    if ((m = line.match(/getByLabel\(['"]([^'"]+)['"](?:,\s*\{[^}]*\})?\)\.click\(\)/)))
      { actions.push({ action:'click', strategy:'label', label:m[1], selector:`getByLabel('${m[1]}')`, source: line }); continue; }

    if ((m = line.match(/getByPlaceholder\(['"]([^'"]+)['"]\)\.fill\(['"]([^'"]*)['"]\)/)))
      { actions.push({ action:'fill', strategy:'placeholder', placeholder:m[1], value:m[2], selector:`getByPlaceholder('${m[1]}')`, source: line }); continue; }

    if ((m = line.match(/getByText\(['"]([^'"]+)['"]\)\.click\(\)/)))
      { actions.push({ action:'click', strategy:'text', text:m[1], selector:`getByText('${m[1]}')`, source: line }); continue; }

    if ((m = line.match(/get_by_role\(['"]([^'"]+)['"],\s*name=['"]([^'"]+)['"]\)\.fill\(['"]([^'"]*)['"]\)/)))
      { actions.push({ action:'fill', strategy:'role', role:m[1], name:m[2], value:m[3], selector:`get_by_role('${m[1]}', name='${m[2]}')`, source: line }); continue; }

    if ((m = line.match(/get_by_role\(['"]([^'"]+)['"],\s*name=['"]([^'"]+)['"]\)\.click\(\)/)))
      { actions.push({ action:'click', strategy:'role', role:m[1], name:m[2], selector:`get_by_role('${m[1]}', name='${m[2]}')`, source: line }); continue; }

    if ((m = line.match(/get_by_label\(['"]([^'"]+)['"]\)\.fill\(['"]([^'"]*)['"]\)/)))
      { actions.push({ action:'fill', strategy:'label', label:m[1], value:m[2], selector:`get_by_label('${m[1]}')`, source: line }); continue; }

    if ((m = line.match(/get_by_label\(['"]([^'"]+)['"]\)\.click\(\)/)))
      { actions.push({ action:'click', strategy:'label', label:m[1], selector:`get_by_label('${m[1]}')`, source: line }); continue; }

    if ((m = line.match(/get_by_placeholder\(['"]([^'"]+)['"]\)\.fill\(['"]([^'"]*)['"]\)/)))
      { actions.push({ action:'fill', strategy:'placeholder', placeholder:m[1], value:m[2], selector:`get_by_placeholder('${m[1]}')`, source: line }); continue; }

    if ((m = line.match(/get_by_text\(['"]([^'"]+)['"]\)\.click\(\)/)))
      { actions.push({ action:'click', strategy:'text', text:m[1], selector:`get_by_text('${m[1]}')`, source: line }); continue; }

    if ((m = line.match(/locator\(['"]([^'"]+)['"]\)\.click\(\)/)))
      { actions.push({ action:'click', strategy:'css', selector:m[1], source: line }); continue; }

    if ((m = line.match(/locator\(['"]([^'"]+)['"]\)\.fill\(['"]([^'"]*)['"]\)/)))
      { actions.push({ action:'fill', strategy:'css', selector:m[1], value:m[2], source: line }); continue; }

    if ((m = line.match(/get_by_role\(['"]([^'"]+)['"],\s*name=['"]([^'"]+)['"]\)\.press\(['"]([^'"]+)['"]\)/)))
      { actions.push({ action:'press', strategy:'role', role:m[1], name:m[2], key:m[3], selector:`get_by_role('${m[1]}', name='${m[2]}')`, source: line }); continue; }

    if ((m = line.match(/page\.press\(['"]([^'"]+)['"],\s*['"]([^'"]+)['"]\)/)))
      { actions.push({ action:'press', selector:m[1], key:m[2], source: line }); continue; }

    if ((m = line.match(/page\.select_option\(['"]([^'"]+)['"],\s*['"]([^'"]+)['"]\)/)))
      { actions.push({ action:'select', selector:m[1], value:m[2], source: line }); continue; }

    // Preserve complex Playwright chains (filter/hasText/nth/etc) for LLM translation
    if (line.includes('page.') || line.includes('await page.')) {
      actions.push({ action:'raw', code: line });
      continue;
    }
  }
  return { actions: actions.filter(a => Object.keys(a).length >= 1) };
}

// ── Build backend prompt payload ──────────────────────────────────────────────
function buildPrompt(name, url, task, actions, extraSelectors) {
  const className = name.replace(/\W+/g, ' ').trim().split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');

  const steps = actions.map((a, i) => {
    const n = i + 1;
    if (a.action === 'goto')   return `Step ${n}: NAVIGATE TO ${a.url}`;
    if (a.action === 'click')  return `Step ${n}: CLICK — strategy=${a.strategy}, target="${a.name || a.label || a.text || a.selector || ''}"`;
    if (a.action === 'fill')   return `Step ${n}: TYPE "${a.value}" → target="${a.name || a.label || a.placeholder || a.selector || ''}" strategy=${a.strategy}`;
    if (a.action === 'press')  return `Step ${n}: PRESS key="${a.key}" on "${a.name || a.selector || ''}"`;
    if (a.action === 'select') return `Step ${n}: SELECT "${a.value}" in "${a.selector}"`;
    return `Step ${n}: ${JSON.stringify(a)}`;
  }).join('\n');

  return `You are an expert QA automation engineer.

TASK: ${task}
START URL: ${url}
TEST CLASS NAME: Test${className}

ACTION SEQUENCE:
${steps}
${extraSelectors ? '\nEXTRA SELECTORS:\n' + extraSelectors : ''}

Generate a complete, runnable Selenium Python unittest script. STRICT RULES:
- Use WebDriverWait(driver, 10) with EC for every interaction
- No time.sleep(), no webdriver-manager, no comments inside test methods
- Selector priority: By.ID > By.CSS_SELECTOR([name]) > By.XPATH > By.CSS_SELECTOR(class)
- Buttons/links: wait.until(EC.element_to_be_clickable(...)).click()
- Inputs: el = wait.until(EC.presence_of_element_located(...)); el.clear(); el.send_keys(...)
- If click blocked by overlay: driver.execute_script("arguments[0].click();", el)
- Generate EXACTLY 2 test methods:
    * test_happy_path — normal successful flow
    * test_edge_case  — invalid input or boundary condition
- Include proper setUp() with webdriver.Chrome() and tearDown() with driver.quit()
- Output ONLY the Python code, no markdown fences, no explanations`;
}

// ── Generate via backend (Gemini/Groq abstraction côté serveur) ──────────────
export async function generateScriptStream({ name, url, task, actions, extraSelectors = '' }) {
  if (!(await backendAvailable())) {
    throw new Error(`Backend indisponible (${BASE}). Lancez le backend Flask sur le port 5000.`);
  }

  const payload = { name, url, task, actions, extraSelectors };

  let response;
  try {
    response = await fetch(`${BASE}/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    throw new Error(`Connexion backend impossible (${BASE}/generate). Vérifiez que le serveur Flask tourne.`);
  }

  return response; // SSE stream
}

// ── Run suite (backend requis) ────────────────────────────────────────────────
export async function runSuite(id) {
  if (!(await backendAvailable())) {
    throw new Error('Backend Flask requis pour exécuter les tests. Lancez : cd backend && python app.py');
  }
  return api.post(`/suites/${id}/run`).then(r => r.data);
}

export async function runStatus(sid, rid) {
  return api.get(`/suites/${sid}/run/status/${rid}`).then(r => r.data);
}

// ── Results ───────────────────────────────────────────────────────────────────
export async function getResults(params) {
  if (await backendAvailable()) {
    return api.get('/results', { params }).then(r => r.data);
  }
  let res = lsGet(LOCAL_RES, []);
  if (params?.suiteId) res = res.filter(r => r.suiteId === params.suiteId);
  return res;
}

export async function patchResult(id, data) {
  if (await backendAvailable()) {
    return api.patch(`/results/${id}`, data).then(r => r.data);
  }
  const results = lsGet(LOCAL_RES, []);
  const i = results.findIndex(r => r.id === id);
  if (i >= 0) { results[i] = { ...results[i], ...data }; lsSet(LOCAL_RES, results); return results[i]; }
  return null;
}