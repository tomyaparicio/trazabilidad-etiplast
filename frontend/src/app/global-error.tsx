"use client"

import { useEffect } from "react"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <html lang="es">
      <body style={{ margin: 0, background: "#0d0d1a", color: "#fff", fontFamily: "sans-serif", display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div style={{ textAlign: "center", padding: "2rem" }}>
          <p style={{ fontSize: "3rem", marginBottom: "1rem" }}>⚠️</p>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.5rem" }}>
            Error crítico
          </h2>
          <p style={{ color: "#888", fontSize: "0.875rem", marginBottom: "1rem" }}>
            La aplicación encontró un error inesperado.
          </p>

          {/* Sin esto el boundary se traga el error y no hay nada que reportar:
              el usuario ve "error inesperado" y nadie puede saber qué pasó. */}
          <p style={{
            color: "#bbb", fontSize: "0.8rem", marginBottom: "1.5rem", maxWidth: 480,
            background: "#1a1a2e", border: "1px solid #2c2c44", borderRadius: "0.5rem",
            padding: "0.75rem 1rem", textAlign: "left", wordBreak: "break-word",
            fontFamily: "ui-monospace, monospace",
          }}>
            {error.message || "sin detalle"}
            {error.digest && (
              <><br /><span style={{ color: "#777" }}>ref: {error.digest}</span></>
            )}
          </p>
          <p style={{ color: "#666", fontSize: "0.75rem", marginBottom: "1.5rem" }}>
            Si vuelve a pasar, sacale una foto a este recuadro.
          </p>
          <button
            onClick={reset}
            style={{ background: "#292d96", color: "#fff", border: "none", borderRadius: "0.75rem", padding: "0.6rem 1.5rem", cursor: "pointer", fontSize: "0.875rem" }}
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  )
}
