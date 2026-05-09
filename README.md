# Selenium Test Studio 🧪

Application web complète pour créer, générer et exécuter des suites de tests Selenium automatiquement via Gemini AI.

## Architecture

```
selenium-test-studio/
├── backend/          # Flask API (Python)
│   ├── app.py
│   ├── requirements.txt
│   └── data/         # Stockage JSON (auto-créé)
├── frontend/         # React App
│   ├── src/
│   │   ├── App.jsx
│   │   ├── api.js
│   │   ├── components.jsx
│   │   └── views/
│   │       ├── Dashboard.jsx
│   │       ├── CreateSuite.jsx
│   │       └── Results.jsx
│   └── package.json
├── start.sh          # Démarrage rapide (Linux/Mac)
├── start.bat         # Démarrage rapide (Windows)
└── README.md
```

## Prérequis

- **Python 3.9+** avec pip
- **Node.js 18+** avec npm
- **Google Chrome** + ChromeDriver (pour l'exécution Selenium)
- **Playwright** (pour le codegen) : `pip install playwright && playwright install chromium`

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
python app.py
# → http://localhost:5000
```

**2. Frontend (terminal 2) :**
```bash
cd frontend
npm install
npm start
# → http://localhost:3000
```

## Workflow d'utilisation

### 1. Créer un cas de test

1. Cliquez **"+ Nouveau test"**
2. Renseignez :
   - **Nom** : ex. `Login Test`
   - **URL** : `https://votre-site.com`
   - **Tâche** : description de ce que le test vérifie

### 2. Enregistrer les actions

1. Dans un terminal, lancez Playwright Codegen :
   ```bash
   npx playwright codegen https://votre-site.com
   ```
2. Effectuez les actions manuellement dans le navigateur
3. Copiez le script Python généré
4. Collez-le dans l'étape 2 du wizard

### 3. Générer le script Selenium

- L'app parse automatiquement vos actions Playwright
- Gemini AI (configurable via backend) génère un script Selenium Python complet
- 2 méthodes de test minimum : **happy path** + **edge case**

### 4. Sauvegarder & Exécuter

- Enregistrez la suite → elle apparaît dans le Dashboard
- Cliquez **"▶ Relancer"** pour exécuter le script
- Le backend lance `pytest` sur le script généré
- Les résultats s'affichent en temps réel

### 5. Gérer les résultats

- Vue **Résultats** : historique filtrable (Succès / Échec / En attente)
- Les tests **Échec** peuvent être marqués **Succès** manuellement
- Sortie complète de pytest disponible dans le détail de chaque résultat

## Configuration Gemini API

Définissez votre clé API Gemini dans l'environnement avant de lancer le backend.

**Windows (PowerShell)** :
```powershell
$env:GEMINI_API_KEY="votre_cle_ici"
cd backend
python app.py
```

**Linux / macOS** :
```bash
export GEMINI_API_KEY="votre_cle_ici"
cd backend
python app.py
```

## Notes importantes

- **ChromeDriver** : Assurez-vous que ChromeDriver correspond à votre version de Chrome.
  Installation recommandée : `pip install webdriver-manager` et adaptez le script.
- **Headless** : Pour exécuter sans interface graphique (serveur), modifiez le script Selenium généré :
  ```python
  options = webdriver.ChromeOptions()
  options.add_argument('--headless')
  self.driver = webdriver.Chrome(options=options)
  ```
- Les données sont stockées dans `backend/data/` au format JSON.

## API Backend

| Méthode | Route | Description |
|---------|-------|-------------|
| GET  | `/api/suites`           | Liste toutes les suites |
| POST | `/api/suites`           | Créer une suite |
| GET  | `/api/suites/:id`       | Détail d'une suite |
| PUT  | `/api/suites/:id`       | Modifier une suite |
| DELETE | `/api/suites/:id`     | Supprimer une suite |
| POST | `/api/parse`            | Parser un script Playwright |
| POST | `/api/generate`         | Générer script Selenium (streaming SSE) |
| POST | `/api/suites/:id/run`   | Lancer l'exécution |
| GET  | `/api/results`          | Historique des résultats |
| PATCH | `/api/results/:id`     | Mettre à jour un résultat |
