"use client"

import { useEffect, useState } from "react"
import { esErrorDeVersionVieja } from "@/lib/errores/desfasaje"

/**
 * Red de seguridad para cuando subimos una versión nueva y alguien tiene el
 * sistema abierto: la pestaña vieja pide archivos que el deploy nuevo ya no
 * tiene y explota.
 *
 * POR QUÉ ACÁ Y NO SÓLO EN LOS CARTELES DE ERROR: muchos de esos fallos no
 * pasan durante el dibujado de una pantalla (y entonces React no los atrapa),
 * sino al precargar una pantalla, al abrir algo desde un botón o al bajar un
 * archivo de la app. Esos llegan como evento de la ventana y, sin esto, quedan
 * en la consola mientras el usuario ve una pantalla que no responde.
 *
 * ACÁ NO SE RECARGA SOLO. La app sigue viva: el usuario puede estar a mitad del
 * alta de un cliente, y una recarga le borraría todo lo cargado. Se muestra un
 * aviso que no tapa nada y él decide cuándo. La recarga automática sí ocurre en
 * los carteles de error (global-error / error de dashboard), porque ahí la
 * pantalla ya se cayó y no hay nada que perder.
 */
export function RecargaPorActualizacion() {
  const [hayVersionNueva, setHayVersionNueva] = useState(false)

  useEffect(() => {
    const avisar = () => setHayVersionNueva(true)

    const alRomperse = (evento: ErrorEvent) => {
      // Un archivo de la app que no se pudo bajar (un <script> o un <link> de
      // /_next/static) NO llega con mensaje ni con error: se reconoce por el
      // elemento que lo disparó. Y no burbujea, por eso se escucha en captura.
      const destino = evento.target
      if (destino && destino !== window) {
        const url =
          (destino as HTMLScriptElement).src ?? (destino as HTMLLinkElement).href ?? ""
        if (typeof url === "string" && url.includes("/_next/static/")) return avisar()
        return
      }
      if (esErrorDeVersionVieja(evento.error ?? evento.message)) avisar()
    }
    const alRechazarsePromesa = (evento: PromiseRejectionEvent) => {
      if (esErrorDeVersionVieja(evento.reason)) avisar()
    }

    window.addEventListener("error", alRomperse, true)
    window.addEventListener("unhandledrejection", alRechazarsePromesa)
    return () => {
      window.removeEventListener("error", alRomperse, true)
      window.removeEventListener("unhandledrejection", alRechazarsePromesa)
    }
  }, [])

  if (!hayVersionNueva) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-0 z-[9999] flex flex-wrap items-center justify-center gap-3 border-t border-gold/40 bg-card px-5 py-4 shadow-2xl"
    >
      <p className="text-[17px] font-semibold text-foreground">
        Se actualizó el sistema. Recargá para seguir con la versión nueva.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-xl bg-brand px-5 py-2.5 text-[16px] font-bold text-white hover:bg-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
      >
        Recargar ahora
      </button>
      <button
        type="button"
        onClick={() => setHayVersionNueva(false)}
        className="rounded-xl px-4 py-2.5 text-[16px] font-semibold text-muted-foreground hover:text-foreground"
      >
        Ahora no
      </button>
    </div>
  )
}
