import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
export const STORAGE_DIR = path.join(process.cwd(), "storage", "responsivas");
export const STORAGE_ELIMINADAS = path.join(process.cwd(), "storage", "responsivas_eliminadas");
export const DB_PATH = path.join(DATA_DIR, "app.db");
export const BACKUP_DIR = path.join(DATA_DIR, "backups");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS empleados (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero_empleado TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  puesto TEXT NOT NULL,
  departamento TEXT NOT NULL,
  area TEXT,
  clase TEXT,
  supervisor TEXT,
  fecha_alta TEXT,
  correo TEXT,
  telefono TEXT,
  activo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS equipos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,
  tipo TEXT NOT NULL DEFAULT 'COMPUTO',
  categoria TEXT NOT NULL,
  marca TEXT NOT NULL,
  modelo TEXT NOT NULL,
  numero_serie TEXT,
  specs TEXT,
  detalles TEXT,
  fecha_compra TEXT,
  costo REAL,
  estado TEXT NOT NULL DEFAULT 'DISPONIBLE',
  asignado_a INTEGER REFERENCES empleados(id),
  notas TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS responsivas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  folio TEXT NOT NULL UNIQUE,
  tipo TEXT NOT NULL,
  clase TEXT NOT NULL DEFAULT 'COMPUTO',
  empleado_id INTEGER NOT NULL REFERENCES empleados(id),
  fecha TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'VIGENTE',
  responsiva_origen_id INTEGER REFERENCES responsivas(id),
  entregado_por TEXT,
  observaciones TEXT,
  pdf_path TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS responsiva_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  responsiva_id INTEGER NOT NULL REFERENCES responsivas(id),
  equipo_id INTEGER NOT NULL REFERENCES equipos(id),
  descripcion TEXT NOT NULL,
  condiciones TEXT
);

CREATE TABLE IF NOT EXISTS revisiones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL,                -- FSI03 | FSI04 | FSI05
  folio TEXT NOT NULL UNIQUE,
  fecha TEXT NOT NULL,
  empleado_id INTEGER REFERENCES empleados(id),
  equipo_id INTEGER REFERENCES equipos(id),
  realizada_por TEXT,
  resultado TEXT,                    -- SIN_HALLAZGOS | CON_HALLAZGOS
  datos TEXT,                        -- JSON: los puntos marcados y lo propio de cada formato
  observaciones TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS mantenimientos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  equipo_id INTEGER NOT NULL REFERENCES equipos(id),
  tipo TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  fecha_programada TEXT NOT NULL,
  fecha_realizada TEXT,
  estado TEXT NOT NULL DEFAULT 'PROGRAMADO',
  costo REAL,
  tecnico TEXT,
  notas TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS plantillas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clave TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  contenido TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS firmas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  puesto TEXT NOT NULL DEFAULT '',
  rol TEXT NOT NULL DEFAULT 'OTRO',
  imagen TEXT NOT NULL,
  activo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- Catálogo de conceptos del vale de descuento, con su precio tal como está
