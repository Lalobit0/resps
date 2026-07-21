"use client";

/** Botones para descargar la tabla filtrada como Excel o PDF. */
export default function ExportarBotones({ tabla, params }: { tabla: string; params: Record<string, string> }) {
  const limpio = Object.entries(params).filter(([, v]) => v && v.trim());
  const url = (formato: string) => {
    const qs = new URLSearchParams([...limpio, ["formato", formato]]).toString();
    return `/api/export/${tabla}?${qs}`;
  };
  const cls =
    "inline-flex items-center gap-1 rounded-md border border-line bg-white px-2.5 py-1.5 text-xs font-medium text-ink hover:bg-paper";
  return (
    <div className="flex items-center gap-1.5">
      <a href={url("xlsx")} className={cls} title="Descargar en Excel">
        ⬇ Excel
      </a>
      <a href={url("pdf")} className={cls} title="Descargar en PDF">
        ⬇ PDF
      </a>
    </div>
  );
}
