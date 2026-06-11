"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { api } from "@/lib/api"
import { descargarCSV } from "@/lib/csv"
import { BarChart3, Users } from "lucide-react"
import { KpiCards, type KpiData } from "./_components/kpi-cards"
import { ReportesToolbar } from "./_components/reportes-toolbar"
import { OrdenesLineChart, type OrdenesSeriePunto } from "@/components/charts/ordenes-line-chart"
import { ProduccionBarChart, type ProduccionPunto } from "@/components/charts/produccion-bar-chart"
import { TiemposEtapaChart, type TiempoEtapa } from "@/components/charts/tiempos-etapa-chart"

// ─── Helpers de fecha ───────────────────────────────────────────────────────
function isoHoy(): string {
  return new Date().toISOString().slice(0, 10)
}
function isoHaceMeses(n: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - n)
  return d.toISOString().slice(0, 10)
}

// ─── Tipos de respuesta (parseo defensivo) ──────────────────────────────────
interface ResumenResp {
  total_ots?: number
  completadas?: number
  en_proceso?: number
  pct_a_tiempo?: number | null
  items_bajo_stock?: number
}
interface ProduccionResp { data?: ProduccionPunto[] }
interface TiemposResp { disponible?: boolean; etapas?: TiempoEtapa[] }
interface SeriesResp { data?: OrdenesSeriePunto[] }
interface ClientesTopResp {
  data?: Array<{ cliente_id: number; marca: string; ots: number; cantidad: number }>
}

const AGRUPACIONES = [
  { value: "maquina", label: "Máquina" },
  { value: "cliente", label: "Cliente" },
  { value: "operador", label: "Operador" },
  { value: "mes", label: "Mes" },
] as const
type Agrupacion = (typeof AGRUPACIONES)[number]["value"]

export default function ReportesPage() {
  const [desde, setDesde] = useState(() => isoHaceMeses(3))
  const [hasta, setHasta] = useState(() => isoHoy())
  const [agrupar, setAgrupar] = useState<Agrupacion>("maquina")

  const [kpi, setKpi] = useState<KpiData | null>(null)
  const [produccion, setProduccion] = useState<ProduccionPunto[]>([])
  const [tiempos, setTiempos] = useState<TiemposResp>({ disponible: false, etapas: [] })
  const [serie, setSerie] = useState<OrdenesSeriePunto[]>([])
  const [topClientes, setTopClientes] = useState<ClientesTopResp["data"]>([])
  const [cargando, setCargando] = useState(true)

  const rango = useMemo(() => ({ desde, hasta }), [desde, hasta])

  // Carga de KPIs + datos dependientes del rango.
  const cargarRango = useCallback(() => {
    setCargando(true)
    Promise.allSettled([
      api.reportes.resumen(rango),
      api.reportes.produccion({ ...rango, agrupar }),
      api.reportes.tiempos(rango),
    ]).then(([resR, prodR, tiempoR]) => {
      if (resR.status === "fulfilled") {
        const r = resR.value as ResumenResp
        setKpi({
          totalOts: r.total_ots ?? 0,
          completadas: r.completadas ?? 0,
          enProceso: r.en_proceso ?? 0,
          pctATiempo: r.pct_a_tiempo ?? null,
          itemsBajoStock: r.items_bajo_stock ?? 0,
        })
      } else {
        setKpi({ totalOts: 0, completadas: 0, enProceso: 0, pctATiempo: null, itemsBajoStock: 0 })
      }
      setProduccion(prodR.status === "fulfilled" ? (prodR.value as ProduccionResp).data ?? [] : [])
      setTiempos(tiempoR.status === "fulfilled" ? (tiempoR.value as TiemposResp) : { disponible: false, etapas: [] })
      setCargando(false)
    })
  }, [rango, agrupar])

  // Serie temporal (independiente del rango: últimos 12 meses).
  useEffect(() => {
    api.reportes.ordenesSeries(12)
      .then((r) => setSerie((r as SeriesResp).data ?? []))
      .catch(() => setSerie([]))
    api.reportes.clientesTop(8)
      .then((r) => setTopClientes((r as ClientesTopResp).data ?? []))
      .catch(() => setTopClientes([]))
  }, [])

  useEffect(() => {
    cargarRango()
  }, [cargarRango])

  // Exportar la producción del rango actual a CSV.
  const handleExport = useCallback(() => {
    const filas = produccion.map((p) => ({
      grupo: p.grupo,
      ots: p.ots,
      cantidad: p.cantidad,
      kg: p.kg,
    }))
    descargarCSV(`produccion_${agrupar}_${desde}_a_${hasta}`, filas)
  }, [produccion, agrupar, desde, hasta])

  const nf = new Intl.NumberFormat("es-AR")

  return (
    <div className="p-6 lg:p-8 space-y-5 max-w-[1200px] mx-auto">

      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <div className="w-1 h-6 rounded-full bg-[#1a1866]" />
        <div>
          <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[#1a1866]" />
            Reportes
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            KPIs de producción, tiempos y stock
          </p>
        </div>
      </div>

      {/* ── Toolbar: rango + export ── */}
      <ReportesToolbar
        desde={desde}
        hasta={hasta}
        onDesde={setDesde}
        onHasta={setHasta}
        onExport={handleExport}
        exportDisabled={produccion.length === 0}
      />

      {/* ── KPI cards ── */}
      {kpi && <KpiCards data={kpi} />}

      {/* ── Selector de agrupación + chart de producción ── */}
      <div className="space-y-3">
        <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-card/60 p-1">
          {AGRUPACIONES.map((a) => (
            <button
              key={a.value}
              onClick={() => setAgrupar(a.value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                agrupar === a.value
                  ? "bg-gold/10 text-gold border border-gold/30"
                  : "text-muted-foreground hover:text-foreground border border-transparent"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
        <ProduccionBarChart
          data={produccion}
          metrica="cantidad"
          titulo="Producción"
          subtitulo={`Unidades por ${AGRUPACIONES.find((a) => a.value === agrupar)?.label.toLowerCase()}${cargando ? " · cargando…" : ""}`}
        />
      </div>

      {/* ── Serie temporal + tiempos entre etapas ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <OrdenesLineChart data={serie} />
        <TiemposEtapaChart etapas={tiempos.etapas ?? []} disponible={!!tiempos.disponible} />
      </div>

      {/* ── Top clientes ── */}
      <div className="bg-card/80 border border-border rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="rounded-xl bg-chart-1/10 border border-chart-1/20 p-2.5">
            <Users className="w-5 h-5 text-chart-1" strokeWidth={1.5} />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">Top clientes</h3>
            <p className="text-sm text-muted-foreground">Por cantidad de órdenes de trabajo</p>
          </div>
        </div>
        {(topClientes ?? []).length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Sin órdenes registradas
          </div>
        ) : (
          <div className="space-y-1">
            {(topClientes ?? []).map((c, i) => {
              const max = (topClientes ?? [])[0]?.ots || 1
              const pct = Math.round((c.ots / max) * 100)
              return (
                <div key={c.cliente_id} className="flex items-center gap-3 px-2 py-2">
                  <span className="text-xs font-bold tabular-nums text-muted-foreground w-5 shrink-0">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm text-secondary-foreground truncate">{c.marca}</span>
                      <span className="text-xs text-muted-foreground tabular-nums shrink-0 ml-3">
                        {nf.format(c.ots)} OTs · {nf.format(c.cantidad)} u.
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#6366f1]/80"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

    </div>
  )
}
