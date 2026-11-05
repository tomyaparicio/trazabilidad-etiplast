"use client"

/**
 * Tablero de planta — dónde está cada pedido, en vivo.
 *
 * Una tarjeta por máquina con el trabajo que tiene encima. Todo sale de los
 * escaneos del QR: no hay carga manual en esta pantalla, sólo lectura.
 *
 * Se refresca sola cada 15 segundos. Polling y no websockets a propósito: el
 * backend duerme en Railway y una conexión abierta se cae igual; además una
 * planta no cambia de estado cinco veces por segundo. 15 segundos es «en vivo»
 * de sobra para esto, y no hay infraestructura nueva que mantener.
 */
import { PageContainer } from "@/components/ui/page-container"
import { PageHeader } from "@/components/ui/page-header"
import { api } from "@/lib/api"
import type { MaquinaTablero, OrdenEnMaquina, TableroProduccion } from "@/lib/api/types"
import {
  AlertCircle, CircleSlash, Factory, Loader2, RefreshCw, Wrench,
} from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useState } from "react"

const REFRESCO_MS = 15_000

const GRUPOS: { tipo: string; titulo: string }[] = [
  { tipo: "extrusion",  titulo: "Extrusión"  },
  { tipo: "impresion",  titulo: "Impresión"  },
  { tipo: "troquelado", titulo: "Troquelado" },
]

/** «Hace 2 h 15 min», que es como lo lee alguien parado en la planta. */
function desdeHace(iso: string | null): string {
  if (!iso) return ""
  const minutos = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (minutos < 1) return "recién"
  if (minutos < 60) return `hace ${minutos} min`
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  return m ? `hace ${h} h ${m} min` : `hace ${h} h`
}

