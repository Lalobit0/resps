# Cómo manejar las actualizaciones (sin reinstalar todo)

## Lo primero: no toda actualización cuesta lo mismo

| Tipo de cambio | Qué hay que hacer | ¿Se reinstala? |
|---|---|---|
| Ajuste de texto, un campo, un arreglo visual | `git pull` y reiniciar (a veces ni eso: se recarga solo) | No |
| Cambio en la base de datos (columna nueva, plantilla) | Nada especial: **se migra sola al arrancar** | No |
| Se agrega una librería nueva (raro) | `npm install` (una vez) | Solo esa vez |

**La reinstalación completa NO es lo normal.** Pasó ahora solo porque se agregó una
librería nueva (la de leer Excel). El 90% de las mejoras son solo "bajar y reiniciar".

Y en todos los casos, **tus datos nunca se tocan**: la carpeta `data` (base de datos) y
`storage` (PDFs) están fuera del control de versiones, así que `git pull` jamás las borra.

## La forma recomendada: Git (una sola vez de configuración)

### Configuración inicial (solo una vez)
1. Instala **Git para Windows**: https://git-scm.com/download/win (Siguiente, siguiente).
2. Abre una terminal en `C:\` y clona el proyecto:
   ```
   git clone https://github.com/lalobit0/resps.git ControlTI
   ```
   La primera vez te pedirá iniciar sesión en GitHub (se abre una ventana del navegador).
3. Entra a la carpeta y cámbiate a la rama de trabajo:
   ```
   cd ControlTI
   git checkout claude/review-staging-production-faxb5h
   npm install
   ```
4. Si ya tenías datos capturados, copia tus carpetas `data` y `storage` dentro de `ControlTI`.

### Para el día a día
- **Iniciar el sistema:** doble clic en **`iniciar.bat`**.
- **Actualizar a lo último:** doble clic en **`actualizar.bat`** (hace `git pull`, revisa
  dependencias y arranca). 30 segundos, sin bajar zips, sin borrar nada.

### Si al actualizar sale "Your local changes ... would be overwritten"

`npm install` reescribe por su cuenta el archivo `package-lock.json`, y ese cambio
trababa la siguiente actualización. **`actualizar.bat` ya lo resuelve solo:** descarta
ese archivo antes de bajar nada y, si aun así algo estorba, lo guarda a un lado con
`git stash` y sigue. Si ves el error con una versión vieja del `.bat`, corre esto una
vez en la carpeta del proyecto y vuelve a intentar:

```
git checkout -- package-lock.json
```

Tu base de datos y tus PDF nunca corren riesgo: viven en `data` y `storage`, que están
fuera del control de versiones.

## Alternativa sin instalar nada: ponerlo en línea

Si las actualizaciones se vuelven muy frecuentes, la opción más cómoda es **hospedarlo**
(Supabase + Vercel). Ahí yo publico el cambio y tú solo **refrescas el navegador**: cero
instalaciones, cero comandos, y lo puede usar más gente. Requiere una migración inicial
de la base de datos, pero después las actualizaciones son instantáneas.

---

# Poner al día el inventario (depurar y cargar responsivas)

Todo pasa en tu computadora; nada sale de la empresa.

## Lo importante primero

`actualizar.bat` **solo baja la última versión del programa**. No limpia nada ni
carga responsivas. Para eso está `poner-al-dia.bat`.

## Paso a paso

1. **Doble clic en `actualizar.bat`.** Cuando diga `Ready`, ciérralo con
   `Ctrl + C`.

2. **Doble clic en `poner-al-dia.bat`.** Eso hace todo: depurar duplicados,
   dejar la telefonía al día y, si hay PDF, cargar las responsivas.

   Primero hace una **simulación**: no escribe nada y te muestra qué va a pasar.
   Ve leyendo y presiona una tecla para avanzar.

3. Al final pregunta **¿Aplicar los cambios? (S/N)**.
   - `N` → no se toca nada.
   - `S` → **respalda la base** en `data\backups` y aplica todo. Al terminar te
     muestra cómo quedó el inventario de duplicados.

4. **Doble clic en `iniciar.bat`** y abre el sistema.

## Si además quieres cargar responsivas escaneadas

Antes del paso 2, crea una carpeta llamada `lote` junto a `iniciar.bat` y copia
dentro los PDF (`1780.pdf`, `1916.pdf`, `2107.pdf`, etc.). El proceso los detecta
solo. **Si no existe esa carpeta, simplemente hace la limpieza y omite ese paso.**

## Si algo sale mal

En `data\backups` queda una copia de la base con la fecha y hora, tomada justo
antes de aplicar. Para volver atrás: cierra el sistema, entra a `data\backups`,
copia el archivo `.db` más reciente a la carpeta `data` y renómbralo `app.db`.

## Ver qué está repetido, sin cambiar nada

```
node scripts\revisar-duplicados.mjs
```

Lista equipo por equipo qué dato se repite y con cuáles. Solo lee.

Ten en cuenta que hay dos clases de repetidos:

| Campo repetido | ¿Se limpia solo? |
|---|---|
| Serie, IMEI, línea | **Sí**, con `poner-al-dia.bat` |
| No. de activo, nombre de la computadora | **No**: son solo aviso, porque únicamente tú sabes cuál es el correcto. Se corrigen editando el equipo. |

## Correrlo por partes

Si prefieres ir uno por uno, desde una terminal en la carpeta del proyecto:

```
node scripts\depurar-inventario.mjs                          (simulación)
node scripts\depurar-inventario.mjs --aplicar

node scripts\sincronizar-celulares.mjs                       (simulación)
node scripts\sincronizar-celulares.mjs --aplicar

node scripts\importar-responsivas.mjs --pdfs .\lote          (simulación)
node scripts\importar-responsivas.mjs --pdfs .\lote --aplicar
```

Sin `--aplicar` **nunca** escriben, y se pueden repetir sin duplicar nada.
