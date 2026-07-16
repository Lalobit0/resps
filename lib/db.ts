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
  correo TEXT,
  telefono TEXT,
  activo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS equipos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,
  categoria TEXT NOT NULL,
  marca TEXT NOT NULL,
  modelo TEXT NOT NULL,
  numero_serie TEXT,
  specs TEXT,
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

const PLANTILLA_ASIGNACION = `En {{ciudad}}, a {{fecha}}, el (la) que suscribe {{nombre_empleado}}, con número de empleado {{numero_empleado}}, quien desempeña el puesto de {{puesto}} en el área de {{departamento}} de {{empresa}}, hace constar que recibe en calidad de préstamo, para el desempeño de sus funciones laborales, el equipo que se describe a continuación:

{{tabla_equipos}}

Con la firma de la presente, el (la) empleado(a) se compromete a:

1. Utilizar el equipo únicamente para actividades relacionadas con su trabajo en {{empresa}}.
2. Mantener el equipo en buen estado, dándole el uso y los cuidados adecuados.
3. Reportar de inmediato al departamento de TI cualquier falla, daño, extravío o robo del equipo.
4. No instalar software sin autorización del departamento de TI, ni prestar o transferir el equipo a terceros.
5. Cubrir el costo de reparación o reposición del equipo en caso de daño, extravío o robo atribuible a negligencia o mal uso, conforme a las políticas internas de la empresa.
6. Devolver el equipo cuando la empresa lo solicite o al concluir la relación laboral, en las mismas condiciones en que fue entregado, considerando el desgaste normal por uso.

{{observaciones}}

Firmo la presente de conformidad, aceptando las condiciones aquí descritas.`;

const PLANTILLA_DEVOLUCION = `En {{ciudad}}, a {{fecha}}, el (la) que suscribe {{nombre_empleado}}, con número de empleado {{numero_empleado}}, quien desempeña el puesto de {{puesto}} en el área de {{departamento}} de {{empresa}}, hace constar que realiza la devolución al departamento de TI del equipo que se describe a continuación, mismo que le fue entregado bajo la carta responsiva con folio {{folio_origen}}:

{{tabla_equipos}}

Con la firma de la presente, el departamento de TI da por recibido el equipo en las condiciones señaladas y se da por concluida la carta responsiva {{folio_origen}}.

{{observaciones}}`;

function seed(db: Database.Database) {
  const plantillas = db.prepare("SELECT COUNT(*) AS c FROM plantillas").get() as { c: number };
  if (plantillas.c === 0) {
    const ins = db.prepare("INSERT INTO plantillas (clave, nombre, contenido) VALUES (?, ?, ?)");
    ins.run("responsiva_asignacion", "Carta responsiva (asignación de equipo)", PLANTILLA_ASIGNACION);
    ins.run("responsiva_devolucion", "Carta de devolución de equipo", PLANTILLA_DEVOLUCION);
  }

  const insConf = db.prepare("INSERT OR IGNORE INTO config (clave, valor) VALUES (?, ?)");
  insConf.run("empresa", "Sultana Packaging");
  insConf.run("ciudad", "Tijuana, Baja California");
  insConf.run("entrega_default", "Departamento de TI");

  const empleados = db.prepare("SELECT COUNT(*) AS c FROM empleados").get() as { c: number };
  if (empleados.c === 0) {
    const insEmp = db.prepare(
      "INSERT INTO empleados (numero_empleado, nombre, puesto, departamento, correo) VALUES (?, ?, ?, ?, ?)"
    );
    insEmp.run("0001", "Juan Pérez López (ejemplo)", "Supervisor de Producción", "Producción", "jperez@ejemplo.com");
    insEmp.run("0002", "María García Torres (ejemplo)", "Analista de Calidad", "Calidad", "mgarcia@ejemplo.com");

    const insEq = db.prepare(
      "INSERT INTO equipos (codigo, categoria, marca, modelo, numero_serie, specs, estado, notas) VALUES (?, ?, ?, ?, ?, ?, 'DISPONIBLE', 'Equipo de ejemplo — puedes eliminarlo')"
    );
    insEq.run("SP-LAP-001", "Laptop", "Dell", "Latitude 5440", "EJEMPLO123", "i5-1345U · 16 GB RAM · 512 GB SSD");
    insEq.run("SP-CEL-001", "Celular", "Samsung", "Galaxy A54", "EJEMPLO456", "128 GB · Telcel");
    insEq.run("SP-MON-001", "Monitor", "LG", "24MK430H", "EJEMPLO789", '24" Full HD');
    insEq.run("SP-IMP-001", "Impresora", "HP", "LaserJet Pro M404dn", "EJEMPLO012", "Láser monocromática · red");

    const eq = db.prepare("SELECT id FROM equipos WHERE codigo = 'SP-IMP-001'").get() as { id: number } | undefined;
    if (eq) {
      db.prepare(
        "INSERT INTO mantenimientos (equipo_id, tipo, descripcion, fecha_programada, tecnico) VALUES (?, 'PREVENTIVO', 'Limpieza general y revisión de rodillos (ejemplo)', date('now', '+7 day'), 'TI interno')"
      ).run(eq.id);
    }
  }
}

function crearDb(): Database.Database {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
  const db = new Database(path.join(DATA_DIR, "app.db"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  seed(db);
  return db;
}

const g = globalThis as unknown as { __controlTiDb?: Database.Database };

export const db: Database.Database = g.__controlTiDb ?? (g.__controlTiDb = crearDb());

export function getConfig(clave: string, porDefecto = ""): string {
  const r = db.prepare("SELECT valor FROM config WHERE clave = ?").get(clave) as { valor: string } | undefined;
  return r?.valor ?? porDefecto;
}
