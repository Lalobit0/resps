@echo off
REM --- Actualiza Control Sultana a la ultima version y lo inicia ---
cd /d "%~dp0"
echo ============================================
echo   Actualizando Control Sultana...
echo ============================================
echo.
echo 1) Cerrando el sistema si quedo abierto...
REM Va primero: con el sistema corriendo no se puede limpiar lo compilado
REM (Windows no deja borrar archivos en uso) y ademas se quedaria con el
REM puerto 3000, asi que al terminar el navegador abriria la version vieja.
call "%~dp0liberar-puerto.bat"

echo.
echo 2) Descargando la ultima version...

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
echo 3) Revisando dependencias...
call npm install

REM Lo compilado corresponde a la version ANTERIOR. Si se deja, Next busca
REM archivos que el codigo nuevo ya no genera y truena al abrir con un
REM "ENOENT ... .next\server\app\page.js". Se borra: se rehace solo, y no
REM toca ni la base de datos (data\) ni los PDF (storage\).
echo.
echo 4) Limpiando la version anterior ya compilada...
if exist ".next" rmdir /s /q ".next"
if exist ".next" (
  echo.
  echo    AVISO: no se pudo borrar la carpeta .next, seguramente porque el
  echo    sistema sigue abierto en otra ventana. Cierralas todas y ejecuta
  echo    reparar.bat antes de usarlo.
  echo.
  pause
)
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
echo 5) Listo. Iniciando el sistema...
echo    La primera vez despues de actualizar tarda mas en abrir, porque
echo    se tiene que compilar de nuevo. Es normal.
echo    Abre http://localhost:3000 cuando diga "Ready".
start "" http://localhost:3000
npm run dev
