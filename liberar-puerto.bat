@echo off
REM --- Cierra la ventana anterior del sistema, si quedo una corriendo ---
REM
REM No se ejecuta solo: lo llaman iniciar.bat, actualizar.bat y reparar.bat
REM antes de arrancar.
REM
REM El problema que resuelve: si queda una ventana vieja abierta, se queda
REM con el puerto 3000 y la nueva se va al 3002 avisandolo en una sola
REM linea que se pierde entre todo lo demas. El navegador abre el 3000 y
REM muestra la vieja, asi que parece que la actualizacion no sirvio: se
REM sigue viendo el sistema de antes, o su error, aunque el nuevo este
REM corriendo perfecto al lado.

setlocal EnableDelayedExpansion

call :buscar
if not defined OCUPADO (
  echo    El puerto 3000 esta libre.
  exit /b 0
)

echo    Habia otra ventana del sistema corriendo. Se cierra para que esta
echo    tome el puerto 3000 y no se abra una copia vieja por error.
taskkill /f /pid %OCUPADO% >nul 2>&1

REM Windows tarda un momento en soltar el puerto despues de cerrar.
ping -n 4 127.0.0.1 >nul

call :buscar
if not defined OCUPADO (
  echo    Listo, el puerto 3000 quedo libre.
  exit /b 0
)

echo.
echo    ======================================================
echo      NO SE PUDO LIBERAR EL PUERTO 3000
echo    ======================================================
echo.
echo    Algo sigue usandolo y no se dejo cerrar. Si continuas, el
echo    sistema va a abrir en otro puerto ^(3001, 3002...^) y el
echo    navegador te va a seguir mostrando lo viejo en el 3000.
echo.
echo    Cierra todas las ventanas negras de Control Sultana. Si asi
echo    sigue, reinicia la computadora y vuelve a intentar.
echo.
pause
exit /b 1

REM ---------------------------------------------------------------
REM Deja en OCUPADO el proceso que tiene tomado el puerto 3000.
REM
REM No se filtra por la palabra del estado: netstat esta traducido y en
REM un Windows en espanol dice ESCUCHANDO, no LISTENING, asi que buscar
REM "LISTENING" no encontraria nada y esto no serviria de nada justo en
REM la maquina donde hace falta.
REM
REM En su lugar se mira la DIRECCION LOCAL (columna 2): solo el servidor
REM tiene ahi el puerto 3000. La conexion del navegador lo trae en la
REM direccion remota, con un puerto cualquiera en la local, asi que no
REM se confunde con ella.
REM ---------------------------------------------------------------
:buscar
set "OCUPADO="
for /f "tokens=2,5" %%a in ('netstat -ano ^| findstr /c:":3000 "') do (
  set "LOCAL=%%a"
  set "QUIEN=%%b"
  if "!LOCAL:~-5!"==":3000" if not "!QUIEN!"=="0" set "OCUPADO=!QUIEN!"
)
exit /b 0
