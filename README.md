# Control TI · Sultana Packaging

Sistema local para el departamento de TI: cartas responsivas con firma digital en pantalla, inventario de equipo de cómputo y celulares, y control de mantenimientos. Todo corre en tu laptop, sin depender de internet ni de servicios externos.

## Requisitos

- Node.js 20 o más reciente (descárgalo de https://nodejs.org si no lo tienes; la versión LTS está bien).

## Cómo arrancarlo

Dentro de la carpeta del proyecto, corre estos dos comandos:

```
npm install
npm run dev
```

Y abre http://localhost:3000 en el navegador. Listo.

La primera vez, el sistema crea solo la base de datos con las plantillas, la configuración de Sultana y unos empleados y equipos de ejemplo (marcados como "ejemplo") para que veas cómo funciona. Puedes eliminarlos desde la misma app cuando captures los reales.

Si un día prefieres correrlo en modo producción (arranca más rápido): `npm run build` una sola vez y luego `npm start`.

## Qué incluye

- **Inicio.** Panel con equipos por estado, alertas de mantenimientos vencidos o próximos (30 días) y las últimas responsivas.
- **Empleados.** Base de datos del personal: número de empleado, nombre, puesto, departamento, área, clase, jefe directo y fecha de alta. Se pueden **importar desde Excel** (pestaña EMPLEADOS) y se actualizan por número de empleado. Se desactivan sin perder su historial.
- **Inventario.** Equipos por tipo: **cómputo, teléfono/celular, radio y otros**, cada uno con sus campos propios (procesador/RAM/HD/SO/IP para PC; IMEI/línea/plan/PIN/iCloud para celular; número de equipo/estado/fallas para radio). Marca, modelo, serie, costo y estado (Disponible / Asignado / En mantenimiento / Baja). Si dejas el código vacío, se genera solo (SP-PC-001, SP-CEL-002…). Se pueden **importar desde Excel** las tres pestañas (cómputo, líneas Telcel, radios) y quedan **ligados al empleado** por su número.
- **Nueva responsiva.** Eliges el **tipo de carta** (cómputo, celular, otros equipos o **red Wi-Fi**), el empleado, el equipo disponible del tipo correspondiente (Wi-Fi no lleva equipo), el empleado firma en pantalla (mouse, dedo o stylus) y el sistema genera el **PDF con el formato oficial de Sultana** (logo, tabla de datos y las normas), con folio automático (RESP-2026-001…).
- **Responsivas.** Repositorio de todas las cartas con filtros, botón para ver/descargar cada PDF y el flujo de devolución: se registra la condición de cada equipo, el empleado firma, se genera la carta de devolución (DEV-2026-001…), los equipos vuelven a quedar disponibles y la responsiva original se cierra.
- **Mantenimientos.** Programa preventivos y correctivos por equipo, con técnico, costo y notas. Puedes marcar el equipo como "En mantenimiento" desde que lo programas, y al completarlo el equipo regresa solo a Disponible o Asignado según corresponda.
- **Plantillas y datos.** Se editan desde la app la introducción y las normas de las **cuatro cartas** (cómputo, celular, otros, Wi-Fi) con marcadores tipo `{{nombre_empleado}}`, `{{fecha}}`, `{{tabla_equipo}}`, además del nombre, ciudad y **dirección** de la empresa que aparecen en los documentos.

## Dónde se guarda todo

- Base de datos: `data/app.db` (SQLite, un solo archivo).
- PDFs firmados: `storage/responsivas/`, nombrados por folio.

**Respaldo:** copia las carpetas `data` y `storage` a donde quieras (USB, red, nube). Con eso tienes todo. Si mueves el proyecto de laptop, llévate esas dos carpetas y listo.

## Actualizar a una versión nueva sin perder datos

Cuando recibas una versión nueva del código, **conserva tus carpetas `data` y `storage`**: ahí viven tu base de datos y tus PDFs. Copia los archivos nuevos del proyecto encima (sin tocar `data` ni `storage`) y vuelve a correr `npm install` y `npm run dev`. La base de datos se **actualiza sola** al arrancar (agrega las columnas y plantillas nuevas sin borrar nada).

## Detalles técnicos

Next.js 15 + TypeScript, SQLite con better-sqlite3 (sin ORM, SQL directo y transparente), pdf-lib para los PDF y signature_pad para la firma. La base y las carpetas se crean solas al primer arranque; no hay pasos de migración ni configuración.

## Cuando lo quieran migrar a un servidor

El sistema está pensado para esa transición: la capa de datos vive en `lib/db.ts`, la generación de PDF en `lib/pdf.ts` y toda la lógica en las server actions de cada módulo. El camino natural sería Postgres (Supabase) en lugar de SQLite, Supabase Storage para los PDF, autenticación para que no cualquiera entre, y desplegarlo en Vercel o en un servidor interno. Nada del flujo de la app cambia; solo la capa de almacenamiento y el login.

Mientras sea local y de un solo usuario, no necesita contraseña: nadie más que tú tiene acceso a tu laptop.
