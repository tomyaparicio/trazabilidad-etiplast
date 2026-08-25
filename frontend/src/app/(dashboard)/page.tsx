import Link from "next/link"
import { cookies } from "next/headers"
import {
  ArrowRight, FileText, Clock, Cog, CheckCircle2, ChevronRight,
  FilePlus2, ScanLine, CalendarRange, PackageCheck,
} from "lucide-react"
import { apiFetchServer } from "@/lib/api/server"
import type { DashboardStats, OrdenResumen } from "@/types/database"

const DISPLAY = "'Century Gothic ET', var(--font-questrial), 'Questrial', sans-serif"

const stateStyle: Record<string, string> = {
  borrador: "bg-slate-100 text-slate-700",
  pendiente: "bg-amber-100 text-amber-800",
  en_proceso: "bg-[#e9eaff] text-[#292d96]",
  completada: "bg-emerald-100 text-emerald-800",
  cancelada: "bg-red-100 text-red-800",
}
const stateLabel: Record<string, string> = {
  borrador: "Borrador", pendiente: "Pendiente", en_proceso: "En producción", completada: "Completada", cancelada: "Cancelada",
}

// Paleta del donut de rubros (marca)
const RUBRO_COLORS = ["#292d96", "#5b5fcc", "#8a8dff", "#f5eb4a", "#b3b5ff", "#c9cbf5"]