-- escrito en el formato de RH. El texto se guarda aparte del número porque el
-- documento lo lleva con letra y así se respeta palabra por palabra.
CREATE TABLE IF NOT EXISTS conceptos_vale (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  concepto TEXT NOT NULL UNIQUE,
  monto REAL NOT NULL,
  texto TEXT,
  activo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS config (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bitacora (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  accion TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  snapshot TEXT,
  revertible INTEGER NOT NULL DEFAULT 0,
  revertida INTEGER NOT NULL DEFAULT 0
);

-- Por dónde ha pasado cada equipo: quién lo tuvo, cuándo se liberó, a qué
-- área pertenecía. Las responsivas cuentan la parte firmada de la historia;
-- esto guarda los movimientos que no generan papel.
CREATE TABLE IF NOT EXISTS equipo_historial (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  equipo_id INTEGER NOT NULL REFERENCES equipos(id) ON DELETE CASCADE,
  fecha TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  accion TEXT NOT NULL,
  empleado_id INTEGER,
  -- El nombre se congela: si el empleado se borra, el histórico sigue diciendo
  -- quién lo tenía.
  empleado_texto TEXT,
  departamento TEXT,
  area TEXT,
  detalle TEXT
);

CREATE INDEX IF NOT EXISTS idx_equipo_historial ON equipo_historial (equipo_id, fecha);

-- Grupos de datos repetidos que ya se revisaron y resultaron no ser el mismo
-- aparato. Sin esto, los repetidos legítimos vuelven a salir en cada visita.
CREATE TABLE IF NOT EXISTS duplicados_revisados (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campo TEXT NOT NULL,
  valor TEXT NOT NULL,
  nota TEXT,
  fecha TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE(campo, valor)
);
`;

// ---------- Plantillas por clase de carta (intro + {{tabla_equipo}} + normas) ----------
const CIERRE_SISTEMAS =
  "El equipo debe de ser asignado y configurado exclusivamente por el área de sistemas, es responsabilidad del jefe directo notificar si el equipo ya no estará en uso.";

const PLANTILLA_COMPUTO = `Recibí de: SULTANA PACKAGING el siguiente equipo para uso exclusivo para mis actividades laborales asignadas, y consta de las siguientes características:

{{tabla_equipo}}

El usuario es responsable del equipo de cómputo asignado, se obliga a cumplir con las siguientes normas:

1. El equipo es propiedad de la empresa y se entrega bajo custodia del usuario, siendo este responsable del buen uso y manejo, y en caso de negligencia que provoque la pérdida, daño o robo de dicho equipo me obligo a pagar el activo completo o su reparación.
2. Está prohibido cualquier tipo de alteración al software o hardware del equipo. Así mismo me comprometo a reportar directamente al responsable del área cualquier anomalía en el funcionamiento del equipo.
3. Prohibido instalar, descargar o desinstalar cualquier software en el equipo asignado, esto debe ser autorizado por el gerente del área y el área de sistemas.
4. Todo empleado que copie cualquier tipo de software incurrirá en falta y quedará la empresa en libertad de ejercer su derecho conforme a lo establecido en el artículo 47 de la Ley Federal de Trabajo.
5. Todo empleado que copie información que contenga el equipo de cómputo, para entregarlo a terceros sin fines laborales, incurrirá de igual manera en falta grave y estará sujeto a lo establecido en el párrafo anterior.
6. Toda la información que se encuentre en los equipos de cómputo que tengan relación directa con las operaciones y procesos de la empresa es considerada información confidencial, por lo que su divulgación, transmisión, publicación, copia o utilización para su beneficio personal o el de cualquier tercero, será causa para la terminación de la relación laboral sin responsabilidad alguna para Sultana Packaging SA de CV de conformidad a lo que establece el artículo 134 fracción XIII de la Ley Federal de Trabajo y por otro lado que Sultana Packaging SA de CV presente la correspondiente denuncia penal en los términos del ARTÍCULO 175 DEL CÓDIGO PENAL PARA EL ESTADO DE BAJA CALIFORNIA, en Materia de Fuero Común y para toda la República en Materia de Fuero Federal.
7. ${CIERRE_SISTEMAS}`;

const PLANTILLA_CELULAR = `Recibí de: SULTANA PACKAGING el siguiente teléfono para uso exclusivo para mis actividades laborales asignadas, y consta de las siguientes características:

{{tabla_equipo}}

El usuario es responsable del equipo celular asignado, se obliga a cumplir con las siguientes normas:

1. El equipo celular es propiedad de la empresa y se entrega bajo custodia del usuario, siendo este responsable del buen uso y manejo.
2. En caso de negligencia que provoque la pérdida, daño o robo de dicho equipo me obligo a pagar el activo completo, o su reparación, o reponer el equipo por uno igual o similar en características. Este cobro puede ser descontado vía nómina en pagos o en una sola exhibición según se convenga.
3. Está prohibido cualquier tipo de alteración al software o hardware del equipo celular. Así mismo me comprometo a reportar directamente al responsable del área cualquier anomalía en el funcionamiento de este.
4. Prohibido instalar (aplicaciones que no son para uso laboral), descargar y desinstalar cualquier aplicación en el equipo celular asignado, esto debe de ser autorizado por el gerente del área y el área de sistemas.
5. Las aplicaciones/software predeterminadas y/o instaladas por el área de sistemas son para el control interno de los equipos celulares; en caso de que el equipo no tenga las aplicaciones/software o tengan algún tipo de manipulación en su configuración, esto incurrirá en una falta y se notificará a recursos humanos para la aclaración de este.
6. Toda la información que se encuentre en el equipo celular que tenga relación directa con las operaciones y procesos de la empresa es considerada información confidencial, por lo que su divulgación, transmisión, publicación, copia o utilización para su beneficio personal o el de cualquier tercero, será causa para la terminación de la relación laboral sin responsabilidad alguna para Sultana Packaging SA de CV de conformidad a lo que establece el artículo 134 fracción XIII de la Ley Federal del Trabajo y por otro lado que Sultana Packaging SA de CV presente la correspondiente denuncia penal en los términos del ARTÍCULO 175 DEL CÓDIGO PENAL PARA EL ESTADO DE BAJA CALIFORNIA, en Materia de Fuero Común y para toda la República en Materia de Fuero Federal.
7. ${CIERRE_SISTEMAS}
8. Queda prohibida la contratación de contenido, datos o extras con cargo a factura sobre el plan asignado; este costo puede ser descontado si es requerido por la gerencia.`;

const PLANTILLA_OTROS = `Recibí de: SULTANA PACKAGING el siguiente equipo para uso exclusivo para mis actividades laborales asignadas, y consta de las siguientes características:

{{tabla_equipo}}

El usuario es responsable del equipo asignado, se obliga a cumplir con las siguientes normas:

1. El equipo es propiedad de la empresa y se entrega bajo custodia del usuario, siendo este responsable del buen uso y manejo, y en caso de negligencia que provoque la pérdida, daño o robo de dicho equipo me obligo a pagar el activo completo o su reparación.
2. Está prohibido cualquier tipo de alteración al software o hardware del equipo. Así mismo me comprometo a reportar directamente al responsable del área cualquier anomalía en el funcionamiento del equipo.
${CIERRE_SISTEMAS}`;

const PLANTILLA_WIFI = `Recibí de: SULTANA PACKAGING el acceso a la red Wi-Fi. Reconozco y acepto las siguientes condiciones para el uso de la red Wi-Fi proporcionada por la empresa, con el fin de garantizar su adecuado funcionamiento y el cumplimiento de las políticas internas:

1. Uso exclusivo para actividades laborales: El acceso a la red está restringido al uso exclusivo para actividades relacionadas con el trabajo. No se permite el acceso a contenido no relacionado con la labor profesional, como entretenimiento, redes sociales, juegos en línea o navegación en sitios web no laborales.
2. Protección de datos: Los empleados y visitantes deben asegurarse de que su dispositivo esté protegido con contraseñas y con el sistema operativo actualizado.
3. Confidencialidad: El acceso a la red Wi-Fi de la empresa implica la responsabilidad de mantener la confidencialidad de la información y datos de la empresa, así como de no compartir la conexión con personas ajenas a la misma sin la debida autorización.
5. Uso responsable: El usuario se compromete a no generar un uso excesivo o ineficiente de la red Wi-Fi, evitando actividades que puedan afectar el rendimiento de la misma o interrumpir el acceso de otros usuarios.
6. Supervisión y control: La empresa se reserva el derecho de monitorear el uso de la red Wi-Fi para asegurar que se cumpla con las políticas establecidas. Cualquier actividad sospechosa o no autorizada será investigada.
7. Consecuencias por incumplimiento: El incumplimiento de las políticas de uso de la red Wi-Fi podrá resultar en la suspensión temporal o permanente del acceso a la red. Además, se aplicarán las medidas disciplinarias de acuerdo con la Ley Federal de Trabajo y/o el reglamento interno según aplique.`;

// Antes se renumeraron los puntos de corrido (1 a 6). El formato oficial en
// papel (FSI-02 Rev.00) numera 1, 2, 3, 5, 6, 7 —sin el 4—, así que la
// plantilla se alinea con él. Solo se actualiza si nadie la editó a mano.
const PLANTILLA_WIFI_ANTERIOR = PLANTILLA_WIFI.replace("\n5. Uso responsable:", "\n4. Uso responsable:")
  .replace("\n6. Supervisión y control:", "\n5. Supervisión y control:")
  .replace("\n7. Consecuencias por incumplimiento:", "\n6. Consecuencias por incumplimiento:");

// Los renglones con guiones bajos se dejan en blanco a propósito: el empleado
// los llena a mano cuando firma el papel, como en el formato de RH.
const PLANTILLA_VALE = `En {{ciudad}}, a {{fecha}}.

Yo {{nombre_empleado}}, con número de empleado {{numero_empleado}}, por medio del presente estoy de acuerdo se me realice el descuento vía nómina por concepto de: {{concepto}}

Que recibí el día ____________________________, dicho descuento será efectivo en la semana _______ del año __________, con un valor de reposición de: {{monto}}

CLAÚSULA:
Cantidad que me será descontada vía nómina en caso de robo o extravío. Estoy de acuerdo que, en caso de terminación de la relación laboral, dicho monto será descontado de mi finiquito.
Por sanidad no se recibe a devolución y su costo debe ser descontado de su último recibo de nómina a excepción de que ya haya cumplido sus 6 meses de vida.`;

// Como estaba antes de traer el formato de RH: se usa para reconocerla y
// actualizarla sin pisar la que el usuario haya editado a mano.
const PLANTILLA_VALE_ANTERIOR = `En {{ciudad}}, a {{fecha}}. Yo {{nombre_empleado}}, con número de empleado {{numero_empleado}}, por medio del presente estoy de acuerdo se me realice el descuento vía nómina por concepto de: {{concepto}}, con un valor de reposición de {{monto}}.

CLÁUSULA:
Cantidad que me será descontada vía nómina en caso de robo o extravío. Estoy de acuerdo que, en caso de terminación de la relación laboral, dicho monto será descontado de mi finiquito.
Por sanidad no se recibe en devolución y su costo debe ser descontado de su último recibo de nómina, a excepción de que ya haya cumplido sus 6 meses de vida.`;

const PLANTILLA_DEVOLUCION = `En {{ciudad}}, a {{fecha}}, el (la) que suscribe {{nombre_empleado}}, con número de empleado {{numero_empleado}}, quien desempeña el puesto de {{puesto}} en el área de {{departamento}} de {{empresa}}, hace constar que realiza la devolución al departamento de TI del equipo que se describe a continuación, mismo que le fue entregado bajo la carta responsiva con folio {{folio_origen}}:

{{tabla_equipo}}

Con la firma de la presente, el departamento de TI da por recibido el equipo en las condiciones señaladas y se da por concluida la carta responsiva {{folio_origen}}.

{{observaciones}}`;

// El tarifario que RH trae en su formato de vale. Se siembra una sola vez: a
// partir de ahí se administra desde la pantalla de vales.
const CONCEPTOS_VALE_SEED: [string, number, string][] = [
  ["CHALECO C/CINTA REFLEJANTE", 110.0, "$110.00 (CIENTO DIEZ 00/100) PESOS."],
  ["PLAYERA AZUL", 190.0, "$190.00 (CIENTO NOVENTA 00/100) PESOS."],
  ["PLAYERA ROJA", 190.0, "$190.00 (CIENTO NOVENTA 00/100) PESOS."],
  ["REP. CREDENCIAL", 50.0, "$50.00 (CINCUENTA 00/100) PESOS."],
  ["REP. GUANTES", 50.0, "$50.00 (CINCUENTA 00/100) PESOS."],
  ["REP. CINTA METRICA", 150.0, "$150.00 (CIENTO CINCUENTA 00/100) PESOS."],
  ["REP. BOTAS DE SEGURIDAD", 520.0, "$520 (QUINIENTOS VEINTE 00/100) PESOS."],
  ["REP. NAVAJA", 150.0, "$150.00 (CIENTO CINCUENTA 00/100) PESOS."],
  ["REP. CHALECO C/CINTA REFLEJANTE", 385.0, "$385.00 (TRESCIENTOS OCHENTA Y CINCO 00/100) PESOS."],
  ["REP. BOTAS DE SEGURIDAD RIVERLINE", 1200.0, "$1200.00 (MIL DOSCIENTOS 00/100) PESOS."],
  ["REP. GORRA CON LOGOS SULTANA", 100.0, "$100.00 (CIEN 00/100) PESOS."],
  ["CAJA CHICA", 450.0, "$450 (CUATROCIENTOS CINCUNTA 00/100) PESOS."],
  ["3 CAMISAS AZULES RED KAP", 485.0, "$485 (CUATROCIENTOS OCHENTA Y CINCO 00/100) PESOS POR PIEZA."],
  ["SUDADERA NEGRA SULTANA", 360.0, "$360 (TRESCIENTOS SESENTA 00/100) PESOS."],
  ["CHAMARRA NEGRA SULTANA", 750.0, "$750 (SETECIENTOS 00/100) PESOS POR PIEZA."],
  ["1 BOTAS DE SEGURIDAD PROCLIFF", 800.0, "$800 (OCHOCIENTOS 00/100) PESOS."],
  ["1 CHALECO GUINDA C/CINTA REFLEJANTE", 600.0, "$600 (SEISCIENTOS 00/100) PESOS POR PIEZA."],
  ["REP. FLEXOMETRO", 150.0, "$150.00 (CIENTO CINCUENTA 00/100) PESOS."],
  ["REP. NAVAJA GRIS", 210.0, "$210.00 (DOSCIENTOS DIEZ 00/100) PESOS."],
  ["REP. GUANTES DE NEOPRENO", 120.0, "$120.00 (CIENTO VEINTE 00/100) PESOS."],
  ["POLOS ADMINISTRATIVAS", 550.0, "$550.00 (QUINIENTOS CINCUENTA 00/100) PESOS PIEZA."],
  ["BOTAS DE SEGURIDAD", 520.0, "$520 (QUINIENTOS VEINTE 00/100) PESOS."],
  ["GORRA CON LOGOS SULTANA", 100.0, "$100.00 (CIEN 00/100) PESOS."],
  ["CALCULADORA ELECTRONICA", 125.0, "$125.00 (CIENTO VEINTICINCO 00/100) PESOS."],
  ["2 POLOS ADMINISTRATIVAS", 550.0, "$550 (QUINIENTOS CINCUENTA 00/100) PESOS POR PIEZA."],
  ["PANTALON AZUL MARINO RED KAP", 550.0, "$550 (QUINIENTOS CINCUENTA 00/100) PESOS POR PIEZA."],
  ["3 POLOS BLANCAS", 470.0, "$470 (CUATROCIENTOS SETENTA 00/100) PESOS POR PIEZA."],
  ["2 PANTALONES AZULES", 495.0, "$495 (CUATROCIENTOS NOVENTA Y CINCO 00/100) PESOS POR PIEZA."],
  ["2 PLAYERAS AZUL MARINO", 190.0, "$190.00 (CIENTO NOVENTA 00/100) PESOS POR PIEZA.."],
  ["2 PLAYERAS ROJAS", 190.0, "$190.00 (CIENTO NOVENTA 00/100) PESOS POR PIEZA.."],
  ["REP. RADIO PORTATIL TXPRO", 600.0, "$600 (SEISCIENTOS 00/100) PESOS."],
  ["RADIO PORTATIL TXPRO", 450.0, "$450 (CUATROCIENTOS CINCUNTA 00/100) PESOS."],
  ["AURICULAR RADIO PORTATIL", 200.0, "$200.00 (DOSCIENTOS 00/100) PESOS."],
  ["REP AURICULAR RADIO PORTATIL", 150.0, "$150.00 (CIENTO CINCUENTA 00/100) PESOS."],
  ["REP. RADIO PORTATIL KENWOOD", 1470.0, "$1470 (MIL CUATROCIENTOS CIENCUENTA 00/100) PESOS."],
  ["DIADEMA PARA PC", 600.0, "$600 (SEISCIENTOS 00/100) PESOS."],
  ["CAMARA PC", 550.0, "$550.00 (QUINIENTOS CINCUENTA 00/100) PESOS PIEZA."],
];

const PLANTILLAS_SEED: [string, string, string][] = [
  ["carta_computo", "Carta responsiva — Equipo de cómputo", PLANTILLA_COMPUTO],
  ["carta_celular", "Carta responsiva — Equipo celular", PLANTILLA_CELULAR],
  ["carta_otros", "Carta responsiva — Otros equipos", PLANTILLA_OTROS],
  ["carta_wifi", "Carta responsiva — Uso de red Wi-Fi", PLANTILLA_WIFI],
  ["vale_descuento", "Vale de descuento de nómina", PLANTILLA_VALE],
  ["responsiva_devolucion", "Carta de devolución de equipo", PLANTILLA_DEVOLUCION],
];

function columnas(db: Database.Database, tabla: string): string[] {
  return (db.prepare(`PRAGMA table_info(${tabla})`).all() as { name: string }[]).map((r) => r.name);
}

function agregarColumna(db: Database.Database, tabla: string, col: string, tipoSql: string) {
  if (columnas(db, tabla).includes(col)) return;
  try {
    db.exec(`ALTER TABLE ${tabla} ADD COLUMN ${col} ${tipoSql}`);
  } catch (e) {
    // Si dos procesos abren la base a la vez pueden intentar la misma columna:
    // que ya exista no es un error.
    if (!/duplicate column name/i.test(String(e))) throw e;
  }
}

// Migración idempotente: añade columnas nuevas a bases de datos ya existentes sin perder datos.
function migrar(db: Database.Database) {
  agregarColumna(db, "empleados", "area", "TEXT");
  agregarColumna(db, "empleados", "clase", "TEXT");
  agregarColumna(db, "empleados", "supervisor", "TEXT");
  agregarColumna(db, "empleados", "fecha_alta", "TEXT");
  agregarColumna(db, "equipos", "tipo", "TEXT NOT NULL DEFAULT 'COMPUTO'");
  agregarColumna(db, "equipos", "detalles", "TEXT");
  agregarColumna(db, "responsivas", "clase", "TEXT NOT NULL DEFAULT 'COMPUTO'");
  agregarColumna(db, "responsivas", "origen", "TEXT NOT NULL DEFAULT 'SISTEMA'");
  // Firmas y datos guardados para poder regenerar el PDF cuando la autoridad
  // (jefe de sistemas / RH) firma digitalmente después.
  agregarColumna(db, "responsivas", "firma_autoridad", "TEXT");
  agregarColumna(db, "responsivas", "firma_empleado", "TEXT");
  agregarColumna(db, "responsivas", "concepto", "TEXT");
  agregarColumna(db, "responsivas", "monto", "REAL");
  // Quién firmó del lado de la empresa (y si lo hizo por ausencia del titular).
  agregarColumna(db, "responsivas", "firma_autoridad_nombre", "TEXT");
  agregarColumna(db, "responsivas", "firma_autoridad_puesto", "TEXT");
  agregarColumna(db, "responsivas", "firma_autoridad_ausencia", "INTEGER NOT NULL DEFAULT 0");
  // La responsiva se imprime, se firma en papel y se sube escaneada.
  agregarColumna(db, "responsivas", "pdf_firmado", "TEXT");
  agregarColumna(db, "responsivas", "fecha_firma", "TEXT");
  // Tanda en la que se generó de golpe, para reimprimirla completa y para
  // repartir después el escaneo de las cartas firmadas página por página.
  agregarColumna(db, "responsivas", "lote", "TEXT");
  // El área a la que pertenece el equipo, aparte de quién lo tenga. Cuando el
  // dueño se va, el aparato sigue siendo de Contabilidad y ahí se reasigna.
  agregarColumna(db, "equipos", "departamento", "TEXT");
  agregarColumna(db, "equipos", "area", "TEXT");
  // Cómo está clasificado el aparato: administrativo, de producción, de sala…
  agregarColumna(db, "equipos", "clasificacion", "TEXT");
  // Baja del empleado: cuándo dejó la empresa y por qué.
  agregarColumna(db, "empleados", "fecha_baja", "TEXT");
  agregarColumna(db, "empleados", "motivo_baja", "TEXT");
  // Deriva el tipo de los equipos capturados antes de la migración
  db.exec("UPDATE equipos SET tipo='CELULAR' WHERE categoria='Celular' AND (tipo IS NULL OR tipo='COMPUTO')");
  // A los equipos que ya están entregados se les copia el área de su dueño:
  // así el dato existe desde el primer arranque y no solo hacia adelante.
  db.exec(`UPDATE equipos SET
             departamento = COALESCE(departamento, (SELECT em.departamento FROM empleados em WHERE em.id = equipos.asignado_a)),
             area = COALESCE(area, (SELECT em.area FROM empleados em WHERE em.id = equipos.asignado_a))
           WHERE asignado_a IS NOT NULL AND (departamento IS NULL OR area IS NULL)`);
}

function seed(db: Database.Database) {
  const insPl = db.prepare("INSERT OR IGNORE INTO plantillas (clave, nombre, contenido) VALUES (?, ?, ?)");
  for (const [clave, nombre, contenido] of PLANTILLAS_SEED) insPl.run(clave, nombre, contenido);

  // La plantilla de Wi-Fi se corrige para que su numeración coincida con el
  // formato oficial; si el usuario ya la editó, no se toca.
  db.prepare("UPDATE plantillas SET contenido = ? WHERE clave = 'carta_wifi' AND contenido = ?").run(
    PLANTILLA_WIFI,
    PLANTILLA_WIFI_ANTERIOR
  );

  // El vale pasó al formato de RH, con los renglones que se llenan a mano.
  db.prepare("UPDATE plantillas SET contenido = ? WHERE clave = 'vale_descuento' AND contenido = ?").run(
    PLANTILLA_VALE,
    PLANTILLA_VALE_ANTERIOR
  );

  const insCon = db.prepare("INSERT OR IGNORE INTO conceptos_vale (concepto, monto, texto) VALUES (?, ?, ?)");
  for (const [concepto, monto, texto] of CONCEPTOS_VALE_SEED) insCon.run(concepto, monto, texto);

  const insConf = db.prepare("INSERT OR IGNORE INTO config (clave, valor) VALUES (?, ?)");
  insConf.run("empresa", "Sultana Packaging");
  insConf.run("ciudad", "Tijuana, Baja California");
  insConf.run("entrega_default", "Departamento de TI");
  insConf.run(
    "direccion",
    "Av. Palmera 12341 Parque Industrial El Florido, Sección La Encantada, Tijuana B.C. México, CP 22225   Tel: (664) 622 8862"
  );
  insConf.run("firma_empleado", "Nombre, Firma y No. de empleado quien recibe");
  insConf.run("firma_sistemas", "Nombre y firma del Jefe de sistemas");
  insConf.run("firma_rh", "RECURSOS HUMANOS");
}

// Si hay un respaldo marcado para restaurar (app.db.restore), se intercambia
// ANTES de abrir la conexión: así el archivo nunca se toca con la base abierta.
function aplicarRestauracionPendiente() {
  const pendiente = `${DB_PATH}.restore`;
  if (!fs.existsSync(pendiente)) return;
  for (const ext of ["", "-wal", "-shm"]) {
    try {
      fs.rmSync(`${DB_PATH}${ext}`, { force: true });
    } catch {
      // si no existe, seguimos
    }
  }
  fs.renameSync(pendiente, DB_PATH);
}

function crearDb(): Database.Database {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
  fs.mkdirSync(STORAGE_ELIMINADAS, { recursive: true });
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  aplicarRestauracionPendiente();
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  migrar(db);
  seed(db);
  return db;
}

const g = globalThis as unknown as { __controlTiDb?: Database.Database };

export const db: Database.Database = g.__controlTiDb ?? (g.__controlTiDb = crearDb());

export function getConfig(clave: string, porDefecto = ""): string {
  const r = db.prepare("SELECT valor FROM config WHERE clave = ?").get(clave) as { valor: string } | undefined;
  return r?.valor ?? porDefecto;
}
