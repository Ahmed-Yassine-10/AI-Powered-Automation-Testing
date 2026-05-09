#!/bin/bash
# Selenium Test Studio — Script de démarrage

set -e

echo ""
echo "╔══════════════════════════════════════╗"
echo "║     Selenium Test Studio 🧪          ║"
echo "╚══════════════════════════════════════╝"
echo ""

# Backend
echo "→ Installation des dépendances backend..."
cd backend
pip install -r requirements.txt -q
echo "→ Démarrage du backend Flask (port 5000)..."
python app.py &
BACKEND_PID=$!
cd ..

sleep 2

# Frontend
echo "→ Installation des dépendances frontend..."
cd frontend
npm install --silent
echo ""
echo "✅ Backend démarré (PID $BACKEND_PID)"
echo "→ Démarrage du frontend React (port 3000)..."
echo ""
echo "  Application disponible sur : http://localhost:3000"
echo "  Backend API sur            : http://localhost:5000"
echo ""
echo "  (Ctrl+C pour arrêter)"
echo ""

npm start

# Cleanup
kill $BACKEND_PID 2>/dev/null || true
