@echo off
REM --- Inicia Control Sultana ---
cd /d "%~dp0"
echo Iniciando Control Sultana...
echo Cuando diga "Ready", abre http://localhost:3000 en tu navegador.
start "" http://localhost:3000
npm run dev
