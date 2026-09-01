# Control Sultana

Sistema interno de Sultana Packaging. Cubre dos cosas:

- **Tecnología.** Cartas responsivas, inventario de equipo de cómputo, celulares y radios, líneas telefónicas, mantenimientos y vales de descuento.
- **Recursos Humanos.** Expedientes digitales del personal: qué documentos debe tener cada quien, cuáles faltan, cuáles vencieron y cuáles están por vencer.

Corre en la red interna, sin depender de internet ni de servicios externos.

El nombre que aparece bajo el logotipo se cambia desde *Plantillas y datos*.

## Requisitos

- Node.js 20 o más reciente (descárgalo de https://nodejs.org si no lo tienes; la versión LTS está bien).

## Cómo arrancarlo

Dentro de la carpeta del proyecto, corre estos dos comandos:

```
npm install
npm run dev
```

Y abre http://localhost:3000 en el navegador.

**La primera vez pide usuario y contraseña.** Entra con `admin` / `admin`; el sistema te va a obligar a poner una contraseña tuya antes de dejarte hacer cualquier cosa. Desde ahí se dan de alta las demás personas en *Usuarios y roles*.

La primera vez, el sistema crea solo la base de datos con las plantillas, la configuración de Sultana y unos empleados y equipos de ejemplo (marcados como "ejemplo") para que veas cómo funciona. Puedes eliminarlos desde la misma app cuando captures los reales.

Si un día prefieres correrlo en modo producción (arranca más rápido): `npm run build` una sola vez y luego `npm start`.

## Qué incluye

- **Inicio.** Panel con equipos por estado, alertas de mantenimientos vencidos o próximos (30 días) y las últimas responsivas.
- **Empleados.** Base de datos del personal: número de empleado, nombre, puesto, departamento, área, clase, jefe directo y fecha de alta. Se pueden **importar desde Excel** (pestaña EMPLEADOS) y se actualizan por número de empleado. Se desactivan sin perder su historial.
- **Inventario.** Equipos por tipo: **cómputo, teléfono/celular, radio y otros**, cada uno con sus campos propios (procesador/RAM/HD/SO/IP para PC; IMEI/línea/plan/PIN/iCloud para celular; número de equipo/estado/fallas para radio). Marca, modelo, serie, costo y estado (Disponible / Asignado / En mantenimiento / Baja). Si dejas el código vacío, se genera solo (SP-PC-001, SP-CEL-002…). Se pueden **importar desde Excel** las tres pestañas (cómputo, líneas Telcel, radios) y quedan **ligados al empleado** por su número.
- **Nueva responsiva.** Eliges el **tipo de carta** (cómputo, celular, otros equipos o **red Wi-Fi**), el empleado, el equipo disponible del tipo correspondiente (Wi-Fi no lleva equipo), el empleado firma en pantalla (mouse, dedo o stylus) y el sistema genera el **PDF con el formato oficial de Sultana** (logo, tabla de datos y las normas), con folio automático (RESP-2026-001…).
- **Responsivas.** Repositorio de todas las cartas con filtros, botón para ver/descargar cada PDF y el flujo de devolución: se registra la condición de cada equipo, el empleado firma, se genera la carta de devolución (DEV-2026-001…), los equipos vuelven a quedar disponibles y la responsiva original se cierra.
- **Mantenimientos.** Programa preventivos y correctivos por equipo, con técnico, costo y notas. Puedes marcar el equipo como "En mantenimiento" desde que lo programas, y al completarlo el equipo regresa solo a Disponible o Asignado según corresponda.
- **Expedientes digitales de RH.** Cada empleado tiene un expediente con la lista de documentos que le tocan. El sistema dice el **porcentaje de cumplimiento**, qué falta, qué venció, qué está por vencer y qué está pendiente de validar. Los documentos se cargan (varios archivos por documento: la INE tiene dos caras), se validan o se rechazan con motivo, y al renovarlos **la versión anterior se conserva**. Todo queda en el historial del expediente.
- **Configuración documental.** Sin programar nada: se definen los **tipos de documento** (si es obligatorio, si vence y cada cuánto, si hay que validarlo, quién puede verlo) y la **matriz de requisitos**, que decide a quién se le pide cada cosa —a todo el personal, a un departamento o a un puesto—. Al cambiarle el puesto a alguien, sus requisitos se recalculan solos.
- **Usuarios y roles.** Cada persona entra con su cuenta y ve únicamente lo suyo. Vienen seis roles de fábrica (superadministrador, administrador de RH, analista, validador, auditor y sistemas) y los permisos de cada uno se palomean desde la pantalla.
- **Bitácora.** Quién hizo qué, cuándo y desde qué dirección: cargas, validaciones, rechazos, descargas de documentos, cambios de permisos y también los **intentos que el sistema rechazó** por falta de permiso.
- **Plantillas y datos.** Se editan desde la app la introducción y las normas de las **cuatro cartas** (cómputo, celular, otros, Wi-Fi) con marcadores tipo `{{nombre_empleado}}`, `{{fecha}}`, `{{tabla_equipo}}`, además del nombre del sistema y del nombre, ciudad y **dirección** de la empresa que aparecen en los documentos.

## Dónde se guarda todo

- Base de datos: `data/app.db` (SQLite, un solo archivo).
- PDFs firmados: `storage/responsivas/`, nombrados por folio.
- Documentos del expediente de personal: `storage/expedientes/`, en una carpeta por empleado.

Los documentos de RH **no se sirven por dirección directa**: viven fuera de la carpeta pública y solo salen por una ruta que primero revisa el permiso de quien los pide, y deja registrada la apertura.

**Respaldo:** copia las carpetas `data` y `storage` a donde quieras (USB, red, nube). Con eso tienes todo. Si mueves el proyecto de laptop, llévate esas dos carpetas y listo.

## Actualizar a una versión nueva sin perder datos

Cuando recibas una versión nueva del código, **conserva tus carpetas `data` y `storage`**: ahí viven tu base de datos y tus PDFs. Copia los archivos nuevos del proyecto encima (sin tocar `data` ni `storage`) y vuelve a correr `npm install` y `npm run dev`. La base de datos se **actualiza sola** al arrancar (agrega las columnas y plantillas nuevas sin borrar nada).

## Detalles técnicos

Next.js 15 + TypeScript, SQLite con better-sqlite3 (sin ORM, SQL directo y transparente), pdf-lib para los PDF y signature_pad para la firma. La base y las carpetas se crean solas al primer arranque; no hay pasos de migración ni configuración.

## Cuando lo quieran migrar a un servidor

El sistema está pensado para esa transición: la capa de datos vive en `lib/db.ts`, la identidad y los permisos en `lib/auth.ts` y `lib/permisos.ts`, la lógica del expediente en `lib/expedientes-comun.ts` (lo que decide estados y porcentajes, sin tocar la base) y `lib/expedientes.ts` (las consultas). El camino natural sería Postgres en lugar de SQLite y almacenamiento de objetos para los archivos. Nada del flujo de la app cambia; solo la capa de almacenamiento.

## Sobre los datos personales

El expediente guarda INE, CURP, RFC, número de seguridad social, actas, certificados médicos y datos bancarios. En México varios de esos son **datos personales sensibles** y guardarlos concentrados trae obligaciones: aviso de privacidad, control de acceso, registro de quién los consulta y un plazo de conservación. El sistema ya trae lo técnico —cuentas, permisos por rol, niveles de confidencialidad y bitácora de cada apertura y descarga—, pero la parte legal la tiene que revisar quien lleve el tema en la empresa antes de cargar el primer documento.
