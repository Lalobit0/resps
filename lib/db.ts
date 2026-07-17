import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
export const STORAGE_DIR = path.join(process.cwd(), "storage", "responsivas");

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

CREATE TABLE IF NOT EXISTS config (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
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
4. Uso responsable: El usuario se compromete a no generar un uso excesivo o ineficiente de la red Wi-Fi, evitando actividades que puedan afectar el rendimiento de la misma o interrumpir el acceso de otros usuarios.
5. Supervisión y control: La empresa se reserva el derecho de monitorear el uso de la red Wi-Fi para asegurar que se cumpla con las políticas establecidas. Cualquier actividad sospechosa o no autorizada será investigada.
6. Consecuencias por incumplimiento: El incumplimiento de las políticas de uso de la red Wi-Fi podrá resultar en la suspensión temporal o permanente del acceso a la red. Además, se aplicarán las medidas disciplinarias de acuerdo con la Ley Federal de Trabajo y/o el reglamento interno según aplique.`;

const PLANTILLA_VALE = `En {{ciudad}}, a {{fecha}}. Yo {{nombre_empleado}}, con número de empleado {{numero_empleado}}, por medio del presente estoy de acuerdo se me realice el descuento vía nómina por concepto de: {{concepto}}, con un valor de reposición de {{monto}}.

CLÁUSULA:
Cantidad que me será descontada vía nómina en caso de robo o extravío. Estoy de acuerdo que, en caso de terminación de la relación laboral, dicho monto será descontado de mi finiquito.
Por sanidad no se recibe en devolución y su costo debe ser descontado de su último recibo de nómina, a excepción de que ya haya cumplido sus 6 meses de vida.`;

const PLANTILLA_DEVOLUCION = `En {{ciudad}}, a {{fecha}}, el (la) que suscribe {{nombre_empleado}}, con número de empleado {{numero_empleado}}, quien desempeña el puesto de {{puesto}} en el área de {{departamento}} de {{empresa}}, hace constar que realiza la devolución al departamento de TI del equipo que se describe a continuación, mismo que le fue entregado bajo la carta responsiva con folio {{folio_origen}}:

{{tabla_equipo}}

Con la firma de la presente, el departamento de TI da por recibido el equipo en las condiciones señaladas y se da por concluida la carta responsiva {{folio_origen}}.

{{observaciones}}`;

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
  if (!columnas(db, tabla).includes(col)) {
    db.exec(`ALTER TABLE ${tabla} ADD COLUMN ${col} ${tipoSql}`);
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
  // Deriva el tipo de los equipos capturados antes de la migración
  db.exec("UPDATE equipos SET tipo='CELULAR' WHERE categoria='Celular' AND (tipo IS NULL OR tipo='COMPUTO')");
}

function seed(db: Database.Database) {
  const insPl = db.prepare("INSERT OR IGNORE INTO plantillas (clave, nombre, contenido) VALUES (?, ?, ?)");
  for (const [clave, nombre, contenido] of PLANTILLAS_SEED) insPl.run(clave, nombre, contenido);

  const insConf = db.prepare("INSERT OR IGNORE INTO config (clave, valor) VALUES (?, ?)");
  insConf.run("empresa", "Sultana Packaging");
  insConf.run("ciudad", "Tijuana, Baja California");
  insConf.run("entrega_default", "Departamento de TI");
  insConf.run(
    "direccion",
    "Av. Palmera 12341 Parque Industrial El Florido, Sección La Encantada, Tijuana B.C. México, CP 22225   Tel: (664) 622 8862"
  );
}

function crearDb(): Database.Database {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
  const db = new Database(path.join(DATA_DIR, "app.db"));
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
