@echo off
REM --- Depura el inventario y carga las responsivas escaneadas ---
cd /d "%~dp0"
setlocal

set HAYLOTE=0
if exist "lote\*.pdf" set HAYLOTE=1

echo ==========================================================
echo   PONER AL DIA EL INVENTARIO
echo ==========================================================
echo.
echo   1) Depurar: UNE los registros repetidos (el mas completo se queda
echo      con la informacion y las responsivas) y da de baja los danados
echo   2) Telefonia: deja solo los celulares del listado vigente y cierra
echo      las responsivas que ya no corresponden a ese listado
if "%HAYLOTE%"=="1" (
  echo   3) Responsivas: carga los PDF de la carpeta "lote"
) else (
  echo   3) Responsivas: SE OMITE ^(no hay PDF en la carpeta "lote"^)
)
echo.
echo Primero se hace una SIMULACION: no se escribe nada y te muestra
echo exactamente que va a pasar. Al final decides si se aplica.
echo.
if "%HAYLOTE%"=="0" (
  echo NOTA: si tambien quieres cargar responsivas escaneadas, cierra esto,
  echo       crea una carpeta llamada  lote  aqui mismo, copia dentro los PDF
  echo       y vuelve a ejecutar. Sin eso solo se hace la limpieza.
  echo.
)
pause

echo.
echo ==========================================================
echo   SIMULACION - DEPURAR INVENTARIO
echo ==========================================================
call node scripts\depurar-inventario.mjs
if errorlevel 1 goto :error
echo.
pause

echo.
echo ==========================================================
echo   SIMULACION - CELULARES
echo ==========================================================
call node scripts\sincronizar-celulares.mjs
if errorlevel 1 goto :error
echo.
pause

if "%HAYLOTE%"=="1" (
  echo.
  echo ==========================================================
  echo   SIMULACION - RESPONSIVAS
  echo ==========================================================
  call node scripts\importar-responsivas.mjs --pdfs .\lote
  if errorlevel 1 goto :error
  echo.
)

echo ==========================================================
echo   REVISA LO DE ARRIBA
echo ==========================================================
echo.
echo Si algo no te cuadra, escribe N y no se toca nada.
echo Si esta correcto, escribe S para aplicarlo de verdad.
echo.
echo ^(Antes de escribir se hace un respaldo automatico de la base
echo  en data\backups, asi que siempre se puede volver atras.^)
echo.
set /p RESP=Aplicar los cambios? (S/N):
if /i not "%RESP%"=="S" (
  echo.
  echo Cancelado. No se modifico nada.
  pause
  exit /b 0
)

echo.
echo ==========================================================
echo   APLICANDO...
echo ==========================================================
call node scripts\depurar-inventario.mjs --aplicar
if errorlevel 1 goto :error
call node scripts\sincronizar-celulares.mjs --aplicar
if errorlevel 1 goto :error
if "%HAYLOTE%"=="1" (
  call node scripts\importar-responsivas.mjs --pdfs .\lote --aplicar
  if errorlevel 1 goto :error
)

echo.
echo ==========================================================
echo   COMO QUEDO
echo ==========================================================
call node scripts\revisar-duplicados.mjs
echo.
echo ==========================================================
echo   LISTO
echo ==========================================================
echo.
echo Abre el sistema con  iniciar.bat  . En Empleados veras la columna
echo "Sin resp." con quien tiene equipo sin carta firmada.
echo.
echo Si mas adelante vuelve a salir el aviso amarillo de datos repetidos,
echo no necesitas esta ventana: en Inventario pulsa "Unir duplicados".
echo.
pause
exit /b 0

:error
echo.
echo ==========================================================
echo   HUBO UN PROBLEMA
echo ==========================================================
echo.
echo No se completo el proceso. Si ya se habia aplicado algo, tienes
echo el respaldo en la carpeta data\backups para restaurarlo.
echo Copia el mensaje de error de arriba y pasalo a soporte.
echo.
pause
exit /b 1