export default function PlanificacionPage() {
  const [datos, setDatos]       = useState<TableroProduccion | null>(null)
  const [error, setError]       = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)

  const traer = useCallback(async (silencioso = false) => {
    if (!silencioso) setCargando(true)
    try {
      setDatos(await api.produccion.tablero())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer el tablero")
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    traer()
    const t = setInterval(() => traer(true), REFRESCO_MS)
    return () => clearInterval(t)
  }, [traer])

  return (
    <PageContainer>
      <PageHeader
        icon={Factory}
        title="Tablero de planta"
        subtitle="Dónde está cada pedido, según el último escaneo"
      />

      {datos && (
        <div className="mb-6 flex flex-wrap gap-3">
          <Chip label="Impresoras trabajando" valor={datos.resumen.ocupadas} />
          <Chip label="Impresoras libres" valor={datos.resumen.libres} />
          <Chip label="En extrusión o troquelado" valor={datos.resumen.en_etapas} />
          <Chip
            label="Sin ubicar"
            valor={datos.resumen.sin_ubicar}
            alerta={datos.resumen.sin_ubicar > 0}
          />
          <button
            type="button"
            onClick={() => traer()}
            className="ml-auto flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`h-4 w-4 ${cargando ? "animate-spin" : ""}`} />
            Actualizar
          </button>
        </div>
      )}

      {error && (
        <p className="mb-6 flex items-center gap-2 rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-3 text-base font-semibold text-red-700 dark:text-red-400">
          <AlertCircle className="h-5 w-5 shrink-0" />
          {error}
        </p>
      )}

      {cargando && !datos ? (
        <div className="flex items-center gap-3 py-16 text-lg font-semibold text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          Leyendo la planta…
        </div>
      ) : datos ? (
        <div className="flex flex-col gap-8">
          {/* En el orden del proceso: extrusión → impresión → troquelado.
              Impresión se abre en una tarjeta por máquina (Venus y las otras
              hacen cosas distintas); las otras dos en una sola tarjeta con los
              trabajos que están en esa etapa, porque ahí las máquinas son
              intercambiables y no se elige ninguna. */}
          {GRUPOS.map(({ tipo, titulo }) => {
            const impresoras = datos.maquinas.filter(
              (m) => (m.tipo ?? "").toLowerCase() === tipo,
            )
            const columna = datos.etapas.find((e) => e.etapa === tipo)

            if (impresoras.length === 0 && !columna) return null

            return (
              <section key={tipo}>
                <h2 className="mb-3 text-lg font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
                  {titulo}
                </h2>
                {impresoras.length > 0 ? (
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {impresoras.map((m) => <TarjetaMaquina key={m.id} maquina={m} />)}
                  </div>
                ) : (
                  <TarjetaEtapa ordenes={columna!.ordenes} />
                )}
              </section>
            )
          })}

          {datos.sin_ubicar.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-lg font-extrabold uppercase tracking-[0.14em] text-amber-600">
                <CircleSlash className="h-5 w-5" />
                En producción, sin escanear
              </h2>
              <p className="mb-3 text-base font-semibold text-muted-foreground">
                Arrancaron pero nadie las escaneó, así que el sistema no sabe en qué
                máquina están.
              </p>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {datos.sin_ubicar.map((o) => (
                  <Link
                    key={o.id}
                    href={`/ordenes?buscar=${o.numero}`}
                    className="rounded-xl border-2 border-amber-500/40 bg-amber-500/5 px-4 py-3 transition hover:border-amber-500"
                  >
                    <p className="text-lg font-extrabold text-foreground">{o.numero}</p>
                    <p className="text-base font-semibold text-muted-foreground">{o.cliente}</p>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      ) : null}
    </PageContainer>
  )
}

function Chip({ label, valor, alerta }: { label: string; valor: number; alerta?: boolean }) {
  return (
    <div
      className={`rounded-xl border-2 px-4 py-2 ${
        alerta ? "border-amber-500 bg-amber-500/10" : "border-border bg-card"
      }`}
    >
      <span className="text-2xl font-extrabold tabular-nums text-foreground">{valor}</span>
      <span className="ml-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
    </div>
  )
}

/**
 * Una etapa que no elige máquina: lo único que importa es qué hay adentro.
 *
 * No se dibuja una tarjeta por máquina porque no las distingue nadie: en
 * extrusión y troquelado las máquinas son intercambiables.
 */
function TarjetaEtapa({ ordenes }: { ordenes: OrdenEnMaquina[] }) {
  if (ordenes.length === 0) {
    return (
      <p className="rounded-2xl border-2 border-dashed border-border bg-muted/30 px-5 py-6 text-xl font-bold text-muted-foreground">
        Sin trabajos en esta etapa
      </p>
    )
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {ordenes.map((o) => (
        <Link
          key={o.id}
          href={`/ordenes?buscar=${o.numero}`}
          className="rounded-2xl border-2 border-brand bg-card p-5 transition hover:border-brand-strong"
        >
          <p className="text-2xl font-extrabold leading-tight text-foreground">
            {o.producto ?? "Sin producto cargado"}
          </p>
          <p className="mt-1 text-lg font-bold text-brand">{o.numero}</p>
          <p className="text-base font-semibold text-foreground">{o.cliente}</p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold text-muted-foreground">
            {o.operario && <span>{o.operario}</span>}
            <span>{desdeHace(o.desde)}</span>
          </div>
        </Link>
      ))}
    </div>
  )
}

function TarjetaMaquina({ maquina }: { maquina: MaquinaTablero }) {
  const ocupada = maquina.orden

  return (
    <div
      className={`rounded-2xl border-2 p-5 ${
        ocupada ? "border-brand bg-card" : "border-dashed border-border bg-muted/30"
      }`}
    >
      <div className="mb-3 flex items-center gap-2">
        <Wrench className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-extrabold uppercase tracking-[0.16em] text-muted-foreground">
          {maquina.nombre}
        </span>
      </div>

      {!ocupada ? (
        <p className="py-3 text-xl font-bold text-muted-foreground">Libre</p>
      ) : (
        <Link href={`/ordenes?buscar=${ocupada.numero}`} className="block">
          <p className="text-2xl font-extrabold leading-tight text-foreground">
            {ocupada.producto ?? "Sin producto cargado"}
          </p>
          <p className="mt-1 text-lg font-bold text-brand">{ocupada.numero}</p>
          <p className="text-base font-semibold text-foreground">{ocupada.cliente}</p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold text-muted-foreground">
            {ocupada.operario && <span>{ocupada.operario}</span>}
            <span>{desdeHace(ocupada.desde)}</span>
            {ocupada.lote && <span className="font-mono">{ocupada.lote}</span>}
          </div>
        </Link>
      )}
    </div>
  )
}
