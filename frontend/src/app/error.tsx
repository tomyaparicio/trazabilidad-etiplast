"use client"

/**
 * Cartel de error para TODO lo que está fuera del dashboard: login, página no
 * encontrada, impresión. Sin esto, un error ahí caía en global-error.tsx, que
 * es el último recurso (dibuja su propio <html> y no puede usar el tema ni los
 * componentes del sistema). Mismo lenguaje y mismos botones que el del dashboard.
 */

import { useCallback, useEffect, useState } from "react"
import { AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  armarDetalleDeError,
  primerasLineasDeStack,
  type ErrorConDigest,
} from "@/lib/errores/desfasaje"
import { intentarRecargaPorActualizacion, versionDelBuild } from "@/lib/errores/auto-recarga"
import { copiarAlPortapapeles } from "@/lib/errores/portapapeles"
import { useContextoDelError } from "@/lib/errores/usar-contexto-del-error"

export default function ErrorDeLaApp({
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

  if (recargando) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-8 text-center"
      >
        <p className="text-3xl font-bold text-foreground">Se actualizó el sistema</p>
        <p className="text-xl text-muted-foreground">Estamos recargando la página…</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 p-8">
      <div className="rounded-2xl bg-destructive/10 border border-destructive/20 p-5">
        <AlertTriangle className="w-10 h-10 text-destructive" strokeWidth={1.5} />
      </div>

      <div className="max-w-xl space-y-3 text-center">
        <h2 className="text-2xl font-bold text-foreground">Esta pantalla tuvo un problema</h2>
        <p className="text-lg text-muted-foreground">
          No se perdió nada de lo que ya habías guardado. Probá con{" "}
          <strong className="text-foreground">Recargar el sistema</strong>. Si vuelve a pasar, tocá{" "}
          <strong className="text-foreground">Copiar detalle</strong> y mandáselo a soporte.
        </p>
      </div>

      {/* El detalle técnico va a la vista para que el reporte sirva: con el
          mensaje solo no se distingue un problema de versión de un bug real. */}
      <div className="w-full max-w-xl max-h-64 overflow-y-auto rounded-xl border border-border bg-muted/40 p-4 text-left leading-relaxed break-words">
        {/* Primero lo que el usuario puede leer y repetir por teléfono. */}
        {contexto.ruta && <div className="text-base font-semibold text-foreground">Pantalla: {contexto.ruta}</div>}
        {contexto.fechaHora && (
          <div className="text-base font-semibold text-foreground">Cuándo: {contexto.fechaHora}</div>
        )}
        {error.digest && (
          <div className="text-base font-semibold text-foreground">Referencia: {error.digest}</div>
        )}
        {/* Y recién después lo técnico, rotulado: es para soporte, no para él. */}
        <p className="mt-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Datos para soporte — no hace falta que los entiendas
        </p>
        <div className="font-mono text-sm text-foreground/80">{error.message || "sin detalle"}</div>
        {primerasLineasDeStack(error.stack).map((linea, i) => (
          <div key={i} className="font-mono text-xs text-muted-foreground/80">
            {linea}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        {/* Recargar primero: «Reintentar» vuelve a dibujar la MISMA pantalla con
            el mismo código ya cargado en memoria, así que casi nunca alcanza. */}
        <Button
          onClick={() => window.location.reload()}
          className="bg-brand hover:bg-brand-strong text-white rounded-xl px-6 py-5 text-base"
        >
          Recargar el sistema
        </Button>
        <Button onClick={copiar} variant="outline" className="rounded-xl px-6 py-5 text-base">
          Copiar detalle
        </Button>
        <Button onClick={reset} variant="ghost" className="rounded-xl px-6 py-5 text-base">
          Reintentar
        </Button>
      </div>

      <p aria-live="polite" className="min-h-6 text-base text-muted-foreground">
        {copiado === true && "Copiado. Pegalo en un mensaje para soporte."}
        {copiado === false && "No se pudo copiar. Sacale una foto a este recuadro."}
      </p>
    </div>
  )
}
