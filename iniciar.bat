@echo off
REM --- Inicia Control Sultana ---
cd /d "%~dp0"
echo Iniciando Control Sultana...
echo Cuando diga "Ready", abre http://localhost:3000 en tu navegador.
echo.
echo Si al abrirlo sale un error que menciona  .next  , cierra esta ventana
echo y ejecuta  reparar.bat  : lo deja como nuevo sin tocar tu informacion.
start "" http://localhost:3000
npm run dev
