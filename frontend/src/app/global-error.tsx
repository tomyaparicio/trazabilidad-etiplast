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
          <p style={{ color: "#888", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
            La aplicación encontró un error inesperado.
          </p>
          <button
            onClick={reset}
            style={{ background: "#1a1866", color: "#fff", border: "none", borderRadius: "0.75rem", padding: "0.6rem 1.5rem", cursor: "pointer", fontSize: "0.875rem" }}
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  )
}
