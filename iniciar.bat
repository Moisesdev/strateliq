@echo off
title STRATELIQ - Iniciador de Servidores
cls

echo ==========================================================
echo         STRATELIQ - INICIADOR DE SERVIDORES
echo ==========================================================
echo.
echo Levantando Backend (FastAPI en puerto 8004)...
start "STRATELIQ - Backend (FastAPI)" cmd /k "cd /d "%~dp0backend" && .\venv\Scripts\uvicorn server:app --reload --port 8004"

echo Levantando Frontend (React en puerto 3004)...
start "STRATELIQ - Frontend (React)" cmd /k "cd /d "%~dp0frontend" && npm start"

echo.
echo ==========================================================
echo ¡Operacion exitosa! Se han abierto dos terminales dedicadas.
echo Ya podes cerrar esta ventana de control.
echo ==========================================================
echo.
timeout /t 5
