"use client"

import {
  ClipboardList, CheckCircle2, Loader2, Timer, PackageX,
} from "lucide-react"

export interface KpiData {
  totalOts: number
  completadas: number
  enProceso: number
  /** Porcentaje a tiempo (0-100) o null si no es calculable. */
  pctATiempo: number | null
  itemsBajoStock: number
}

function KpiCard({
  label, value, sub, icon: Icon, numClass, iconClass, iconBg,
}: {
  label: string
  value: number | string
  sub?: string
  icon: React.ElementType
  numClass: string
  iconClass: string
  iconBg: string
}) {
  const nf = new Intl.NumberFormat("es-AR")
  return (
    <div className="flex flex-col justify-between rounded-2xl border border-border bg-card/80 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground">{label}</p>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${iconBg}`}>
          <Icon className={`w-4 h-4 ${iconClass}`} strokeWidth={1.8} />
        </div>
      </div>
      <div>
        <p className={`text-3xl font-black tabular-nums leading-none ${numClass}`}>
          {typeof value === "number" ? nf.format(value) : value}
        </p>
        {sub && <p className="text-xs text-muted-foreground mt-1.5">{sub}</p>}
      </div>
    </div>
  )
}

/** Grid de tarjetas KPI del reporte. */
export function KpiCards({ data }: { data: KpiData }) {
  const nf = new Intl.NumberFormat("es-AR")
  const pctTexto = data.pctATiempo != null ? `${data.pctATiempo}%` : "—"

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
      <KpiCard
        label="Total OTs"
        value={data.totalOts}
        sub="En el rango seleccionado"
        icon={ClipboardList}
        numClass="text-indigo-600 dark:text-[#a5b4fc]"
        iconClass="text-indigo-600 dark:text-[#a5b4fc]"
        iconBg="bg-indigo-500/10 border-indigo-500/20 dark:bg-indigo-400/15 dark:border-indigo-400/30"
      />
      <KpiCard
        label="Completadas"
        value={data.completadas}
        sub={
          data.totalOts > 0
            ? `${Math.round((data.completadas / data.totalOts) * 100)}% del total`
            : "Sin órdenes"
        }
        icon={CheckCircle2}
        numClass="text-emerald-600 dark:text-[#4ade80]"
        iconClass="text-emerald-600 dark:text-[#4ade80]"
        iconBg="bg-emerald-500/10 border-emerald-500/20 dark:bg-green-400/15 dark:border-green-400/30"
      />
      <KpiCard
        label="En proceso"
        value={data.enProceso}
        sub="Órdenes activas"
        icon={Loader2}
        numClass="text-blue-600 dark:text-[#60a5fa]"
        iconClass="text-blue-600 dark:text-[#60a5fa]"
        iconBg="bg-blue-500/10 border-blue-500/20 dark:bg-blue-400/15 dark:border-blue-400/30"
      />
      <KpiCard
        label="A tiempo"
        value={pctTexto}
        sub={data.pctATiempo != null ? "Entregas dentro de fecha" : "Sin datos de entrega"}
        icon={Timer}
        numClass="text-violet-600 dark:text-[#e879f9]"
        iconClass="text-violet-600 dark:text-[#e879f9]"
        iconBg="bg-violet-500/10 border-violet-500/20 dark:bg-fuchsia-400/15 dark:border-fuchsia-400/30"
      />
      <KpiCard
        label="Bajo stock"
        value={data.itemsBajoStock}
        sub={
          data.itemsBajoStock > 0
            ? `${nf.format(data.itemsBajoStock)} ítems bajo mínimo`
            : "Stock en niveles"
        }
        icon={PackageX}
        numClass={
          data.itemsBajoStock > 0
            ? "text-amber-600 dark:text-amber-400"
            : "text-foreground"
        }
        iconClass="text-amber-600 dark:text-amber-400"
        iconBg="bg-amber-500/10 border-amber-500/20 dark:bg-amber-400/15 dark:border-amber-400/30"
      />
    </div>
  )
}
