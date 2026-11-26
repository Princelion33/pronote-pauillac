@echo off
title PRONOTE Custom — Lycee Odilon Redon (Pauillac 0332081H)
echo ========================================================
echo   Demarrage du serveur PRONOTE Custom (Pauillac 0332081H)
echo   Interface Web + Connecteur SAML EduConnect
echo ========================================================
start "Backend Pronote API (Port 8000)" cmd /k "cd /d "%~dp0backend" && python -m uvicorn main:app --host 0.0.0.0 --port 8000"
start "Frontend Web (Port 5173)" cmd /k "cd /d "%~dp0frontend" && npm run dev"
echo.
echo -> Site accessible sur : http://localhost:5173 (Dev) et http://localhost:8000 (Prod)
pause
