@echo off
REM --- Actualiza Control TI a la ultima version y lo inicia ---
cd /d "%~dp0"
echo ============================================
echo   Actualizando Control TI...
echo ============================================
echo.
echo 1) Descargando la ultima version...
git pull
if errorlevel 1 (
  echo.
  echo No se pudo descargar la actualizacion. Revisa tu conexion o avisa a soporte.
  pause
  exit /b 1
)
echo.
echo 2) Revisando dependencias...
call npm install
echo.
echo 3) Listo. Iniciando el sistema...
echo    Abre http://localhost:3000 cuando diga "Ready".
start "" http://localhost:3000
npm run dev
