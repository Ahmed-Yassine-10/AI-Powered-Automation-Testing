@echo off
echo.
echo ╔══════════════════════════════════════╗
echo ║     Selenium Test Studio            ║
echo ╚══════════════════════════════════════╝
echo.

echo Installation des dependances backend...
cd backend
pip install -r requirements.txt
echo.

if "%OPENROUTER_API_KEY%"=="" (
	set "OPENROUTER_API_KEY=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"
	echo [INFO] OPENROUTER_API_KEY non definie. Cle par defaut appliquee pour cette session.
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
