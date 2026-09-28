"use client"

import { useCallback, useEffect, useState } from "react"
import {
  armarDetalleDeError,
  primerasLineasDeStack,
  type ErrorConDigest,
} from "@/lib/errores/desfasaje"
import { intentarRecargaPorActualizacion, versionDelBuild } from "@/lib/errores/auto-recarga"
import { copiarAlPortapapeles } from "@/lib/errores/portapapeles"
import { useContextoDelError } from "@/lib/errores/usar-contexto-del-error"

// Este cartel reemplaza TODA la página (hasta el <html>), así que no hay
// globals.css ni Tailwind acá: los estilos van en línea a propósito.
// Todo grande y con mucho contraste: los usuarios del sistema son gente grande.
// El hex del azul de marca va a mano porque sin globals.css no existen los
// tokens de color (bg-brand): es la única pantalla donde no queda otra.
const AZUL_MARCA = "#292d96"

export default function GlobalError({
  error,
  reset,
}: {
  error: ErrorConDigest
  reset: () => void
}) {
  // Si el error es "subieron una versión nueva y tu pestaña quedó vieja",
  // recargamos una sola vez en lugar de mostrarle un cartel que no entiende.
  // Se decide en el primer dibujado (el ayudante es idempotente: nunca programa
  // dos recargas) para que el aviso salga sin un re-dibujado de más.
  const [recargando] = useState(() => intentarRecargaPorActualizacion(error))
  const [copiado, setCopiado] = useState<null | boolean>(null)
  const contexto = useContextoDelError()

  useEffect(() => {
    console.error(error)
  }, [error])

  const detalle = armarDetalleDeError({
    nombre: error.name,
    mensaje: error.message,
    stack: error.stack,
    digest: error.digest,
    ruta: contexto.ruta,
    fechaHora: contexto.fechaHora,
    version: versionDelBuild(),
    navegador: typeof navigator === "undefined" ? "" : navigator.userAgent,
  })

  const copiar = useCallback(async () => {
    setCopiado(await copiarAlPortapapeles(detalle))
  }, [detalle])

  const lineasDeStack = primerasLineasDeStack(error.stack)

  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          background: "#0b0d1e",
          color: "#f3f4fc",
          fontFamily: "system-ui, sans-serif",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          padding: "1.5rem",
        }}
      >
        {recargando ? (
          <div style={{ textAlign: "center" }} role="status" aria-live="polite">
            <p style={{ fontSize: "2rem", fontWeight: 700, margin: "0 0 0.75rem" }}>
              Se actualizó el sistema
            </p>
            <p style={{ fontSize: "1.25rem", color: "#c3c6e4", margin: 0 }}>
              Estamos recargando la página…
            </p>
          </div>
        ) : (
          <div style={{ maxWidth: 620, width: "100%" }}>
            <p style={{ fontSize: "3rem", margin: "0 0 0.5rem", textAlign: "center" }}>⚠️</p>
            <h1
              style={{
                fontSize: "1.9rem",
                fontWeight: 700,
                margin: "0 0 0.75rem",
                textAlign: "center",
              }}
            >
              El sistema tuvo un problema
            </h1>
            <p
              style={{
                fontSize: "1.15rem",
                lineHeight: 1.5,
                color: "#c3c6e4",
                margin: "0 0 1.5rem",
                textAlign: "center",
              }}
            >
              No se perdió nada de lo que ya habías guardado. Probá con{" "}
              <strong>Recargar el sistema</strong>. Si vuelve a pasar, tocá{" "}
              <strong>Copiar detalle</strong> y mandáselo a soporte.
            </p>

            {/* Sin esto el cartel no sirve para reportar: el mensaje solo no
                distingue un problema de versión de un error de verdad. */}
            <div
              style={{
                background: "#141733",
                border: "1px solid #2c2f52",
                borderRadius: "0.75rem",
                padding: "1rem",
                marginBottom: "1.25rem",
                textAlign: "left",
                fontFamily: "ui-monospace, monospace",
                fontSize: "0.95rem",
                lineHeight: 1.6,
                color: "#dcdef0",
                wordBreak: "break-word",
                maxHeight: "16rem",
                overflowY: "auto",
              }}
            >
              {/* Primero lo que el usuario puede leer y repetir por teléfono. */}
              {contexto.ruta && <div style={{ fontWeight: 700 }}>Pantalla: {contexto.ruta}</div>}
              {contexto.fechaHora && (
                <div style={{ fontWeight: 700 }}>Cuándo: {contexto.fechaHora}</div>
              )}
              {error.digest && <div style={{ fontWeight: 700 }}>Referencia: {error.digest}</div>}
              {/* Y recién después lo técnico, rotulado: es para soporte, no para él. */}
              <div style={{ color: "#9ea2cd", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: "0.75rem" }}>
                Datos para soporte — no hace falta que los entiendas
              </div>
              <div style={{ color: "#c9cce8" }}>{error.message || "sin detalle"}</div>
              {lineasDeStack.map((linea, i) => (
                <div key={i} style={{ color: "#8a8fbe", fontSize: "0.85rem" }}>
                  {linea}
                </div>
              ))}
            </div>

            <div
              style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", justifyContent: "center" }}
            >
              <button
                onClick={() => window.location.reload()}
                style={{
                  background: AZUL_MARCA,
                  color: "#fff",
                  border: "none",
                  borderRadius: "0.75rem",
                  padding: "0.85rem 1.75rem",
                  cursor: "pointer",
                  fontSize: "1.05rem",
                  fontWeight: 600,
                }}
              >
                Recargar el sistema
              </button>
              <button
                onClick={copiar}
                style={{
                  background: "transparent",
                  color: "#f3f4fc",
                  border: "1px solid #4a4e82",
                  borderRadius: "0.75rem",
                  padding: "0.85rem 1.5rem",
                  cursor: "pointer",
                  fontSize: "1.05rem",
                  fontWeight: 600,
                }}
              >
                Copiar detalle
              </button>
              {/* `reset` vuelve a dibujar la misma pantalla sin recargar: sirve
                  cuando fue algo momentáneo, por eso queda como opción chica. */}
              <button
                onClick={reset}
                style={{
                  background: "transparent",
                  color: "#9ea2cd",
                  border: "none",
                  borderRadius: "0.75rem",
                  padding: "0.85rem 1rem",
                  cursor: "pointer",
                  fontSize: "1.05rem",
                }}
              >
                Reintentar
              </button>
            </div>

            <p
              aria-live="polite"
              style={{
                textAlign: "center",
                fontSize: "1rem",
                color: copiado === false ? "#ffb4b4" : "#9ea2cd",
                minHeight: "1.5rem",
                margin: "1rem 0 0",
              }}
            >
              {copiado === true && "Copiado. Pegalo en un mensaje para soporte."}
              {copiado === false && "No se pudo copiar. Sacale una foto a este recuadro."}
            </p>
          </div>
        )}
      </body>
    </html>
  )
}
