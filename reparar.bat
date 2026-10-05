@echo off
REM --- Repara Control Sultana cuando no arranca por la carpeta .next ---
cd /d "%~dp0"

echo ==========================================================
echo   REPARAR CONTROL SULTANA
echo ==========================================================
echo.
echo Esto borra la carpeta  .next  , que es donde Next.js guarda el
echo sistema ya compilado. Se vuelve a generar sola al iniciar.
echo.
echo   TU INFORMACION NO SE TOCA:
echo   la base de datos vive en  data\  y los PDF en  storage\  .
echo.
echo Sirve cuando al abrir el sistema sale un error parecido a:
echo    ENOENT: no such file or directory, open '...\.next\server\...'
echo.
echo ----------------------------------------------------------
echo   IMPORTANTE: primero CIERRA la ventana negra donde estaba
echo   corriendo el sistema. Si sigue abierta, Windows no deja
echo   borrar los archivos y esto no va a servir.
echo ----------------------------------------------------------
echo.
pause

echo.
echo 1) Borrando la carpeta .next ...
if exist ".next" rmdir /s /q ".next"
if exist ".next" goto :trabada
echo    Listo.

echo.
echo 2) Borrando la cache de compilacion ...
if exist "node_modules\.cache" rmdir /s /q "node_modules\.cache"
echo    Listo.

echo.
echo 3) Iniciando el sistema. La primera vez tarda mas porque se
echo    tiene que volver a compilar: es normal.
echo    Abre http://localhost:3000 cuando diga "Ready".
echo.
start "" http://localhost:3000
npm run dev
exit /b 0

:trabada
echo.
echo ==========================================================
echo   NO SE PUDO BORRAR
echo ==========================================================
echo.
echo La carpeta .next sigue ahi, casi siempre porque el sistema
echo todavia esta corriendo en otra ventana.
echo.
echo Haz esto:
echo    1. Cierra TODAS las ventanas negras de Control Sultana
echo    2. Si aun asi no deja, reinicia la computadora
echo    3. Vuelve a ejecutar  reparar.bat
echo.
pause
exit /b 1
