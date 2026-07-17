export function hoyISO(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${dia}`;
}

/** "2026-07-15" -> "15 de julio de 2026" */
export function fechaLarga(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  if (!a || !m || !d) return iso;
  const fecha = new Date(a, m - 1, d);
  return fecha.toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
}

/** "2026-07-15" -> "15/07/2026" */
export function fechaCorta(iso: string | null): string {
  if (!iso) return "—";
  const [a, m, d] = iso.split("-");
  if (!a || !m || !d) return iso;
  return `${d}/${m}/${a}`;
}

export function dinero(n: number | null): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
}

/** Días de diferencia entre hoy y una fecha ISO (negativo = ya pasó) */
export function diasPara(iso: string): number {
  const [a, m, d] = iso.split("-").map(Number);
  const objetivo = new Date(a, (m || 1) - 1, d || 1).getTime();
  const hoy = new Date();
  const base = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime();
  return Math.round((objetivo - base) / 86400000);
}

const UNIDADES = ["", "UNO", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE"];
const ESPECIALES: Record<number, string> = {
  10: "DIEZ", 11: "ONCE", 12: "DOCE", 13: "TRECE", 14: "CATORCE", 15: "QUINCE",
  16: "DIECISÉIS", 17: "DIECISIETE", 18: "DIECIOCHO", 19: "DIECINUEVE", 20: "VEINTE",
  21: "VEINTIUNO", 22: "VEINTIDÓS", 23: "VEINTITRÉS", 24: "VEINTICUATRO", 25: "VEINTICINCO",
  26: "VEINTISÉIS", 27: "VEINTISIETE", 28: "VEINTIOCHO", 29: "VEINTINUEVE",
};
const DECENAS = ["", "", "", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"];
const CENTENAS = ["", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS", "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"];

function centenasATexto(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "CIEN";
  const c = Math.floor(n / 100);
  const resto = n % 100;
  let out = CENTENAS[c];
  if (resto) {
    let dec = "";
    if (resto < 10) dec = UNIDADES[resto];
    else if (resto <= 29) dec = ESPECIALES[resto];
    else {
      const d = Math.floor(resto / 10);
      const u = resto % 10;
      dec = DECENAS[d] + (u ? ` Y ${UNIDADES[u]}` : "");
    }
    out = out ? `${out} ${dec}` : dec;
  }
  return out;
}

/** Convierte un entero (0..999,999) a palabras en mayúsculas */
export function numeroALetras(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return "CERO";
  if (n < 1000) return centenasATexto(n);
  const miles = Math.floor(n / 1000);
  const resto = n % 1000;
  const milesTxt = miles === 1 ? "MIL" : `${centenasATexto(miles)} MIL`;
  return resto ? `${milesTxt} ${centenasATexto(resto)}` : milesTxt;
}

/** "$450.00 (CUATROCIENTOS CINCUENTA PESOS 00/100 M.N.)" */
export function montoEnLetra(valor: number): string {
  if (Number.isNaN(valor)) return "";
  const entero = Math.floor(valor);
  const centavos = Math.round((valor - entero) * 100);
  const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(valor);
  return `${money} (${numeroALetras(entero)} PESOS ${String(centavos).padStart(2, "0")}/100 M.N.)`;
}
