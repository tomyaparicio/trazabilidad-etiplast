import { createClient } from "@/lib/supabase/server"
import type { DashboardStats } from "@/types/database"
import { StatCard } from "@/components/stat-card"
import { RubroPieChart } from "@/components/charts/rubro-pie-chart"
import { ProvinciaBarChart } from "@/components/charts/provincia-bar-chart"
import { AlertCircle, Users } from "lucide-react"
import { RefreshButton } from "./refresh-button"

const CHART_COLORS = [
  "#6366f1", "#f5eb4a", "#8b5cf6", "#06b6d4",
  "#10b981", "#f59e0b", "#ec4899", "#3b82f6", "#f97316", "#14b8a6",
]

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("get_dashboard_stats")

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-5 p-6">
        <div className="rounded-2xl bg-red-500/10 border border-red-500/20 p-5">
          <AlertCircle className="w-10 h-10 text-red-400" />
        </div>
        <p className="text-red-400 font-medium text-center">Error al cargar las estadísticas.</p>
        {error && (
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 max-w-md">
            <p className="text-sm font-mono text-[#6b6b8a] break-all">{error.message}</p>
          </div>
        )}
        <RefreshButton />
      </div>
    )
  }

  const stats = data as DashboardStats
  const nf = new Intl.NumberFormat("es-AR")
  const topRubro = stats.rubros[0]
  const topProvincia = stats.provincias[0]

  return (
    <div className="p-6 lg:p-8 space-y-5 max-w-[1280px] mx-auto">

      {/* ── Page header ── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-1 h-6 rounded-full bg-[#f5eb4a]" />
          <div>
            <h2 className="text-xl font-semibold text-white">Panel de Control</h2>
            <p className="text-[#6b6b8a] text-sm">Vista ejecutiva del estado operativo</p>
          </div>
        </div>
        <RefreshButton />
      </div>

      {/* ── Hero + side stats ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Hero card — total clientes */}
        <div className="lg:col-span-2 relative overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0f0f1a]/80 p-8 min-h-[220px] flex flex-col justify-between">
          {/* Grid overlay */}
          <div
            className="absolute inset-0 opacity-[0.025] pointer-events-none"
            style={{
              backgroundImage: `linear-gradient(rgba(255,255,255,1) 1px, transparent 1px),
                                linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)`,
              backgroundSize: "48px 48px",
            }}
          />
          {/* Ambient glows */}
          <div className="absolute -top-24 -left-24 w-80 h-80 bg-[#292d96]/20 rounded-full blur-[100px] pointer-events-none" />
          <div className="absolute -bottom-16 right-16 w-56 h-56 bg-[#f5eb4a]/6 rounded-full blur-[80px] pointer-events-none" />

          <div className="relative z-10">
            {/* Label */}
            <div className="flex items-center gap-2 mb-4">
              <div className="rounded-lg p-1.5 bg-[#6366f1]/10 border border-[#6366f1]/20">
                <Users className="w-3.5 h-3.5 text-[#6366f1]" strokeWidth={1.5} />
              </div>
              <span className="text-[11px] font-semibold text-[#6b6b8a] uppercase tracking-[0.2em]">
                Total Clientes
              </span>
            </div>

            {/* Big number */}
            <p className="text-[72px] font-black text-white tabular-nums leading-none tracking-tight">
              {nf.format(stats.total_clientes)}
            </p>
            <p className="text-[#4a4a6a] text-sm mt-2 mb-6">
              Registros activos en el sistema ERP
            </p>

            {/* Tags row */}
            <div className="flex flex-wrap items-center gap-2.5">
              {topRubro && (
                <span className="inline-flex items-center gap-2 bg-[#f5eb4a]/8 border border-[#f5eb4a]/15 rounded-xl px-3.5 py-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#f5eb4a] shrink-0" />
                  <span className="text-[#f5eb4a] text-xs font-medium">
                    {topRubro.nombre} · {nf.format(topRubro.cantidad)} clientes
                  </span>
                </span>
              )}
              {topProvincia && (
                <span className="inline-flex items-center gap-2 bg-[#6366f1]/8 border border-[#6366f1]/15 rounded-xl px-3.5 py-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#6366f1] shrink-0" />
                  <span className="text-[#6366f1] text-xs font-medium">
                    {topProvincia.nombre} · {nf.format(topProvincia.cantidad)} clientes
                  </span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right column — 2 mini stat cards */}
        <div className="flex flex-col gap-5">
          <StatCard
            label="Rubros Activos"
            value={stats.rubros.length}
            icon="tags"
            accent="#f5eb4a"
            description="Categorías de producto"
          />
          <StatCard
            label="Provincias"
            value={stats.provincias.length}
            icon="map-pin"
            accent="#6366f1"
            description="Cobertura geográfica"
          />
        </div>
      </div>

      {/* ── Charts ── */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
        <div className="xl:col-span-2">
          <RubroPieChart data={stats.rubros} total={stats.total_clientes} />
        </div>
        <div className="xl:col-span-3">
          <ProvinciaBarChart data={stats.provincias} />
        </div>
      </div>

      {/* ── Rubros breakdown — progress bars ── */}
      <div className="bg-[#0f0f1a]/80 border border-white/[0.06] rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-base font-semibold text-white">Distribución por Rubro</h3>
            <p className="text-[#6b6b8a] text-xs mt-0.5">
              Proporción de clientes por categoría
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-semibold text-[#4a4a6a] uppercase tracking-wider">Total</p>
            <p className="text-lg font-bold text-white tabular-nums">
              {nf.format(stats.total_clientes)}
            </p>
          </div>
        </div>

        <div className="space-y-5">
          {stats.rubros.map((rubro, i) => {
            const pct = stats.total_clientes > 0
              ? Math.round((rubro.cantidad / stats.total_clientes) * 100)
              : 0
            const color = CHART_COLORS[i % CHART_COLORS.length]
            return (
              <div key={rubro.nombre}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <span className="text-sm font-medium text-[#c8c8d8]">{rubro.nombre}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-[#6b6b8a] tabular-nums hidden sm:block">
                      {nf.format(rubro.cantidad)} clientes
                    </span>
                    <span
                      className="text-sm font-bold tabular-nums min-w-[42px] text-right"
                      style={{ color }}
                    >
                      {pct}%
                    </span>
                  </div>
                </div>
                {/* Track */}
                <div className="h-2 rounded-full bg-white/[0.04] overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: color,
                      opacity: 0.8,
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

    </div>
  )
}
