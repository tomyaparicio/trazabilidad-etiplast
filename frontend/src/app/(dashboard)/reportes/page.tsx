"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { PageContainer } from "@/components/ui/page-container"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { descargarCSV } from "@/lib/csv"
import { AlertCircle, BarChart3, RefreshCw, TrendingUp, Users } from "lucide-react"
import { KpiCards, KpiCardsSkeleton, type KpiData } from "./_components/kpi-cards"
import { ReportesToolbar } from "./_components/reportes-toolbar"
import { PageHeader } from "@/components/ui/page-header"
import { EmptyState } from "@/components/ui/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { OrdenesLineChart, type OrdenesSeriePunto } from "@/components/charts/ordenes-line-chart"
import { ProduccionBarChart, type ProduccionPunto } from "@/components/charts/produccion-bar-chart"
import { TiemposEtapaChart } from "@/components/charts/tiempos-etapa-chart"
import { EstimacionesTabla } from "./_components/estimaciones-tabla"
import { EsperasTabla } from "./_components/esperas-tabla"
import type {
  ClienteTop, ReporteTiempos, ReporteEstimaciones, ReporteEsperas,
  EsperaAgrupacion,
} from "@/lib/api/types"

// ─── Helpers de fecha ───────────────────────────────────────────────────────
function isoHoy(): string {
  return new Date().toISOString().slice(0, 10)
}
function isoHaceMeses(n: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - n)
  return d.toISOString().slice(0, 10)
}

const AGRUPACIONES = [
  { value: "maquina", label: "Máquina" },
  { value: "cliente", label: "Cliente" },
  { value: "operador", label: "Operador" },
  { value: "mes", label: "Mes" },
] as const
type Agrupacion = (typeof AGRUPACIONES)[number]["value"]

/** Placeholder de carga para una tarjeta de gráfico — mismo marco que los charts reales. */
function ChartSkeleton() {
  return (
    <div className="bg-card/80 border border-border rounded-2xl p-6 h-full">
      <div className="flex items-center gap-3 mb-6">
        <Skeleton className="h-10 w-10 rounded-xl shrink-0" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-44" />
        </div>
      </div>
      <Skeleton className="h-[300px] w-full rounded-xl" />
    </div>
  )
}

/** Panel de error con reintento — reemplaza una sección cuando su fetch falla. */
function ErrorBlock({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <EmptyState
      icon={<AlertCircle className="w-8 h-8" strokeWidth={1.5} />}
      title="No se pudieron cargar los datos"
      description={message}
      action={
        <Button variant="outline" size="sm" onClick={onRetry} className="gap-2">
          <RefreshCw className="w-3.5 h-3.5" />
          Reintentar
        </Button>
      }
    />
  )
}

