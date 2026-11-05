"use client"

/**
 * Bloque del dashboard: qué hay en cada máquina, ahora.
 *
 * Versión corta del tablero de `/planificacion`, con el mismo dato (los
 * escaneos del QR) y el mismo refresco. Acá se muestra apretado: lo que
 * importa de un vistazo es cuántas máquinas están trabajando y si hay algún
 * pedido que nadie ubicó.
 */
import { api } from "@/lib/api"
import type { TableroProduccion } from "@/lib/api/types"
import { ArrowRight, CircleSlash, Factory } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"

const REFRESCO_MS = 15_000

export function PlantaEnVivo() {
  const [datos, setDatos] = useState<TableroProduccion | null>(null)
  const [falló, setFalló] = useState(false)

  useEffect(() => {
    let vivo = true
    const traer = () =>
      api.produccion.tablero()
        .then((d) => { if (vivo) { setDatos(d); setFalló(false) } })
        .catch(() => { if (vivo) setFalló(true) })
    traer()
    const t = setInterval(traer, REFRESCO_MS)
    return () => { vivo = false; clearInterval(t) }
  }, [])

  // Si el tablero no responde, el bloque no aparece: es información de apoyo,
  // no vale romperle el dashboard a nadie por esto.
  if (falló || !datos) return null

  // Dos orígenes, una sola lista: lo que está en una impresora (con nombre de
  // máquina) y lo que está en una etapa que no elige máquina (con el nombre de
  // la etapa). Para el que mira el dashboard es lo mismo: dónde está cada cosa.
  const trabajando = [
    ...datos.maquinas
      .filter((m) => m.orden)
      .map((m) => ({ clave: `m${m.id}`, orden: m.orden!, donde: m.nombre })),
    ...datos.etapas.flatMap((e) =>
      e.ordenes.map((o) => ({ clave: `e${e.etapa}-${o.id}`, orden: o, donde: e.titulo })),
    ),
  ]

  return (
    <section className="eti-in rounded-3xl border border-border bg-card p-5 sm:p-6">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            <Factory className="size-3.5" />
            En planta ahora
          </p>
          <h2 className="mt-1.5 font-display text-[25px] tracking-tight text-foreground">
            {trabajando.length === 1
              ? "1 trabajo en planta"
              : `${trabajando.length} trabajos en planta`}
          </h2>
        </div>
        <Link
          href="/planificacion"
          className="inline-flex items-center gap-1.5 border-b-2 border-gold pb-0.5 text-[13.5px] font-semibold text-foreground hover:text-brand"
        >
          Ver tablero <ArrowRight className="size-3.5" />
        </Link>
      </div>

      {trabajando.length === 0 ? (
        <p className="py-4 text-base font-semibold text-muted-foreground">
          No hay ningún trabajo escaneado en este momento.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {trabajando.map((t) => (
            <li key={t.clave} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-base font-extrabold text-foreground">
                  {t.orden.producto ?? t.orden.numero}
                </p>
                <p className="truncate text-sm font-semibold text-muted-foreground">
                  {t.orden.cliente}
                </p>
              </div>
              <span className="shrink-0 rounded-lg bg-brand/10 px-3 py-1 text-sm font-bold text-brand">
                {t.donde}
              </span>
            </li>
          ))}
        </ul>
      )}

      {datos.resumen.sin_ubicar > 0 && (
        <p className="mt-4 flex items-center gap-2 rounded-xl border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-base font-bold text-amber-700 dark:text-amber-400">
          <CircleSlash className="size-5 shrink-0" />
          {datos.resumen.sin_ubicar} en producción sin escanear: no se sabe dónde están.
        </p>
      )}
    </section>
  )
}
