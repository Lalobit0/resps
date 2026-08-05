@echo off
REM --- Carga las responsivas escaneadas y depura el inventario ---
cd /d "%~dp0"
setlocal

echo ==========================================================
echo   PONER AL DIA EL INVENTARIO Y LAS RESPONSIVAS
echo ==========================================================
echo.
echo Este proceso hace tres cosas, en este orden:
echo   1) Depura: quita registros duplicados y da de baja los danados
echo   2) Telefonia: deja el inventario con los celulares vigentes
echo   3) Responsivas: carga los PDF escaneados y los asigna
echo.
echo Primero se hace una SIMULACION: no se escribe nada y te muestra
echo exactamente que va a pasar. Al final decides si se aplica.
echo.

if not exist "lote\" (
  echo ----------------------------------------------------------
  echo   FALTA LA CARPETA CON LOS PDF
  echo ----------------------------------------------------------
  echo.
  echo Crea una carpeta llamada  lote  aqui mismo:
  echo   %CD%\lote
  echo.
  echo Copia dentro TODOS los PDF de las responsivas escaneadas
  echo ^(1780.pdf, 1916.pdf, 2107.pdf, etc.^) y vuelve a ejecutar.
  echo.
  pause
  exit /b 1
)

echo ==========================================================
echo   SIMULACION 1 de 3 - DEPURAR INVENTARIO
echo ==========================================================
call node scripts\depurar-inventario.mjs
if errorlevel 1 goto :error
echo.
pause

echo.
echo ==========================================================
echo   SIMULACION 2 de 3 - CELULARES
echo ==========================================================
call node scripts\sincronizar-celulares.mjs
if errorlevel 1 goto :error
echo.
pause

echo.
echo ==========================================================
echo   SIMULACION 3 de 3 - RESPONSIVAS
echo ==========================================================
call node scripts\importar-responsivas.mjs --pdfs .\lote
if errorlevel 1 goto :error
echo.

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
call node scripts\importar-responsivas.mjs --pdfs .\lote --aplicar
if errorlevel 1 goto :error

echo.
echo ==========================================================
echo   LISTO
echo ==========================================================
echo.
echo Ya puedes abrir el sistema. En Empleados vas a ver la columna
echo "Falta resp." con quien tiene equipo sin carta firmada.
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
