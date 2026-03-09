import { cookies } from "next/headers"
import { apiFetchServer } from "@/lib/api/server"
import type { DashboardStats } from "@/types/database"
import { RubroPieChart } from "@/components/charts/rubro-pie-chart"
import { ProvinciaBarChart } from "@/components/charts/provincia-bar-chart"
import {
  AlertCircle, Users, Building2, Boxes, Tag,
  TrendingUp, PackageCheck, AlertTriangle, ClipboardList,
} from "lucide-react"
import type { OrdenResumen } from "@/types/database"

// Colores originales — solo se reemplazó #f5eb4a (amarillo ilegible en fondo blanco) por #d97706
const CHART_COLORS = [
  "#6366f1", "#d97706", "#8b5cf6", "#06b6d4",
  "#10b981", "#f59e0b", "#ec4899", "#3b82f6", "#f97316", "#14b8a6",
]

// ─── Mini stat card ───────────────────────────────────────────────────────────
function MiniStat({
  label, value, sub, icon: Icon, numClass, iconClass, iconBg,
}: {
  label: string; value: number | string; sub?: string
  icon: React.ElementType
  numClass: string   // clases Tailwind para el número grande
  iconClass: string  // clases Tailwind para el ícono
  iconBg: string     // clases Tailwind para el fondo del ícono
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

// ─── Estado config ────────────────────────────────────────────────────────────
const ESTADO_CONFIG: Record<string, { label: string; cls: string }> = {
  borrador:   { label: "Borrador",    cls: "bg-muted/60 text-muted-foreground border-border" },
  pendiente:  { label: "Pendiente",   cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30" },
  en_proceso: { label: "En proceso",  cls: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30" },
  completada: { label: "Completada",  cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" },
  cancelada:  { label: "Cancelada",   cls: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30" },
}

// ─── Sección Órdenes de Trabajo ───────────────────────────────────────────────
function OrdenesSection({
  activas, porEstado, recientes,
}: {
  activas: number
  porEstado: Record<string, number>
  recientes: OrdenResumen[]
}) {
  const nf = new Intl.NumberFormat("es-AR")
  const safeEstado = porEstado ?? {}
  const total = Object.values(safeEstado).reduce((a, b) => a + b, 0)

  return (
    <div className="rounded-2xl border border-border bg-card/80 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-blue-500/15 border border-blue-500/30">
            <ClipboardList className="w-4 h-4 text-blue-600 dark:text-blue-400" strokeWidth={1.8} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Órdenes de Trabajo</h3>
            <p className="text-xs text-muted-foreground">{nf.format(total)} órdenes en total</p>
          </div>
        </div>
        <a
          href="/ordenes"
          className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
        >
          Ver todas →
        </a>
      </div>

      {/* Mini stats por estado */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        {(["borrador", "pendiente", "en_proceso", "completada", "cancelada"] as const).map((estado) => {
          const cfg = ESTADO_CONFIG[estado]
          return (
            <div key={estado} className={`rounded-xl border px-3 py-2.5 text-center ${cfg.cls}`}>
              <p className="text-xl font-black tabular-nums">{nf.format(safeEstado[estado] ?? 0)}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wide mt-0.5 opacity-80">{cfg.label}</p>
            </div>
          )
        })}
      </div>

      {/* Lista de órdenes activas recientes */}
      {recientes.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          No hay órdenes registradas
        </div>
      ) : (
        <div className="space-y-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-3">
            Recientes
          </p>
          {recientes.map((o) => {
            const cfg = ESTADO_CONFIG[o.estado] ?? ESTADO_CONFIG.borrador
            return (
              <div
                key={o.id}
                className="flex items-center gap-3 rounded-xl px-4 py-2.5 hover:bg-muted/30 transition-colors group"
              >
                {/* Número */}
                <span className="font-mono text-xs font-bold text-foreground w-20 shrink-0">
                  {o.numero}
                </span>
                {/* Cliente + Creador + Responsable */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-secondary-foreground truncate">{o.cliente_nombre ?? "—"}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    por {o.creador_nombre ?? "—"}
                    {o.responsable_nombre && (
                      <> · <span className="text-blue-500 dark:text-blue-400">resp. {o.responsable_nombre}</span></>
                    )}
                  </p>
                </div>
                {/* Estado */}
                <span className={`inline-flex items-center text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-lg border shrink-0 ${cfg.cls}`}>
                  {cfg.label}
                </span>
                {/* Fecha */}
                {o.fecha && (
                  <span className="text-xs text-muted-foreground shrink-0 hidden sm:block">
                    {new Date(o.fecha + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "short" })}
                  </span>
                )}
                {/* Cantidad */}
                {o.cantidad != null && (
                  <span className="text-xs text-muted-foreground tabular-nums shrink-0 hidden md:block">
                    {nf.format(o.cantidad)} u.
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
export default async function DashboardPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get("auth-token")?.value
  let userName = "Usuario"
  try {
    if (token) {
      const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString())
      const email: string = payload.sub || ""
      try {
        const me = await apiFetchServer<{ nombre: string | null; apellido: string | null; nombre_completo: string }>("/auth/me")
        userName = (me.nombre || me.apellido) ? me.nombre_completo : email.split("@")[0] || "Usuario"
      } catch {
        userName = email.split("@")[0] || "Usuario"
      }
    }
  } catch { /* ignore */ }

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

  const stats = data
  const nf = new Intl.NumberFormat("es-AR")
  const topRubro = stats.rubros[0]
  const topProvincia = stats.provincias[0]
  const pctConProductos = stats.total_clientes > 0
    ? Math.round((stats.marcas_con_productos / stats.total_clientes) * 100)
    : 0
  const promProductosPorMarca = stats.marcas_con_productos > 0
    ? (stats.total_productos / stats.marcas_con_productos).toFixed(1)
    : "0"

  return (
    <div className="p-6 lg:p-8 space-y-5 max-w-[1280px] mx-auto">

      {/* ── Hero ── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1a1866] via-[#2520a0] to-[#292d96] border border-white/10 p-8 shadow-xl">
        <div
          className="absolute inset-0 opacity-[0.06] pointer-events-none"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px),
                              linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)`,
            backgroundSize: "48px 48px",
          }}
        />
        <div className="absolute -top-24 -right-24 w-80 h-80 bg-white/5 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute -bottom-16 left-16 w-56 h-56 bg-[#6366f1]/20 rounded-full blur-[80px] pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-end justify-between gap-8">
          {/* Left — greeting + total */}
          <div>
            <h2 className="text-2xl font-bold text-white tracking-tight">
              {greeting}, <span className="text-[#f5eb4a]">{userName}</span>
            </h2>
            <p className="text-white/60 text-sm mt-1 mb-6">Te mostramos el resumen del sistema</p>

            <div className="flex items-center gap-2 mb-3">
              <div className="rounded-lg p-1.5 bg-white/15 border border-white/20">
                <Users className="w-3.5 h-3.5 text-white" strokeWidth={1.5} />
              </div>
              <span className="text-[11px] font-semibold text-white/80 uppercase tracking-[0.2em]">
                Total Marcas
              </span>
            </div>
            <p className="text-[72px] font-black text-white tabular-nums leading-none tracking-tight drop-shadow-sm">
              {nf.format(stats.total_clientes)}
            </p>

            <div className="flex flex-wrap items-center gap-2.5 mt-5">
              {topRubro && (
                <span className="inline-flex items-center gap-2 bg-white/15 border border-white/25 rounded-xl px-3.5 py-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#f5eb4a] shrink-0" />
                  <span className="text-white text-xs font-medium">
                    {topRubro.nombre} · {nf.format(topRubro.cantidad)} marcas
                  </span>
                </span>
              )}
              {topProvincia && (
                <span className="inline-flex items-center gap-2 bg-white/15 border border-white/25 rounded-xl px-3.5 py-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#a5b4fc] shrink-0" />
                  <span className="text-white text-xs font-medium">
                    {topProvincia.nombre} · {nf.format(topProvincia.cantidad)} marcas
                  </span>
                </span>
              )}
            </div>
          </div>

          {/* Right — 3 hero counters inline */}
          <div className="flex flex-row gap-5 lg:gap-8 shrink-0">
            <div className="text-center">
              <p className="text-[10px] font-bold text-white/50 uppercase tracking-widest mb-1">Razones Sociales</p>
              <p className="text-4xl font-black text-white tabular-nums">{nf.format(stats.total_razones_sociales)}</p>
              <p className="text-[11px] text-white/50 mt-1">entidades legales</p>
            </div>
            <div className="w-px bg-white/15 self-stretch" />
            <div className="text-center">
              <p className="text-[10px] font-bold text-white/50 uppercase tracking-widest mb-1">Productos</p>
              <p className="text-4xl font-black text-[#f5eb4a] tabular-nums">{nf.format(stats.total_productos)}</p>
              <p className="text-[11px] text-white/50 mt-1">especificaciones registradas</p>
            </div>
            <div className="w-px bg-white/15 self-stretch" />
            <div className="text-center">
              <p className="text-[10px] font-bold text-white/50 uppercase tracking-widest mb-1">Prom. por marca</p>
              <p className="text-4xl font-black text-[#a5b4fc] tabular-nums">{promProductosPorMarca}</p>
              <p className="text-[11px] text-white/50 mt-1">productos / marca</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Órdenes de Trabajo ── */}
      <OrdenesSection
        activas={stats.ordenes_activas ?? 0}
        porEstado={stats.ordenes_por_estado ?? {}}
        recientes={stats.ordenes_recientes ?? []}
      />

      {/* ── Stat grid ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MiniStat
          label="Marcas registradas"
          value={stats.total_clientes}
          sub="Clientes / marcas comerciales"
          icon={Users}
          numClass="text-amber-600 dark:text-[#f5eb4a]"
          iconClass="text-amber-600 dark:text-[#f5eb4a]"
          iconBg="bg-amber-500/10 border-amber-500/20 dark:bg-amber-400/15 dark:border-amber-400/30"
        />
        <MiniStat
          label="Razones Sociales"
          value={stats.total_razones_sociales}
          sub={`${stats.marcas_sin_rs > 0 ? `${stats.marcas_sin_rs} marcas sin vincular` : "Todas las marcas vinculadas"}`}
          icon={Building2}
          numClass="text-indigo-600 dark:text-[#22d3ee]"
          iconClass="text-indigo-600 dark:text-[#22d3ee]"
          iconBg="bg-indigo-500/10 border-indigo-500/20 dark:bg-cyan-400/15 dark:border-cyan-400/30"
        />
        <MiniStat
          label="Productos totales"
          value={stats.total_productos}
          sub={`En ${nf.format(stats.marcas_con_productos)} marcas (${pctConProductos}%)`}
          icon={Boxes}
          numClass="text-emerald-600 dark:text-[#4ade80]"
          iconClass="text-emerald-600 dark:text-[#4ade80]"
          iconBg="bg-emerald-500/10 border-emerald-500/20 dark:bg-green-400/15 dark:border-green-400/30"
        />
        <MiniStat
          label="Rubros activos"
          value={stats.rubros.length}
          sub={`${nf.format(stats.provincias.length)} provincias con cobertura`}
          icon={Tag}
          numClass="text-orange-600 dark:text-[#f472b6]"
          iconClass="text-orange-600 dark:text-[#f472b6]"
          iconBg="bg-orange-500/10 border-orange-500/20 dark:bg-pink-500/15 dark:border-pink-500/30"
        />
      </div>

      {/* ── Alertas ── */}
      {(stats.marcas_sin_rs > 0) && (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-50 dark:bg-amber-500/8 px-5 py-4">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <p className="text-sm text-amber-700 dark:text-amber-300">
            <span className="font-semibold">{nf.format(stats.marcas_sin_rs)} marcas</span> no tienen razón social vinculada.
            Vinculálas desde el detalle de cada cliente.
          </p>
        </div>
      )}

      {/* ── Cobertura de productos ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Coverage bar */}
        <div className="rounded-2xl border border-border bg-card/80 p-6">
          <div className="flex items-center gap-2 mb-1">
            <PackageCheck className="w-4 h-4 text-emerald-600 dark:text-[#4ade80]" />
            <h3 className="text-sm font-semibold text-foreground">Cobertura de productos</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-5">Marcas con al menos un producto registrado</p>

          <div className="flex items-end gap-3 mb-3">
            <p className="text-4xl font-black tabular-nums text-emerald-600 dark:text-[#4ade80]">{pctConProductos}%</p>
            <p className="text-sm text-muted-foreground pb-1">
              {nf.format(stats.marcas_con_productos)} de {nf.format(stats.total_clientes)} marcas
            </p>
          </div>
          <div className="h-3 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-600 dark:bg-[#4ade80]/70 transition-all"
              style={{ width: `${pctConProductos}%` }}
            />
          </div>
          {stats.total_clientes - stats.marcas_con_productos > 0 && (
            <p className="text-xs text-muted-foreground mt-3">
              {nf.format(stats.total_clientes - stats.marcas_con_productos)} marcas sin productos aún
            </p>
          )}
        </div>

        {/* Prom products */}
        <div className="rounded-2xl border border-border bg-card/80 p-6">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-violet-600 dark:text-[#e879f9]" />
            <h3 className="text-sm font-semibold text-foreground">Productos por marca</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-5">Promedio entre marcas con productos</p>

          <p className="text-4xl font-black tabular-nums text-violet-600 dark:text-[#e879f9] mb-2">{promProductosPorMarca}</p>
          <p className="text-xs text-muted-foreground">
            {nf.format(stats.total_productos)} productos en total entre {nf.format(stats.marcas_con_productos)} marcas
          </p>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-muted/30 border border-border px-4 py-3 text-center">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Total marcas</p>
              <p className="text-xl font-black tabular-nums text-foreground">{nf.format(stats.total_clientes)}</p>
            </div>
            <div className="rounded-xl bg-muted/30 border border-border px-4 py-3 text-center">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Total productos</p>
              <p className="text-xl font-black tabular-nums text-foreground">{nf.format(stats.total_productos)}</p>
            </div>
          </div>
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

      {/* ── Rubros breakdown ── */}
      <div className="bg-card/80 border border-border rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-base font-semibold text-foreground">Distribución por Rubro</h3>
            <p className="text-muted-foreground text-xs mt-0.5">Proporción de marcas por categoría</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Total</p>
            <p className="text-lg font-bold text-foreground tabular-nums">{nf.format(stats.total_clientes)}</p>
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
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                    <span className="text-sm font-medium text-secondary-foreground">{rubro.nombre}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-muted-foreground tabular-nums hidden sm:block">
                      {nf.format(rubro.cantidad)} marcas
                    </span>
                    <span className="text-sm font-bold tabular-nums min-w-[42px] text-right" style={{ color }}>
                      {pct}%
                    </span>
                  </div>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color, opacity: 0.8 }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

    </div>
  )
}
