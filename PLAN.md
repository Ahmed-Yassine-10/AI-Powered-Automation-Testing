# 🗺️ Plan d'implémentation — Selenium Test Studio (Medusa)

> Guide de travail pour corriger, fiabiliser et faire évoluer l'application.
> Chaque tâche indique : les fichiers à toucher, les étapes concrètes et un critère
> d'acceptation ("✅ Terminé quand…"). Cocher les cases au fur et à mesure.

**Ordre recommandé : Phase 1 → 2 → 3 → 4.** Les phases 1 et 2 ne changent pas le
comportement visible ; les phases 3 et 4 apportent les nouvelles fonctionnalités.

## 📌 Avancement

- ✅ **Phase 1 — Sécurité & hygiène** : implémentée et poussée (commit « Phase 1 »).
- ✅ **Phase 2 — Robustesse** : backend + frontend implémentés et poussés (commit « Phase 2 »).
- ✅ **Phase 3 — Fonctionnalités différenciantes** (3.1 → 3.4) : implémentées et poussées (commit « Phase 3 »).
- ✅ **Refonte UI professionnelle** (sidebar, design system, tables, tendances 4.1) : poussée.
- ✅ **Verdict IA visuelle** : capture de l'état final + LLM multimodal qui juge la réussite
  *fonctionnelle* de la tâche cible (au-delà du pass/fail pytest), détecte les tests non
  concluants et décrit le problème. Auto après run + endpoint `/api/results/:id/analyze`.
- ✅ **Phase 4 — Backlog produit** : implémentée et poussée.
  - 4.1 Tendances dashboard ✅ · 4.2 Régénération assistée ✅ · 4.3 Variables & jeux de données ✅
  - 4.4 Intégration CI (endpoint `ci-run` + webhook token + exemple GitHub Actions) ✅
  - 4.5 Migration SQLite (`store.py`, migration auto des JSON) ✅ · 4.6 Harmonisation du nom (Medusa) ✅

> ⚠️ Action manuelle restante (hors code) : **révoquer** les anciennes clés OpenRouter
> et Groq sur les consoles respectives — elles restent dans l'historique Git.

---

## 📋 État des lieux (rappel du diagnostic)

| Problème | Gravité | Localisation |
|---|---|---|
| Clés API réelles commitées dans Git | 🔴 Critique | `backend/app.py:29`, `backend/.env.example` |
| Rapport Markdown compte toujours 0 ✅ / 0 ❌ | 🟠 Bug | `backend/app.py:353-354` |
| `requirements.txt` incomplet (`playwright`, `reportlab` absents) | 🟠 Bug | `backend/requirements.txt` |
| README décrit Gemini/Selenium, le code fait OpenRouter/Playwright | 🟠 Doc | `README.md` |
| Fichiers de debug + build + dossier `{frontend` commités, pas de `.gitignore` | 🟡 Hygiène | racine |
| Écritures JSON concurrentes sans verrou | 🟡 Robustesse | `backend/app.py` |
| `headless=False` forcé dans les scripts générés | 🟡 Limitation | `backend/app.py:273` |
| `/api/record` bloque une requête HTTP plusieurs minutes | 🟡 Robustesse | `backend/app.py:38-70` |
| Code mort (`buildPrompt` frontend, route `/api/parse`) | 🟡 Hygiène | `frontend/src/api.js:202-238` |
| Voyant "Backend :5000" toujours vert | 🟡 UX | `frontend/src/App.jsx:72-75` |

---

# Phase 1 — Sécurité & hygiène (≈ ½ à 1 journée)

*Objectif : dépôt propre et sûr. Aucun changement de comportement.*

## 1.1 — Révoquer et externaliser les clés API 🔴

**Fichiers :** `backend/app.py`, `backend/.env.example`, `backend/requirements.txt`

- [ ] **Révoquer** la clé OpenRouter sur <https://openrouter.ai/keys> et la clé Groq
      sur <https://console.groq.com/keys> (elles sont dans l'historique Git → compromises).
- [ ] Recréer une clé OpenRouter neuve, la mettre dans `backend/.env` (nouveau fichier, **jamais commité**).
- [ ] Ajouter `python-dotenv` à `requirements.txt` et charger le `.env` au démarrage :

