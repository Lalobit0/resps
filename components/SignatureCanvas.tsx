"use client";

import { useEffect, useRef } from "react";
import SignaturePad from "signature_pad";
import { btnGhost } from "./ui";

export default function SignatureCanvas({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const pad = new SignaturePad(canvas, {
      penColor: "#1c1a16",
      minWidth: 1,
      maxWidth: 2.4,
    });
    padRef.current = pad;

    const redimensionar = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      canvas.getContext("2d")?.scale(ratio, ratio);
      pad.clear();
      onChangeRef.current(null);
    };
    redimensionar();
    window.addEventListener("resize", redimensionar);

    const alTerminarTrazo = () => {
      onChangeRef.current(pad.isEmpty() ? null : pad.toDataURL("image/png"));
    };
    pad.addEventListener("endStroke", alTerminarTrazo);

    return () => {
      window.removeEventListener("resize", redimensionar);
      pad.off();
    };
  }, []);

  const limpiar = () => {
    padRef.current?.clear();
    onChangeRef.current(null);
  };

  return (
    <div>
      <div className="rounded-md border-2 border-dashed border-line bg-white">
        <canvas ref={canvasRef} className="h-40 w-full touch-none" />
      </div>
      <div className="mt-2 flex items-center justify-between">
        <p className="text-xs text-soft">Firma con el mouse, el dedo o un stylus.</p>
        <button type="button" onClick={limpiar} className={btnGhost}>
          Limpiar firma
        </button>
      </div>
    </div>
  );
}
