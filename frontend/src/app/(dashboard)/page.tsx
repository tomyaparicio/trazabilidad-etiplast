import { cookies } from "next/headers"
import { apiFetchServer } from "@/lib/api/server"
import type { DashboardStats } from "@/types/database"
import { StatCard } from "@/components/stat-card"
import { RubroPieChart } from "@/components/charts/rubro-pie-chart"
import { ProvinciaBarChart } from "@/components/charts/provincia-bar-chart"
import { AlertCircle, Users } from "lucide-react"

const CHART_COLORS = [
  "#6366f1", "#f5eb4a", "#8b5cf6", "#06b6d4",
  "#10b981", "#f59e0b", "#ec4899", "#3b82f6", "#f97316", "#14b8a6",
]

export default async function DashboardPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get("token")?.value
  let userEmail = "Usuario"
  try {
    if (token) {
      const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString())
      userEmail = payload.sub || "Usuario"
    }
  } catch { /* ignore */ }
  const userName = userEmail.split("@")[0] || "Usuario"

  const hour = new Date().getHours()
  const greeting = hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches"

  let data: DashboardStats | null = null
  let error: Error | null = null
  try {
    data = await apiFetchServer<DashboardStats>("/api/dashboard/stats")
  } catch (e) {
    error = e instanceof Error ? e : new Error(String(e))
  }

  if (error || !data) {
    return (
      <div className="p-6 lg:p-8 space-y-5 max-w-[1280px] mx-auto">
        <div className="rounded-2xl bg-gradient-to-br from-[#1a1866] to-[#292d96] border border-white/10 p-6">
          <h2 className="text-xl font-bold text-white">
            {greeting}, <span className="text-[#f5eb4a]">{userName}</span>
          </h2>
          <p className="text-white/70 text-sm mt-1">Panel de Control</p>
        </div>
        <div className="flex flex-col items-center justify-center min-h-[300px] gap-5">
          <div className="rounded-2xl bg-red-500/10 border border-red-500/20 p-5">
            <AlertCircle className="w-10 h-10 text-red-400" />
          </div>
          <p className="text-red-400 font-medium text-center">Error al cargar las estadísticas.</p>
          {error && (
            <div className="bg-muted/50 border border-border rounded-xl p-4 max-w-md">
              <p className="text-sm font-mono text-muted-foreground break-all">{error?.message}</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  const stats = data as DashboardStats
  const nf = new Intl.NumberFormat("es-AR")
  const topRubro = stats.rubros[0]
  const topProvincia = stats.provincias[0]

  return (
    <div className="p-6 lg:p-8 space-y-5 max-w-[1280px] mx-auto">

      {/* ── Hero + side stats ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Hero card — bienvenida + total clientes (azul) */}
        <div className="lg:col-span-2 relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1a1866] via-[#2520a0] to-[#292d96] border border-white/10 p-8 min-h-[240px] flex flex-col justify-between shadow-xl">
          {/* Grid overlay */}
          <div
            className="absolute inset-0 opacity-[0.06] pointer-events-none"
            style={{
              backgroundImage: `linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px),
                                linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)`,
              backgroundSize: "48px 48px",
            }}
          />
          {/* Ambient glows */}
          <div className="absolute -top-24 -right-24 w-80 h-80 bg-white/5 rounded-full blur-[100px] pointer-events-none" />
          <div className="absolute -bottom-16 left-16 w-56 h-56 bg-[#6366f1]/20 rounded-full blur-[80px] pointer-events-none" />

          <div className="relative z-10">
            {/* Bienvenida */}
            <div className="mb-5">
              <h2 className="text-2xl font-bold text-white tracking-tight">
                {greeting}, <span className="text-[#f5eb4a]">{userName}</span>
              </h2>
              <p className="text-white/70 text-sm mt-1">Te mostramos el resumen de hoy</p>
            </div>
            {/* Label */}
            <div className="flex items-center gap-2 mb-4">
              <div className="rounded-lg p-1.5 bg-white/15 border border-white/20">
                <Users className="w-3.5 h-3.5 text-white" strokeWidth={1.5} />
              </div>
              <span className="text-[11px] font-semibold text-white/80 uppercase tracking-[0.2em]">
                Total Clientes
              </span>
            </div>

            {/* Big number */}
            <p className="text-[72px] font-black text-white tabular-nums leading-none tracking-tight drop-shadow-sm">
              {nf.format(stats.total_clientes)}
            </p>
            <p className="text-white/70 text-sm mt-2 mb-6">
              Registros activos en el sistema ERP
            </p>

            {/* Tags row */}
            <div className="flex flex-wrap items-center gap-2.5">
              {topRubro && (
                <span className="inline-flex items-center gap-2 bg-white/15 border border-white/25 rounded-xl px-3.5 py-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#f5eb4a] shrink-0" />
                  <span className="text-white text-xs font-medium">
                    {topRubro.nombre} · {nf.format(topRubro.cantidad)} clientes
                  </span>
                </span>
              )}
              {topProvincia && (
                <span className="inline-flex items-center gap-2 bg-white/15 border border-white/25 rounded-xl px-3.5 py-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#a5b4fc] shrink-0" />
                  <span className="text-white text-xs font-medium">
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
      <div className="bg-card/80 border border-border rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-base font-semibold text-foreground">Distribución por Rubro</h3>
            <p className="text-muted-foreground text-xs mt-0.5">
              Proporción de clientes por categoría
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Total</p>
            <p className="text-lg font-bold text-foreground tabular-nums">
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
                    <span className="text-sm font-medium text-secondary-foreground">{rubro.nombre}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-muted-foreground tabular-nums hidden sm:block">
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
                <div className="h-2 rounded-full bg-muted overflow-hidden">
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
