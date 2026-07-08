@echo off
echo.
echo ==========================================
echo      Selenium Test Studio
echo ==========================================
echo.

echo Installation des dependances backend...
cd backend
pip install -r requirements.txt
echo.

echo Installation du navigateur Playwright (chromium)...
python -m playwright install chromium
echo.

if not exist ".env" (
	echo [ATTENTION] backend\.env absent.
	echo Copiez backend\.env.example en backend\.env et renseignez OPENROUTER_API_KEY.
	echo.
)

echo Demarrage du backend Flask (port 5000)...
start "Backend Flask" python app.py
cd ..

timeout /t 3 /nobreak >nul

echo Installation des dependances frontend...
cd frontend
call npm install
echo.

echo Demarrage du frontend React (port 3000)...
echo.
echo Application disponible sur : http://localhost:3000
echo Backend API sur            : http://localhost:5000
echo.

start "Frontend React" npm start
cd ..

echo.
echo Les serveurs backend et frontend tournent dans des fenetres separees.
echo Fermez ces fenetres pour arreter les services.