```python
# app.py — en tête de fichier
from dotenv import load_dotenv
load_dotenv()

OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")  # plus AUCUNE valeur par défaut
```

- [ ] Remplacer le contenu de `.env.example` par des placeholders uniquement :

```env
OPENROUTER_API_KEY=sk-or-v1-VOTRE_CLE_ICI
OPENROUTER_MODEL=meta-llama/llama-3.3-70b-instruct
FLASK_DEBUG=true
FLASK_PORT=5000
```

- [ ] Vérifier que `/api/generate` renvoie déjà une erreur SSE propre si la clé est vide
      (c'est le cas ligne 527-530 — garder ce comportement).

**✅ Terminé quand :** `grep -r "sk-or-v1\|gsk_" backend/ --include="*.py" --include="*.example"`
ne retourne plus rien, et la génération fonctionne avec la clé dans `.env`.

## 1.2 — `.gitignore` + nettoyage du dépôt

**Fichiers :** `.gitignore` (nouveau), suppression de fichiers

- [ ] Créer `.gitignore` à la racine :

```gitignore
# Dépendances & builds
node_modules/
frontend/build/

# Secrets & environnement
.env
*.env.local

# Données runtime (l'app les recrée)
backend/data/

# Python
__pycache__/
*.pyc
.pytest_cache/

# Debug / dumps
*.txt
!frontend/build/static/js/*.LICENSE.txt
api_response*.txt
raw_output.txt
response.txt
decoded_response.txt

# Artefacts de test (Phase 3)
backend/artifacts/
```

- [ ] Supprimer du disque ET de l'index Git : `api_response.txt`, `api_response_role.txt`,
      `raw_output.txt`, `response.txt`, `decoded_response.txt`, le dossier `{frontend`.

```bash
git rm --cached -r frontend/build backend/data
git rm api_response.txt api_response_role.txt raw_output.txt response.txt decoded_response.txt
rm -rf "{frontend"
```

- [ ] Garder un `backend/data/.gitkeep` si on veut versionner le dossier vide (optionnel —
      `DATA_DIR.mkdir(exist_ok=True)` le recrée de toute façon).

**✅ Terminé quand :** `git status` est propre après un `npm run build` + un run de test.

## 1.3 — Corriger le comptage du rapport Markdown

**Fichier :** `backend/app.py` (fonction `get_project_report`, lignes ~353-354)

- [ ] Remplacer `"success"` → `"pass"` et `"failed"` → `"fail"` :

```python
success_count = sum(1 for r in s_results if r.get("status") == "pass")
fail_count    = sum(1 for r in s_results if r.get("status") == "fail")
```

- [ ] Pour éviter toute future divergence, définir des constantes en haut du fichier et les
      utiliser partout (run_suite, rapport MD, rapport PDF) :

```python
STATUS_PASS, STATUS_FAIL, STATUS_RUNNING = "pass", "fail", "running"
```

**✅ Terminé quand :** un projet avec 1 test réussi + 1 échoué affiche `(1 ✅, 1 ❌)`
dans le rapport Markdown ET les mêmes chiffres dans le PDF.

## 1.4 — Compléter `requirements.txt`

**Fichier :** `backend/requirements.txt`

- [ ] Nouveau contenu :

```txt
flask>=3.0.0
flask-cors>=4.0.0
requests>=2.31.0
pytest>=8.0.0
playwright>=1.44.0
reportlab>=4.0.0
python-dotenv>=1.0.0
```

- [ ] Retirer `selenium` (les scripts générés utilisent Playwright — voir le prompt `build_prompt`).
- [ ] Ajouter `python -m playwright install chromium` dans `start.sh` et `start.bat`
      après le `pip install`.

**✅ Terminé quand :** sur un environnement vierge, `pip install -r requirements.txt`
+ `playwright install chromium` suffit pour : générer, exécuter un test, exporter le PDF.

## 1.5 — Mettre à jour le README

**Fichier :** `README.md`

- [ ] Remplacer toutes les mentions **Gemini** par **OpenRouter** (`OPENROUTER_API_KEY`,
      modèles avec fallback : llama-3.3-70b → deepseek-chat → gpt-4o-mini).
- [ ] Corriger la description : les scripts générés sont **Playwright sync API**, pas Selenium.
- [ ] Compléter le tableau des routes API :

| Méthode | Route | Description |
|---|---|---|
| GET/POST | `/api/projects` | CRUD projets |
| GET/DELETE | `/api/projects/:id` | Détail / suppression (cascade sur les suites) |
| GET | `/api/projects/:id/report` | Rapport Markdown |
| GET | `/api/projects/:id/report/pdf` | Rapport PDF (ReportLab) |
| POST | `/api/record` | Lance Playwright codegen, retourne le script |
| GET | `/api/suites/:id/run/status/:rid` | Statut d'une exécution |

- [ ] Documenter le nom d'affichage « Medusa » ou l'harmoniser (décision produit — voir 4.6).

**✅ Terminé quand :** un nouveau développeur peut installer et utiliser l'app en suivant
uniquement le README.

---

# Phase 2 — Robustesse (≈ 1 à 2 journées)

*Objectif : l'app devient fiable, déboguable et prête pour un usage serveur.*

## 2.1 — Verrou sur le stockage JSON

**Fichier :** `backend/app.py`

Le thread d'exécution (`run_suite` → `execute()`) relit/réécrit `results.json` en
concurrence avec les requêtes HTTP → pertes d'écriture possibles.

- [ ] Ajouter un verrou global autour de toutes les lectures-modifications-écritures :

```python
import threading
_STORE_LOCK = threading.RLock()

def read_json(path, default):
    with _STORE_LOCK:
        ...

def write_json(path, data):
    with _STORE_LOCK:
        ...
```

- [ ] Dans `execute()`, encapsuler le bloc « relire results → remplacer → sauvegarder »
      dans `with _STORE_LOCK:` (le RLock rend les appels imbriqués sûrs).
- [ ] *(Option / plus tard)* migrer vers SQLite : mêmes fonctions `get_*/save_*`,
      zéro changement d'API. À ne faire que si le JSON devient limitant.

**✅ Terminé quand :** lancer 3 exécutions simultanées ne perd aucun résultat
(les 3 apparaissent dans `results.json` avec leur statut final).

## 2.2 — Mode headless configurable

**Fichiers :** `backend/app.py` (build_prompt + run_suite), `frontend/src/views/Dashboard.jsx`, `frontend/src/api.js`

- [ ] `build_prompt(...)` accepte un paramètre `headless: bool` et injecte
      `headless={str(headless)}` dans le squelette du script (au lieu de `headless=False` en dur).
- [ ] Alternative plus robuste (les scripts déjà stockés en profitent aussi) : au moment
      de l'exécution, réécrire par regex `headless=False` → `headless=True` si demandé :

```python
if run_headless:
    clean_script = re.sub(r"headless\s*=\s*False", "headless=True", clean_script)
```

- [ ] `POST /api/suites/:id/run` accepte `{ "headless": true }` dans le body.
- [ ] Frontend : case à cocher « 👁 Voir le navigateur » à côté du bouton *Relancer*
      (défaut : headless si l'app tourne, visible sinon — au choix).

**✅ Terminé quand :** on peut relancer une suite existante avec et sans navigateur visible.

## 2.3 — `/api/record` non-bloquant

**Fichiers :** `backend/app.py`, `frontend/src/api.js`, `frontend/src/views/CreateSuite.jsx`

Actuellement `subprocess.run` bloque la requête HTTP jusqu'à fermeture du navigateur codegen.

- [ ] Modèle « job » identique à celui de `run_suite` :
  - `POST /api/record` → crée un job `{id, status: "recording", code: null}` en mémoire
    (dict global + lock), lance codegen dans un `threading.Thread`, répond **202** avec l'id.
  - `GET /api/record/:id` → retourne le job ; quand codegen se termine, le thread lit le
    fichier temp et met `status: "done", code: "..."`.
- [ ] Frontend : `recordPlaywright(url)` poste puis **polle** toutes les 2 s jusqu'à
      `status === "done"` (remplace le `timeout: 0`).
- [ ] Afficher un état « 🔴 Enregistrement en cours — fermez le navigateur pour terminer »
      dans le wizard étape 2.

**✅ Terminé quand :** pendant un enregistrement, le dashboard reste utilisable
(l'API répond), et le script apparaît dans le wizard à la fermeture du navigateur.

## 2.4 — Supprimer le code mort

**Fichiers :** `frontend/src/api.js`, `backend/app.py`

- [ ] Supprimer `buildPrompt()` dans `api.js` (lignes ~202-238) — jamais appelé,
      et son contenu (Selenium unittest) contredit le prompt réel du backend.
- [ ] Supprimer la route `/api/parse` du backend **ou** l'utiliser : le frontend parse
      déjà en local (`parsePlaywright` dans api.js). Recommandation : garder le parseur
      **backend** comme source de vérité (il est appelé nulle part → soit le brancher,
      soit le supprimer avec `parse_playwright` si le frontend suffit). Décision simple :
      supprimer la route, garder le parseur frontend.

**✅ Terminé quand :** `grep -n "buildPrompt" frontend/src` et `grep -n "api/parse"` ne
retournent plus que du code réellement utilisé.

## 2.5 — Voyant backend honnête + cache de détection

**Fichiers :** `frontend/src/App.jsx`, `frontend/src/api.js`

- [ ] `api.js` : exporter une fonction `checkBackend()` qui ping `/api/health` et
      **invalide** le cache `_backendOk` (re-tester toutes les 30 s ou sur événement).
- [ ] `App.jsx` : état `backendUp` (useState + useEffect avec `setInterval` 30 s) ;
      le point passe vert/rouge + tooltip « Backend joignable / injoignable ».
- [ ] Bonus : quand le backend revient en ligne, proposer de re-synchroniser les données
      localStorage (ou au minimum recharger les listes).

**✅ Terminé quand :** couper le backend fait passer le voyant au rouge en < 30 s,
le relancer le fait repasser au vert sans recharger la page.

## 2.6 — Valider le script généré avant sauvegarde/exécution

**Fichier :** `backend/app.py`

- [ ] Factoriser le nettoyage des fences Markdown (actuellement dans `execute()`) en une
      fonction `clean_llm_script(script) -> str` réutilisable.
- [ ] Nouvelle route `POST /api/validate` (ou validation inline dans `create_suite`/`update_suite`) :

```python
def validate_python(script: str):
    try:
        compile(clean_llm_script(script), "<generated-test>", "exec")
        return None
    except SyntaxError as e:
        return f"Ligne {e.lineno}: {e.msg}"
```

- [ ] Wizard étape 4 : afficher l'erreur de syntaxe (bandeau rouge) AVANT de permettre
      la sauvegarde ; proposer un bouton « Régénérer ».

**✅ Terminé quand :** coller un script avec une erreur de syntaxe affiche l'erreur
immédiatement au lieu d'un échec pytest cryptique à l'exécution.

## 2.7 — Divers backend (rapide)

- [ ] Remplacer `datetime.utcnow()` (déprécié Py 3.12+) par
      `datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")`.
- [ ] `run_suite` : rendre le timeout d'exécution configurable
      (`RUN_TIMEOUT = int(os.environ.get("RUN_TIMEOUT", "120"))`).
- [ ] `PUT /api/suites/:id` : filtrer les champs autorisés (`name,url,task,script,actions,playwrightCode,projectId`)
      pour empêcher d'écraser `id`/`createdAt` via `suites[idx].update(data)`.

---

# Phase 3 — Fonctionnalités différenciantes (≈ 2 à 4 journées)

*Objectif : passer de « générateur de scripts » à plateforme de test moderne.*

## 3.1 — Artefacts d'échec : screenshot + trace Playwright ⭐ (le plus rentable)

**Fichiers :** `backend/app.py`, `frontend/src/views/Results.jsx`

- [ ] Créer `backend/artifacts/<result_id>/` par exécution.
- [ ] Modifier `build_prompt` pour que les scripts générés prennent le dossier d'artefacts
      en variable d'environnement et capturent à l'échec :

```python
# Squelette imposé au LLM (dans le try/finally) :
import os
ARTIFACTS = os.environ.get("ARTIFACTS_DIR", ".")
context.tracing.start(screenshots=True, snapshots=True)
try:
    ...  # steps
except Exception:
    page.screenshot(path=os.path.join(ARTIFACTS, "failure.png"), full_page=True)
    raise
finally:
    context.tracing.stop(path=os.path.join(ARTIFACTS, "trace.zip"))
```

- [ ] `execute()` : passer `env={**os.environ, "ARTIFACTS_DIR": artefact_dir}` au subprocess ;
      après le run, lister les fichiers produits et les stocker dans
      `result["artifacts"] = ["failure.png", "trace.zip"]`.
- [ ] Routes : `GET /api/results/:rid/artifacts/<name>` → `send_file` (sécuriser avec
      `secure_filename` + vérifier que le chemin reste sous `artifacts/<rid>/`).
- [ ] `Results.jsx` : dans le détail d'un résultat en échec, afficher la miniature du
      screenshot (clic = plein écran) + lien de téléchargement `trace.zip` avec la
      mention « Ouvrir avec `npx playwright show-trace trace.zip` ».
- [ ] Rétention : supprimer les artefacts quand le résultat/la suite est supprimé(e).

**✅ Terminé quand :** un test qui échoue montre son screenshot dans la vue Résultats
et propose le téléchargement de la trace.

## 3.2 — Boucle d'auto-réparation IA (self-healing) ⭐⭐

**Fichiers :** `backend/app.py`, `frontend/src/views/Results.jsx` (+ Dashboard)

- [ ] Nouvelle route `POST /api/suites/:sid/heal` avec body `{ "resultId": "..." }` :
  1. Récupérer le script actuel + l'output/erreur pytest du résultat échoué.
  2. Construire un prompt de réparation :

```text
You are a senior QA engineer. This Playwright test failed.
── CURRENT SCRIPT ──
{script}
── PYTEST OUTPUT (failure) ──
{output_tail}
── TASK ──
{task de la suite}

Fix the script so it passes while STILL verifying the task.
Prefer more robust locators (get_by_role, get_by_label). Increase timeouts if needed.
OUTPUT ONLY THE FULL CORRECTED PYTHON SCRIPT. No markdown, no explanations.
```

  3. Appeler OpenRouter (réutiliser la mécanique de fallback multi-modèles de `/api/generate` —
     la factoriser en `call_openrouter(prompt, stream=False)`).
  4. Répondre `{ "proposedScript": "..." }` — **ne pas écraser** le script sans validation.
- [ ] Frontend : sur un résultat `fail`, bouton « 🩹 Réparer avec l'IA » →
      affiche un diff/aperçu du script proposé → boutons « Appliquer & relancer » / « Ignorer ».
- [ ] « Appliquer & relancer » = `PUT /api/suites/:id` (script) puis `POST .../run`.
- [ ] *(V2, optionnel)* mode automatique : `POST .../run?autoheal=1` enchaîne
      run → heal → re-run (1 seule tentative), et marque le résultat `healed: true`.

**✅ Terminé quand :** sur un test cassé par un changement de sélecteur, le bouton
Réparer propose un script corrigé qui repasse au vert après application.

## 3.3 — Retry automatique & détection de flakiness

**Fichiers :** `backend/app.py`, `frontend/src/views/Dashboard.jsx`, `Results.jsx`

- [ ] `POST .../run` accepte `{ "retries": 1 }` (défaut 1) : si le run échoue,
      ré-exécuter immédiatement ; stocker `result["attempts"] = 2`,
      `result["flaky"] = true` si échec puis succès.
- [ ] Statistiques par suite (calculées à la volée dans `list_suites` ou une route
      `GET /api/suites/:id/stats`) : `passRate` sur les 10 dernières exécutions,
      `avgDuration`, `lastStatus`.
- [ ] Dashboard : badge par suite — 🟢 stable (≥ 90 %), 🟡 flaky (50-90 %), 🔴 cassé (< 50 %) ;
      afficher `passRate` et durée moyenne.
- [ ] Vue Résultats : badge « ⚠ flaky » sur les résultats concernés + filtre.

**✅ Terminé quand :** une suite instable est visuellement identifiable dans le dashboard
sans ouvrir chaque résultat.

## 3.4 — Exécution groupée « Tout exécuter »

**Fichiers :** `backend/app.py`, `frontend/src/views/Dashboard.jsx`

- [ ] `POST /api/projects/:pid/run-all` : crée un résultat `running` par suite du projet,
      exécute les suites **séquentiellement** dans un seul thread de fond (les tests ouvrent
      un navigateur chacun — le parallélisme viendra avec le headless + une limite
      `MAX_PARALLEL_RUNS=2` si besoin). Répond 202 avec la liste des `resultId`.
- [ ] Dashboard : bouton « ▶ Tout exécuter » au niveau projet + barre de progression
      (`x/n terminés`, en pollant `/api/results?projectId=` ou les statuts un par un).
- [ ] À la fin, toast récapitulatif : « 4/5 réussis — voir le rapport ».

**✅ Terminé quand :** un clic lance toutes les suites d'un projet et le rapport PDF
reflète la campagne complète.

---

# Phase 4 — Produit & confort (backlog priorisé)

## 4.1 — Tendances dans le dashboard
Graphique (sparkline) passes/échecs par jour + durée moyenne, calculé depuis
`results.json`. Frontend pur (les données existent déjà via `GET /api/results`).

## 4.2 — Édition assistée du script
Étape 4 du wizard + détail de suite : textarea d'édition avec bouton
« Régénérer uniquement les assertions » (prompt partiel envoyé au backend).

## 4.3 — Variables & jeux de données (data-driven)
- Champs `variables: {USERNAME: "...", QTY: "8000"}` sur la suite.
- Le prompt demande au LLM d'utiliser `os.environ.get("VAR_USERNAME")`.
- `execute()` injecte les variables en env. Permet de rejouer un scénario
  avec plusieurs jeux de données (`datasets: [{...}, {...}]` → 1 run par dataset).

## 4.4 — Intégration CI / planification
- `GET /api/projects/:pid/run-all?token=...` en webhook (token simple dans `.env`).
- Exemple de workflow GitHub Actions dans le README (checkout → install → run-all
  headless → upload artefacts + PDF).
- *(Local)* planificateur simple : champ `schedule` sur le projet + boucle
  `threading.Timer` — ou documenter cron/Task Scheduler appelant le webhook.

## 4.5 — Migration SQLite
Quand le JSON devient limitant (> quelques milliers de résultats) : remplacer
`read_json/write_json` par une petite couche `sqlite3` (tables `projects`,
`suites`, `results`). L'API ne change pas.

## 4.6 — Harmonisation du nom
Choisir : **Medusa** (UI) ou **Selenium Test Studio** (README/repo). Le produit
générant du Playwright, « Selenium » dans le nom est trompeur — recommandation :
renommer en « Medusa — QA Automation Hub » partout (README, `package.json`,
titre HTML, header).

---

# ✅ Checklist de validation globale (à dérouler après chaque phase)

1. `pip install -r requirements.txt` + `playwright install chromium` sur env vierge → OK.
2. `python backend/app.py` démarre sans clé en dur ; `/api/health` répond.
3. Wizard complet : créer projet → enregistrer (codegen) → parser → générer → sauvegarder.
4. Exécuter la suite : statut `pass`/`fail` correct, output visible, artefacts présents (Phase 3).
5. Rapport Markdown ET PDF : compteurs ✅/❌ cohérents avec l'historique.
6. Couper le backend → l'UI passe en mode localStorage, voyant rouge (Phase 2.5).
7. `git status` propre après build + run (rien de généré n'est suivi).
8. `grep -rn "sk-or-v1\|gsk_" .` (hors node_modules) → aucun résultat.

---

# 📁 Architecture cible (après Phase 3)

```
selenium-test-studio/
├── .gitignore
├── README.md                  # à jour : OpenRouter + Playwright
├── PLAN.md                    # ce fichier
├── start.sh / start.bat       # + playwright install chromium
├── backend/
│   ├── app.py                 # routes + verrou storage + jobs record/run
│   ├── requirements.txt       # flask, playwright, reportlab, dotenv…
│   ├── .env                   # secrets (non commité)
│   ├── .env.example           # placeholders uniquement
│   ├── data/                  # JSON runtime (non commité)
│   └── artifacts/<result_id>/ # screenshots + traces (non commité)
└── frontend/
    └── src/
        ├── api.js             # sans code mort, checkBackend() périodique
        ├── App.jsx            # voyant backend réel
        └── views/             # Dashboard (stats, run-all), Results (artefacts, heal)
```
