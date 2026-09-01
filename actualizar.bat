@echo off
REM --- Actualiza Control Sultana a la ultima version y lo inicia ---
cd /d "%~dp0"
echo ============================================
echo   Actualizando Control Sultana...
echo ============================================
echo.
echo 1) Descargando la ultima version...

REM npm install reescribe package-lock.json por su cuenta, y ese cambio
REM trababa la siguiente actualizacion. Se descarta antes de bajar nada:
REM es un archivo que genera la maquina, no algo que alguien edite.
git checkout -- package-lock.json 2>nul

git pull
if errorlevel 1 goto :reintentar
goto :dependencias

:reintentar
echo.
echo    Hay cambios locales que estorban. Se guardan a un lado y se reintenta...
echo    ^(Tu base de datos y tus PDF no se tocan: viven en data\ y storage\.^)
git stash push -u -m "cambios-locales-antes-de-actualizar"
git pull
if errorlevel 1 goto :fallo
echo.
echo    Listo. Lo que se guardo a un lado se puede recuperar con: git stash pop
goto :dependencias

:fallo
echo.
echo No se pudo descargar la actualizacion. Revisa tu conexion o avisa a soporte.
pause
exit /b 1

:dependencias
echo.
echo 2) Revisando dependencias...
call npm install
echo.
echo ============================================
echo   ATENCION: ahora el sistema pide contrasena
echo ============================================
echo.
echo Si es la primera vez que entras despues de esta actualizacion:
echo    usuario:     admin
echo    contrasena:  admin
echo El sistema te va a pedir cambiarla de inmediato. Despues das de alta
echo a las demas personas en Configuracion - Usuarios y roles.
echo.
echo 3) Listo. Iniciando el sistema...
echo    Abre http://localhost:3000 cuando diga "Ready".
start "" http://localhost:3000
npm run dev
