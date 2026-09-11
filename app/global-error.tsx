"use client";

import { useEffect, useState } from "react";
import { esVersionVieja, recargarUnaVez } from "../lib/errores-comun";

/**
 * Cuando truena el marco entero.
 *
 * Es el único lugar que atrapa un error del layout raíz —el menú, la campana,
 * la sesión—, y por eso tiene que traer su propio <html> y su propio <body>:
 * a estas alturas el layout ya no existe.
 *
 * El caso normal es que el sistema se haya actualizado con la pantalla
 * abierta. Eso se resuelve solo, recargando.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [recargando, setRecargando] = useState(false);

  useEffect(() => {
    if (esVersionVieja(error)) setRecargando(recargarUnaVez());
  }, [error]);

  return (
    <html lang="es">
      <body style={{ margin: 0, minHeight: "100vh", background: "#f6f5f2", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div
            style={{
              maxWidth: 520,
              width: "100%",
              background: "#fff",
              border: "1px solid #e3e1dc",
              borderRadius: 12,
              padding: 28,
              boxShadow: "0 10px 30px rgba(0,0,0,.06)",
            }}
          >
            {recargando ? (
              <>
                <h1 style={{ margin: 0, fontSize: 20, color: "#1f1f21" }}>Actualizando el sistema…</h1>
                <p style={{ marginTop: 10, fontSize: 14, color: "#6b6b70", lineHeight: 1.5 }}>
                  Se publicó una versión nueva mientras tenías esto abierto. La pantalla se está recargando sola; no
                  hace falta que hagas nada.
                </p>
              </>
            ) : (
              <>
                <h1 style={{ margin: 0, fontSize: 20, color: "#1f1f21" }}>Algo se atoró</h1>
                <p style={{ marginTop: 10, fontSize: 14, color: "#6b6b70", lineHeight: 1.5 }}>
                  La pantalla no pudo cargar. Casi siempre se arregla volviéndola a cargar. Si sigue igual, avísale a
                  Sistemas con la clave de abajo.
                </p>
                <div style={{ marginTop: 18, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    onClick={() => reset()}
                    style={{
                      background: "#003764",
                      color: "#fff",
                      border: 0,
                      borderRadius: 8,
                      padding: "9px 16px",
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Volver a intentar
                  </button>
                  <a
                    href="/"
                    style={{
                      background: "#fff",
                      color: "#1f1f21",
                      border: "1px solid #e3e1dc",
                      borderRadius: 8,
                      padding: "9px 16px",
                      fontSize: 14,
                      fontWeight: 500,
                      textDecoration: "none",
                    }}
                  >
                    Ir al inicio
                  </a>
                </div>
                {error.digest ? (
                  <p style={{ marginTop: 16, fontSize: 12, color: "#9a9aa0", fontFamily: "ui-monospace, monospace" }}>
                    Clave del error: {error.digest}
                  </p>
                ) : null}
              </>
            )}
          </div>
        </div>
      </body>
    </html>
  );
}
