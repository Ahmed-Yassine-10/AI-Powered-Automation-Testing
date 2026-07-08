# Selenium Test Studio 🧪

Application web complète pour créer, générer et exécuter des tests automatisés
**Playwright** générés par IA (via **OpenRouter**), avec artefacts d'échec,
auto-réparation IA et rapports d'exécution.

> Note : malgré son nom historique, l'outil génère et exécute des scripts
> **Playwright (Python)**, pas Selenium.

## Architecture

```
selenium-test-studio/
├── backend/              # API Flask (Python)
│   ├── app.py
│   ├── requirements.txt
│   ├── .env.example      # à copier en .env (clé OpenRouter)
│   ├── data/             # stockage JSON (auto-créé, non versionné)
│   └── artifacts/        # screenshots + traces d'échec (auto-créé, non versionné)
├── frontend/             # App React (Create React App)
│   └── src/
│       ├── App.jsx
│       ├── api.js
│       ├── components.jsx
│       └── views/ { Dashboard, CreateSuite, Results }.jsx
├── start.sh / start.bat  # démarrage rapide
└── README.md
```

## Prérequis

- **Python 3.9+** avec pip
- **Node.js 18+** avec npm
- **Playwright** + navigateur Chromium (installé via `python -m playwright install chromium`)
- Une **clé API OpenRouter** (<https://openrouter.ai/keys>)

## Installation & Démarrage

### Option A — Script automatique

**Linux / macOS :**
```bash
chmod +x start.sh
./start.sh
```

**Windows :**
```bat
start.bat
```

### Option B — Manuel

**1. Backend (terminal 1) :**
```bash
cd backend
pip install -r requirements.txt
python -m playwright install chromium
cp .env.example .env         # puis renseignez OPENROUTER_API_KEY
python app.py                # → http://localhost:5000
```

**2. Frontend (terminal 2) :**
```bash
cd frontend
npm install
npm start                    # → http://localhost:3000
```

## Configuration de la clé API

La clé est lue **uniquement** depuis l'environnement ou le fichier `backend/.env`
(chargé automatiquement via `python-dotenv`). Aucune clé n'est codée en dur.

**`backend/.env` :**
```env
OPENROUTER_API_KEY=sk-or-v1-votre_cle_ici
OPENROUTER_MODEL=meta-llama/llama-3.3-70b-instruct
RUN_TIMEOUT=120
```

Modèles avec bascule automatique en cas d'indisponibilité :
`llama-3.3-70b-instruct` → `deepseek-chat-v3` → `gpt-4o-mini`.

## Workflow d'utilisation

1. **Créer un projet**, puis **+ Nouveau test** (nom, URL, description de la tâche).
2. **Enregistrer les actions** : le bouton lance Playwright Codegen ; effectuez le
   parcours dans le navigateur puis fermez-le — le script est récupéré automatiquement.
   (Vous pouvez aussi coller un script codegen manuellement.)
3. **Analyser** : l'app parse les actions Playwright.
4. **Générer** : le LLM produit un script Playwright/pytest complet (happy path + assertions).
5. **Enregistrer & Exécuter** : le backend lance `pytest` ; les résultats, la sortie,
   les artefacts d'échec et l'historique s'affichent.

### Fonctionnalités clés

- **Mode headless configurable** par exécution (voir le navigateur ou non).
- **Artefacts d'échec** : capture d'écran + trace Playwright (`trace.zip`, ouvrable via
  `npx playwright show-trace trace.zip`) téléchargeables depuis la vue Résultats.
- **Auto-réparation IA** (« 🩹 Réparer avec l'IA ») : sur un test échoué, le LLM propose
  un script corrigé à partir du script + de la sortie pytest.
- **Retry & flakiness** : ré-exécution automatique et détection des tests instables.
- **Exécution groupée** : « ▶ Tout exécuter » au niveau projet.
- **Rapports** : Markdown + PDF (ReportLab).

## Notes

- Les données sont stockées dans `backend/data/` (JSON) et les artefacts dans
  `backend/artifacts/` — les deux sont ignorés par Git et recréés à la volée.
- Le stockage JSON est protégé par un verrou pour supporter les exécutions concurrentes.
- L'exécution lance du code Python arbitraire (les scripts de test) et CORS est ouvert :
  **destiné à un usage local**. Ne pas exposer le backend sur un réseau non fiable.

## API Backend

| Méthode | Route | Description |
|---------|-------|-------------|
| GET  | `/api/health`                         | État du backend (+ clé OpenRouter présente ?) |
| GET/POST | `/api/projects`                   | Liste / création de projets |
| GET/DELETE | `/api/projects/:id`             | Détail / suppression (cascade suites + résultats) |
| GET  | `/api/projects/:id/report`            | Rapport Markdown |
| GET  | `/api/projects/:id/report/pdf`        | Rapport PDF |
| POST | `/api/projects/:id/run-all`           | Exécute toutes les suites du projet |
| GET/POST | `/api/suites`                     | Liste (avec stats) / création |
| GET/PUT/DELETE | `/api/suites/:id`           | Détail / mise à jour / suppression |
| GET  | `/api/suites/:id/stats`               | Stats (taux de réussite, flaky, durée) |
| POST | `/api/generate`                       | Génère un script (streaming SSE) |
| POST | `/api/validate`                       | Vérifie la syntaxe d'un script |
| POST | `/api/suites/:id/run`                 | Lance l'exécution (`headless`, `retries`) |
| GET  | `/api/suites/:id/run/status/:rid`     | Statut d'une exécution |
| POST | `/api/suites/:id/heal`                | Propose une correction IA d'un test échoué |
| POST | `/api/record`                         | Démarre Playwright codegen (job async) |
| GET  | `/api/record/:jobId`                  | Statut du job d'enregistrement |
| GET  | `/api/results`                        | Historique des résultats |
| PATCH | `/api/results/:id`                   | Met à jour un résultat |
| GET  | `/api/results/:id/artifacts/:name`    | Télécharge un artefact (screenshot / trace) |