export default function ReportesPage() {
  const [desde, setDesde] = useState(() => isoHaceMeses(3))
  const [hasta, setHasta] = useState(() => isoHoy())
  const [agrupar, setAgrupar] = useState<Agrupacion>("maquina")

  const [kpi, setKpi] = useState<KpiData | null>(null)
  const [produccion, setProduccion] = useState<ProduccionPunto[]>([])
  const [tiempos, setTiempos] = useState<ReporteTiempos>({ disponible: false, etapas: [] })
  const [estimaciones, setEstimaciones] = useState<ReporteEstimaciones>({
    disponible: false, promedios_etapa: {}, muestras_etapa: {}, ordenes: [],
  })
  // La agrupación de las esperas es independiente de la del chart de producción:
  // una es «por qué recurso se acumula el trabajo» y la otra «cuánto se produjo
  // por máquina». Compartir el selector mezclaría dos preguntas distintas.
  const [agruparEsperas, setAgruparEsperas] = useState<EsperaAgrupacion>("etapa")
  const [esperas, setEsperas] = useState<ReporteEsperas>({
    agrupar: "etapa", filas: [], cuello: null,
  })
  const [serie, setSerie] = useState<OrdenesSeriePunto[]>([])
  const [topClientes, setTopClientes] = useState<ClienteTop[]>([])

  // resumen + producción + tiempos (dependen del rango de fechas y del agrupador).
  const [cargando, setCargando] = useState(true)
  const [errorRango, setErrorRango] = useState<string | null>(null)
  // Serie temporal y top clientes: independientes del rango (últimos 12 meses), cada uno con su propio fetch.
  const [cargandoSerie, setCargandoSerie] = useState(true)
  const [errorSerie, setErrorSerie] = useState<string | null>(null)
  const [cargandoTop, setCargandoTop] = useState(true)
  const [errorTop, setErrorTop] = useState<string | null>(null)

  const rango = useMemo(() => ({ desde, hasta }), [desde, hasta])

  // Carga de KPIs + datos dependientes del rango.
  const cargarRango = useCallback(() => {
    setCargando(true)
    setErrorRango(null)
    Promise.allSettled([
      api.reportes.resumen(rango),
      api.reportes.produccion({ ...rango, agrupar }),
      api.reportes.tiempos(rango),
      api.reportes.estimaciones(desde, hasta),
    ]).then(([resR, prodR, tiempoR, estimR]) => {
      if (resR.status === "fulfilled") {
        const r = resR.value
        setKpi({
          totalOts: r.total_ots ?? 0,
          completadas: r.completadas ?? 0,
          enProceso: r.en_proceso ?? 0,
          pctATiempo: r.pct_a_tiempo ?? null,
          muestrasATiempo: r.muestras_a_tiempo ?? 0,
          atrasadasAbiertas: r.atrasadas_abiertas ?? 0,
          itemsBajoStock: r.items_bajo_stock ?? 0,
        })
      } else {
        setKpi({
          totalOts: 0, completadas: 0, enProceso: 0,
          pctATiempo: null, muestrasATiempo: 0, atrasadasAbiertas: 0,
          itemsBajoStock: 0,
        })
      }
      setProduccion(prodR.status === "fulfilled" ? prodR.value.data ?? [] : [])
      setTiempos(tiempoR.status === "fulfilled" ? tiempoR.value : { disponible: false, etapas: [] })
      setEstimaciones(
        estimR.status === "fulfilled"
          ? estimR.value
          : { disponible: false, promedios_etapa: {}, muestras_etapa: {}, ordenes: [] }
      )
      setCargando(false)

      const fallos = [resR, prodR, tiempoR, estimR].filter(
        (r): r is PromiseRejectedResult => r.status === "rejected"
      )
      if (fallos.length > 0) {
        const msg = fallos[0].reason instanceof Error
          ? fallos[0].reason.message
          : "No se pudieron cargar los datos del reporte"
        setErrorRango(msg)
        toast.error(msg)
      }
    })
  }, [rango, desde, hasta, agrupar])

  // Las esperas tienen su propio fetch: cambiar la agrupación no tiene que
  // volver a pedir el resumen, la producción y las estimaciones.
  const cargarEsperas = useCallback(() => {
    api.reportes
      .esperas(agruparEsperas, desde, hasta)
      .then(setEsperas)
      .catch(() => setEsperas({ agrupar: agruparEsperas, filas: [], cuello: null }))
  }, [agruparEsperas, desde, hasta])

  useEffect(() => {
    cargarEsperas()
  }, [cargarEsperas])

  // Serie temporal de órdenes (independiente del rango: últimos 12 meses).
  const cargarSerie = useCallback(() => {
    setCargandoSerie(true)
    setErrorSerie(null)
    api.reportes.ordenesSeries(12)
      .then((r) => setSerie(r.data ?? []))
      .catch((err) => {
        setSerie([])
        const msg = err instanceof Error ? err.message : "No se pudo cargar la serie de órdenes"
        setErrorSerie(msg)
        toast.error(msg)
      })
      .finally(() => setCargandoSerie(false))
  }, [])

  // Top clientes por cantidad de OTs (independiente del rango).
  const cargarTopClientes = useCallback(() => {
    setCargandoTop(true)
    setErrorTop(null)
    api.reportes.clientesTop(8)
      .then((r) => setTopClientes(r.data ?? []))
      .catch((err) => {
        setTopClientes([])
        const msg = err instanceof Error ? err.message : "No se pudo cargar el top de clientes"
        setErrorTop(msg)
        toast.error(msg)
      })
      .finally(() => setCargandoTop(false))
  }, [])

  useEffect(() => {
    cargarSerie()
    cargarTopClientes()
  }, [cargarSerie, cargarTopClientes])

  useEffect(() => {
    cargarRango()
  }, [cargarRango])

  // Exportar la producción del rango actual a CSV.
  const handleExport = useCallback(() => {
    try {
      const filas = produccion.map((p) => ({
        grupo: p.grupo,
        ots: p.ots,
        cantidad: p.cantidad,
        kg: p.kg,
      }))
      descargarCSV(`produccion_${agrupar}_${desde}_a_${hasta}`, filas)
      toast.success("CSV exportado")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo exportar el CSV")
    }
  }, [produccion, agrupar, desde, hasta])

  const nf = new Intl.NumberFormat("es-AR")

  return (
    <PageContainer>

      {/* ── Header ── */}
      <PageHeader icon={BarChart3} title="Reportes" subtitle="KPIs de producción, tiempos y stock" />

      {/* ── Toolbar: rango + export ── */}
      <ReportesToolbar
        desde={desde}
        hasta={hasta}
        onDesde={setDesde}
        onHasta={setHasta}
        onExport={handleExport}
        exportDisabled={produccion.length === 0}
        loading={cargando}
      />

      {/* ── KPI cards ── */}
      {cargando ? (
        <KpiCardsSkeleton />
      ) : errorRango ? (
        <ErrorBlock message={errorRango} onRetry={cargarRango} />
      ) : (
        kpi && <KpiCards data={kpi} />
      )}

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
        {cargando ? (
          <ChartSkeleton />
        ) : errorRango ? (
          <ErrorBlock message={errorRango} onRetry={cargarRango} />
        ) : (
          <ProduccionBarChart
            data={produccion}
            metrica="cantidad"
            titulo="Producción"
            subtitulo={`Unidades por ${AGRUPACIONES.find((a) => a.value === agrupar)?.label.toLowerCase()}`}
          />
        )}
      </div>

      {/* ── Serie temporal + tiempos entre etapas ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {cargandoSerie ? (
          <ChartSkeleton />
        ) : errorSerie ? (
          <ErrorBlock message={errorSerie} onRetry={cargarSerie} />
        ) : serie.length === 0 ? (
          <EmptyState
            icon={<TrendingUp className="w-8 h-8" strokeWidth={1.5} />}
            title="Sin datos de órdenes"
            description="Todavía no hay órdenes registradas en los últimos 12 meses."
          />
        ) : (
          <OrdenesLineChart data={serie} />
        )}
        {cargando ? (
          <ChartSkeleton />
        ) : errorRango ? (
          <ErrorBlock message={errorRango} onRetry={cargarRango} />
        ) : (
          <TiemposEtapaChart etapas={tiempos.etapas ?? []} disponible={!!tiempos.disponible} />
        )}
      </div>

      {/* ── Cumplimiento de plazos: cuándo termina cada orden (RF-13 · RF-14) ── */}
      {cargando ? (
        <ChartSkeleton />
      ) : errorRango ? (
        <ErrorBlock message={errorRango} onRetry={cargarRango} />
      ) : (
        <EstimacionesTabla datos={estimaciones} />
      )}

      {/* ── Cuellos de botella (RF-15) ── */}
      <EsperasTabla
        datos={esperas}
        agrupar={agruparEsperas}
        onAgrupar={setAgruparEsperas}
      />

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
        {cargandoTop ? (
          <div className="space-y-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-2 py-2">
                <Skeleton className="h-3 w-5 shrink-0" />
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-3.5 w-28" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                  <Skeleton className="h-2 w-full rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ) : errorTop ? (
          <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
            <AlertCircle className="w-6 h-6 text-destructive" strokeWidth={1.5} />
            <p className="text-xs text-muted-foreground max-w-sm">{errorTop}</p>
            <Button variant="outline" size="sm" onClick={cargarTopClientes} className="gap-2">
              <RefreshCw className="w-3.5 h-3.5" />
              Reintentar
            </Button>
          </div>
        ) : (topClientes ?? []).length === 0 ? (
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
                        className="h-full rounded-full bg-chart-1/80"
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

    </PageContainer>
  )
}
