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

## Alternativa sin instalar nada: ponerlo en línea

Si las actualizaciones se vuelven muy frecuentes, la opción más cómoda es **hospedarlo**
(Supabase + Vercel). Ahí yo publico el cambio y tú solo **refrescas el navegador**: cero
instalaciones, cero comandos, y lo puede usar más gente. Requiere una migración inicial
de la base de datos, pero después las actualizaciones son instantáneas.
