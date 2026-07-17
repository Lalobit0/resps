import type { ReactNode } from "react";

export const inputCls =
  "w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-kraft focus:ring-2 focus:ring-kraft/20";

export const btnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-md bg-kraft px-4 py-2 text-sm font-semibold text-white hover:bg-kraft-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kraft disabled:cursor-not-allowed disabled:opacity-50";

export const btnGhost =
  "inline-flex items-center justify-center rounded-md border border-line bg-white px-3 py-1.5 text-sm font-medium text-ink hover:bg-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kraft disabled:opacity-50";

export const btnDanger =
  "inline-flex items-center justify-center rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50";

export function Label({ children }: { children: ReactNode }) {
  return <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-soft">{children}</label>;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-line bg-card p-5 shadow-sm ${className}`}>{children}</div>;
}

export function PageHeader({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-red">{eyebrow}</p>
        <h1 className="mt-1 text-2xl font-bold text-ink">{title}</h1>
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}

const TONOS: Record<string, string> = {
  verde: "bg-emerald-100 text-emerald-800 border-emerald-200",
  ambar: "bg-amber-100 text-amber-800 border-amber-200",
  rojo: "bg-red-100 text-red-800 border-red-200",
  gris: "bg-stone-100 text-stone-600 border-stone-200",
  petrol: "bg-sky-50 text-sky-700 border-sky-200",
  kraft: "bg-slate-100 text-slate-700 border-slate-300",
};

export function Badge({ tono, children }: { tono: keyof typeof TONOS; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${TONOS[tono]}`}
    >
      {children}
    </span>
  );
}

export function tonoEstadoEquipo(estado: string): keyof typeof TONOS {
  switch (estado) {
    case "DISPONIBLE":
      return "verde";
    case "ASIGNADO":
      return "petrol";
    case "MANTENIMIENTO":
      return "ambar";
    default:
      return "gris";
  }
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-paper/60 px-6 py-10 text-center text-sm text-soft">
      {children}
    </div>
  );
}

export const thCls = "px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-soft";
export const tdCls = "px-3 py-2.5 text-sm text-ink align-top";
