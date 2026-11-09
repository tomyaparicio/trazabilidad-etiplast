"use client"

import { Skeleton } from "@/components/ui/skeleton"

export interface KpiData {
  totalOts: number
  completadas: number
  enProceso: number
  /**
   * Porcentaje a tiempo (0-100), o null cuando ninguna orden del rango tiene
   * plazo cargado. Null y no 0: un 0% afirma que ninguna salió en término, y
   * no tener con qué medir es otra cosa.
   */
  pctATiempo: number | null
  /** Sobre cuántas órdenes se calculó. Va SIEMPRE junto al porcentaje. */
  muestrasATiempo: number
  /** Órdenes sin terminar con el plazo ya vencido. */
  atrasadasAbiertas: number
  itemsBajoStock: number
}

// Tarjeta KPI monocroma — mismo lenguaje que el dashboard: número (font-display) +
// regla amarilla (bg-gold). El acento ámbar queda sólo para la alerta de bajo stock.
function KpiCard({
  label, value, sub, alert,
}: {
  label: string
  value: number | string
  sub?: string
  alert?: boolean
}) {
  const nf = new Intl.NumberFormat("es-AR")
  return (
    <div className="rounded-2xl border border-border bg-card/80 p-5 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className={`mt-2 text-[32px] leading-none tabular-nums font-display ${alert ? "text-amber-600 dark:text-amber-400" : "text-foreground"}`}>
        {typeof value === "number" ? nf.format(value) : value}
      </p>
      <div className="my-3 h-[3px] w-8 rounded-full bg-gold" />
      {sub && <p className="text-xs font-medium text-muted-foreground">{sub}</p>}
    </div>
  )
}

/**
 * Skeleton del grid de KPIs — mismas dimensiones/grid que KpiCards para que no
 * haya salto de layout cuando los datos reales reemplazan el placeholder.
 */
export function KpiCardsSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-border bg-card/80 p-5 shadow-sm">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 h-8 w-16" />
          <Skeleton className="my-3 h-[3px] w-8 rounded-full" />
          <Skeleton className="h-3 w-28" />
        </div>
      ))}
    </div>
  )
}

/** Grid de tarjetas KPI del reporte. */
export function KpiCards({ data }: { data: KpiData }) {
  const nf = new Intl.NumberFormat("es-AR")
  const pctTexto = data.pctATiempo != null ? `${data.pctATiempo}%` : "—"

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      <KpiCard
        label="Total OTs"
        value={data.totalOts}
        sub="En el rango seleccionado"
      />
      <KpiCard
        label="Completadas"
        value={data.completadas}
        sub={
          data.totalOts > 0
            ? `${Math.round((data.completadas / data.totalOts) * 100)}% del total`
            : "Sin órdenes"
        }
      />
      <KpiCard
        label="En proceso"
        value={data.enProceso}
        sub="Órdenes activas"
      />
      {/* El porcentaje NUNCA va solo: sin el denominador, un 100% sobre dos
          órdenes se lee igual que sobre doscientas. Las órdenes cargadas antes
          de que existiera el campo de plazo no tienen con qué medirse y quedan
          fuera de la cuenta, así que la muestra puede ser mucho menor que el
          total de OTs del rango — y eso tiene que verse. */}
      <KpiCard
        label="A tiempo"
        value={pctTexto}
        sub={
          data.pctATiempo != null
            ? `Sobre ${nf.format(data.muestrasATiempo)} ${data.muestrasATiempo === 1 ? "orden con plazo" : "órdenes con plazo"}`
            : "Ninguna orden del rango tiene plazo cargado"
        }
      />
      <KpiCard
        label="Atrasadas"
        value={data.atrasadasAbiertas}
        alert={data.atrasadasAbiertas > 0}
        sub={
          data.atrasadasAbiertas > 0
            ? "Sin terminar y con el plazo vencido"
            : "Ninguna abierta pasada de fecha"
        }
      />
      <KpiCard
        label="Bajo stock"
        value={data.itemsBajoStock}
        alert={data.itemsBajoStock > 0}
        sub={
          data.itemsBajoStock > 0
            ? `${nf.format(data.itemsBajoStock)} ítems bajo mínimo`
            : "Stock en niveles"
        }
      />
    </div>
  )
}