export default async function DashboardPage() {
  const token = (await cookies()).get("auth-token")?.value
  let userName = "Usuario"
  try {
    if (token) {
      const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString())
      userName = payload.nombre || payload.sub?.split("@")[0] || userName
    }
  } catch { /* noop */ }

  let stats: DashboardStats | null = null
  try { stats = await apiFetchServer<DashboardStats>("/api/dashboard/stats") } catch { /* noop */ }

  const nf = new Intl.NumberFormat("es-AR")
  const est = stats?.ordenes_por_estado ?? {}
  const draft = est.borrador ?? 0
  const pending = est.pendiente ?? 0
  const inProgress = est.en_proceso ?? 0
  const completed = est.completada ?? 0

  // Flujo de la orden (datos reales: ordenes_por_estado)
  const flow = [
    { label: "Borrador", n: draft, u: "en carga", Icon: FileText, hot: false },
    { label: "Pendiente", n: pending, u: "por producir", Icon: Clock, hot: false },
    { label: "En producción", n: inProgress, u: "en máquina", Icon: Cog, hot: true },
    { label: "Completadas", n: completed, u: "listas", Icon: CheckCircle2, hot: false },
  ]

  const kpis = [
    { label: "Marcas", value: stats?.total_clientes ?? 0, detail: `${nf.format(stats?.marcas_sin_rs ?? 0)} sin razón social` },
    { label: "Razones sociales", value: stats?.total_razones_sociales ?? 0, detail: "entidades legales" },
    { label: "Productos", value: stats?.total_productos ?? 0, detail: `${nf.format(stats?.marcas_con_productos ?? 0)} marcas con productos` },
    { label: "Órdenes activas", value: stats?.ordenes_activas ?? 0, detail: `${nf.format(pending)} pendientes` },
  ]

  const actions = [
    { label: "Nueva orden", href: "/ordenes", icon: FilePlus2, primary: true },
    { label: "Escanear orden", href: "/ordenes", icon: ScanLine },
    { label: "Planificación", href: "/planificacion", icon: CalendarRange },
    { label: "Nuevo remito", href: "/remitos", icon: PackageCheck },
  ]

  // Donut de rubros (datos reales)
  const rubros = [...(stats?.rubros ?? [])].sort((a, b) => b.cantidad - a.cantidad)
  const totalR = rubros.reduce((s, r) => s + r.cantidad, 0) || 1
  const topR = rubros.slice(0, 5)
  let acc = 0
  const stops = topR.map((r, i) => {
    const from = (acc / totalR) * 100
    acc += r.cantidad
    const to = (acc / totalR) * 100
    return `${RUBRO_COLORS[i % RUBRO_COLORS.length]} ${from}% ${to}%`
  })
  const donut = `conic-gradient(${stops.join(", ")}${topR.length ? ", var(--line, #e9eaf4) 0" : "var(--line,#e9eaf4) 0 100%"})`

  const orders: OrdenResumen[] = stats?.ordenes_recientes ?? []

  return (
    <div className="min-h-full bg-background">
      <div className="mx-auto max-w-[1360px] space-y-5 p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#292d96] dark:text-[#b9bbff]">Panel de control</p>
            <h1 className="mt-1 text-3xl tracking-tight" style={{ fontFamily: DISPLAY }}>Hola, {userName}</h1>
            <p className="mt-1 text-sm text-muted-foreground">Así viene la producción y la base comercial hoy.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {actions.map(({ label, href, icon: Icon, primary }) => (
              <Link key={label} href={href}
                className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-3.5 text-xs font-semibold transition-colors ${primary ? "bg-[#292d96] text-white hover:bg-[#1d206b]" : "border border-border bg-card text-foreground hover:bg-muted"}`}>
                <Icon className="size-4" />{label}
              </Link>
            ))}
          </div>
        </header>

        {/* ── Flujo de producción (pieza única, datos reales) ── */}
        <section className="relative overflow-hidden rounded-2xl bg-[#292d96] p-6 text-white shadow-sm sm:p-7">
          <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(90% 120% at 100% 0, rgba(138,141,255,.35), transparent 55%)" }} />
          <div className="relative flex items-baseline justify-between">
            <h2 className="text-[17px]" style={{ fontFamily: DISPLAY }}>Flujo de órdenes</h2>
            <span className="text-xs text-[#b9bbff]">{nf.format(stats?.ordenes_activas ?? 0)} órdenes activas</span>
          </div>
          <div className="relative mt-5 grid grid-cols-2 gap-y-6 sm:grid-cols-4">
            {flow.map(({ label, n, u, Icon, hot }, i) => (
              <div key={label} className="relative px-1">
                <div className="mb-3 flex items-center gap-2.5">
                  <span className={`grid size-9 place-items-center rounded-xl ${hot ? "bg-[#f5eb4a] text-[#111341]" : "bg-white/10 text-white"}`}><Icon className="size-[18px]" /></span>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#dfe1ff]">{label}</span>
                </div>
                <div className="text-[38px] leading-none tabular-nums" style={{ fontFamily: DISPLAY, color: hot ? "#f5eb4a" : "#fff" }}>{nf.format(n)}</div>
                <div className="mt-1 text-xs text-[#8a8dff]">{u}</div>
                {i < flow.length - 1 && (
                  <ChevronRight className="absolute right-[-6px] top-1 hidden size-5 text-white/30 sm:block" />
                )}
              </div>
            ))}
          </div>
        </section>

        {/* ── KPIs ── */}
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map(({ label, value, detail }) => (
            <div key={label} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <p className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{label}</p>
              <p className="mt-2 text-[34px] leading-none tabular-nums text-foreground" style={{ fontFamily: DISPLAY }}>{nf.format(value)}</p>
              <div className="my-3 h-[3px] w-8 rounded-full bg-[#f5eb4a]" />
              <p className="text-xs font-medium text-muted-foreground">{detail}</p>
            </div>
          ))}
        </section>

        {/* ── Órdenes recientes + Rubros ── */}
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,.5fr)]">
          <section className="rounded-2xl border border-border bg-card shadow-sm">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div><h2 className="text-base" style={{ fontFamily: DISPLAY }}>Órdenes recientes</h2><p className="text-xs text-muted-foreground">Últimos movimientos</p></div>
              <Link href="/ordenes" className="flex items-center gap-1 text-xs font-semibold text-[#292d96] hover:text-[#1d206b] dark:text-[#b9bbff]">Ver todas <ArrowRight className="size-3.5" /></Link>
            </div>
            <div className="px-3 py-1">
              {orders.length === 0 ? (
                <div className="py-14 text-center text-sm text-muted-foreground">No hay órdenes registradas.</div>
              ) : orders.slice(0, 6).map((o) => (
                <Link key={o.id} href="/ordenes" className="grid min-h-[60px] grid-cols-[92px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-2 hover:bg-muted/50">
                  <span className="tabular-nums text-sm font-semibold" style={{ fontFamily: DISPLAY }}>{o.numero}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{o.cliente_nombre || "Sin cliente"}</span>
                    <span className="block truncate text-xs text-muted-foreground">{o.responsable_nombre || "Sin responsable"}</span>
                  </span>
                  <span className={`rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${stateStyle[o.estado] || stateStyle.borrador}`}>{stateLabel[o.estado] || o.estado}</span>
                </Link>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-base" style={{ fontFamily: DISPLAY }}>Marcas por rubro</h2>
            <p className="text-xs text-muted-foreground">Distribución de la cartera</p>
            {topR.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">Sin datos de rubros.</div>
            ) : (
              <div className="mt-5 flex items-center gap-5">
                <div className="relative size-[132px] shrink-0 rounded-full" style={{ background: donut }}>
                  <div className="absolute inset-[26px] grid place-items-center rounded-full bg-card">
                    <div className="text-center">
                      <div className="text-xl leading-none tabular-nums" style={{ fontFamily: DISPLAY }}>{nf.format(stats?.total_clientes ?? 0)}</div>
                      <div className="text-[10px] text-muted-foreground">marcas</div>
                    </div>
                  </div>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-2.5 text-[13px]">
                  {topR.map((r, i) => (
                    <div key={r.nombre} className="flex items-center gap-2.5">
                      <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: RUBRO_COLORS[i % RUBRO_COLORS.length] }} />
                      <span className="truncate">{r.nombre}</span>
                      <b className="ml-auto tabular-nums text-muted-foreground">{Math.round((r.cantidad / totalR) * 100)}%</b>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
