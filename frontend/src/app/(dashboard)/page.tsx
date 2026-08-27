"use client"

import { useCallback, useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import {
  ArrowRight, TriangleAlert, RefreshCw, Plus, BarChart3,
  Activity, Workflow, Tags, PackageCheck, Wallet, FileCheck2, FileClock, TrendingUp,
} from "lucide-react"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { PageContainer } from "@/components/ui/page-container"
import type { DashboardStats, OrdenResumen } from "@/types/database"
import type { OrdenesSeriePunto } from "@/lib/api/types"

const stateStyle: Record<string, string> = {
  borrador: "bg-white/10 text-muted-foreground",
  pendiente: "bg-amber-500/15 text-amber-300",
  en_proceso: "bg-primary/20 text-primary-300",
  completada: "bg-emerald-500/15 text-emerald-300",
  cancelada: "bg-rose-500/15 text-rose-300",
}
const stateLabel: Record<string, string> = {
  borrador: "Borrador", pendiente: "Pendiente", en_proceso: "En producción", completada: "Completada", cancelada: "Cancelada",
}
const RUBRO_COLORS = ["var(--primary-400)", "var(--primary-300)", "var(--gold)", "var(--primary-200)", "#34d399", "#49c2ff"]
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]

type TabKey = "admin" | "prod" | "comercial"
const TABS: { key: TabKey; label: string }[] = [
  { key: "admin", label: "Administrativo" },
  { key: "prod", label: "Producción" },
  { key: "comercial", label: "Comercial" },
]

// ── Micro-visualizaciones ───────────────────────────────────────────────────
/** Pill de variación (verde sube / rojo baja). null → no se muestra. */
function DeltaPill({ pct }: { pct: number | null }) {
  if (pct == null) return null
  const down = pct < 0
  return (
    <span className={`delta-pill ${down ? "is-down" : ""}`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} className="size-3">
        {down ? <path d="M7 7l10 10M17 17H9M17 17V9" /> : <path d="M7 17L17 7M17 7H9M17 7v8" />}
      </svg>
      {pct > 0 ? "+" : ""}{pct}%
    </span>
  )
}

function Sparkline({ values }: { values: number[] }) {
  if (!values || values.length < 2) {
    return <div className="flex h-10 items-center text-[11px] text-muted-foreground">Serie no disponible aún</div>
  }
  const w = 240, h = 40, max = Math.max(...values), min = Math.min(...values), rng = max - min || 1
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 3 - ((v - min) / rng) * (h - 6)])
  const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ")
  const last = pts[pts.length - 1]
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-10 w-full overflow-visible">
      <defs>
        <linearGradient id="dashSpark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8a8dff" stopOpacity="0.32" />
          <stop offset="1" stopColor="#8a8dff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${w} ${h} L0 ${h} Z`} fill="url(#dashSpark)" />
      <path d={line} fill="none" stroke="#8a8dff" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      <circle cx={last[0]} cy={last[1]} r="3" fill="#8a8dff" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function MiniBars({ values, hot }: { values: number[]; hot?: number }) {
  const max = Math.max(...values, 1)
  return (
    <div className="flex h-10 items-end gap-1.5">
      {values.map((v, i) => (
        <span key={i} className={`flex-1 rounded-t-[3px] ${i === hot ? "bg-primary-300" : "bg-primary/40"}`}
          style={{ height: `${Math.max(8, (v / max) * 100)}%` }} />
      ))}
    </div>
  )
}

/** Gauge de arco segmentado (cian → violeta → dorado) con glow. */
function Gauge({ pct, label }: { pct: number; label: string }) {
  const cx = 92, cy = 94, r = 80, N = 30
  const p = Math.max(0, Math.min(100, Math.round(pct)))
  const frac = p / 100
  const stops = [[73, 194, 255], [138, 141, 255], [245, 235, 74]]
  const lerp = (a: number, b: number, f: number) => Math.round(a + (b - a) * f)
  const grad = (f: number) => {
    const seg = f < 0.5 ? 0 : 1, lf = f < 0.5 ? f / 0.5 : (f - 0.5) / 0.5
    const a = stops[seg], b = stops[seg + 1]
    return `rgb(${lerp(a[0], b[0], lf)},${lerp(a[1], b[1], lf)},${lerp(a[2], b[2], lf)})`
  }
  return (
    <svg viewBox="0 0 184 122" className="h-[142px] w-[214px]">
      {Array.from({ length: N }, (_, i) => {
        const t = i / (N - 1), ang = Math.PI * (1 + t)
        const x1 = cx + (r - 16) * Math.cos(ang), y1 = cy + (r - 16) * Math.sin(ang)
        const x2 = cx + r * Math.cos(ang), y2 = cy + r * Math.sin(ang)
        const on = t <= frac
        const col = on ? grad(frac ? t / frac : 0) : "var(--secondary)"
        return (
          <line key={i} x1={x1.toFixed(1)} y1={y1.toFixed(1)} x2={x2.toFixed(1)} y2={y2.toFixed(1)}
            stroke={col} strokeWidth={5.5} strokeLinecap="round"
            style={on ? { filter: `drop-shadow(0 0 4px ${col})` } : undefined} />
        )
      })}
      <text x="92" y="80" textAnchor="middle" className="font-display" style={{ fill: "var(--foreground)" }} fontSize="33" fontWeight="700" letterSpacing="-1">{p}%</text>
      <text x="92" y="100" textAnchor="middle" style={{ fill: "var(--muted-foreground)" }} fontSize="11" fontWeight="600" letterSpacing="1.5">{label}</text>
    </svg>
  )
}

/** Barras de facturación mensual (destaca el mes más alto). */
function MonthlyBars({ data }: { data: { mes: string; monto: number }[] }) {
  if (!data.some((d) => d.monto > 0)) {
    return (
      <div className="flex h-[110px] flex-col items-center justify-center gap-1 text-center">
        <p className="text-sm text-muted-foreground">Aún no hay facturación para graficar.</p>
        <p className="text-xs text-muted-foreground/70">Se llena a medida que cargues órdenes con monto.</p>
      </div>
    )
  }
  const max = Math.max(...data.map((d) => d.monto), 1)
  const hotIdx = data.reduce((mi, d, i, arr) => (d.monto > arr[mi].monto ? i : mi), 0)
  return (
    <div className="flex h-[124px] items-end justify-between gap-3">
      {data.map((d, i) => {
        const hot = i === hotIdx
        const mm = Number(d.mes.split("-")[1])
        return (
          <div key={d.mes} className="group flex h-full flex-1 flex-col items-center justify-end gap-2.5">
            <div className="flex h-full w-full items-end justify-center">
              <div className={`bar-grow w-full max-w-[46px] rounded-t-[9px] transition-[filter] group-hover:brightness-110 ${hot ? "bar-fill--hot" : "bar-fill"}`}
                style={{ height: `${Math.max(6, (d.monto / max) * 100)}%`, animationDelay: `${i * 60}ms` }} />
            </div>
            <span className="text-[11.5px] font-medium text-muted-foreground">{MESES[mm - 1] || d.mes}</span>
          </div>
        )
      })}
    </div>
  )
}

const kpiLabel = "text-[12.5px] font-medium text-muted-foreground"
const kpiVal = "mt-3.5 font-display text-[32px] font-bold leading-none tabular-nums tracking-tight"
const kpiCap = "mt-2 text-[12px] text-muted-foreground"
const iconChip = "grid size-8 place-items-center rounded-lg"

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [serie, setSerie] = useState<OrdenesSeriePunto[]>([])
  const [userName, setUserName] = useState("Usuario")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [tab, setTab] = useState<TabKey>("admin")

  const load = useCallback(() => {
    setLoading(true)
    setError(false)
    api.auth.me()
      .then((u) => setUserName(u.nombre || u.nombre_completo || u.email?.split("@")[0] || "Usuario"))
      .catch(() => {})
    api.reportes.ordenesSeries(12).then((r) => setSerie(r.data ?? [])).catch(() => {})
    api.dashboard.stats().then((s) => setStats(s)).catch(() => setError(true)).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const t = window.setTimeout(load, 0)
    return () => window.clearTimeout(t)
  }, [load])

  const nf = new Intl.NumberFormat("es-AR")
  const money = (v?: number | null) => "$ " + nf.format(Math.round(v ?? 0))
  const est = stats?.ordenes_por_estado ?? {}
  const draft = est.borrador ?? 0, pending = est.pendiente ?? 0, inProgress = est.en_proceso ?? 0, completed = est.completada ?? 0
  const totalOrdenes = Object.values(est).reduce((a, b) => a + (b || 0), 0)
  const stagePct = (v: number) => (totalOrdenes ? Math.round((v / totalOrdenes) * 100) : 0)

  const totalMarcas = stats?.total_clientes ?? 0
  const pctConRs = totalMarcas ? Math.round(((totalMarcas - (stats?.marcas_sin_rs ?? 0)) / totalMarcas) * 100) : 0
  const pctConProd = totalMarcas ? Math.round(((stats?.marcas_con_productos ?? 0) / totalMarcas) * 100) : 0

  const fin = stats?.finanzas
  const aprobPct = fin && fin.presupuestos_total ? Math.round((fin.presupuestos_aprobados / fin.presupuestos_total) * 100) : 0

  const serieValues = serie.map((p) => p.cantidad)
  const ordenesMoM = (() => {
    if (serieValues.length < 2) return null
    const a = serieValues[serieValues.length - 1], b = serieValues[serieValues.length - 2]
    if (b === 0) return a > 0 ? 100 : null
    return Math.round(((a - b) / b) * 100)
  })()

  const rubros = [...(stats?.rubros ?? [])].sort((a, b) => b.cantidad - a.cantidad)
  const totalR = rubros.reduce((s, r) => s + r.cantidad, 0) || 1
  const topR = rubros.slice(0, 5)
  const stops = topR.map((r, i) => {
    const acc = topR.slice(0, i).reduce((sum, it) => sum + it.cantidad, 0)
    return `${RUBRO_COLORS[i % RUBRO_COLORS.length]} ${(acc / totalR) * 100}% ${((acc + r.cantidad) / totalR) * 100}%`
  })
  const donut = `conic-gradient(${stops.join(", ")}${topR.length ? ", var(--border) 0" : "var(--border) 0 100%"})`

  const orders: OrdenResumen[] = stats?.ordenes_recientes ?? []
  const today = new Date().toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })
  const delay = (i: number) => ({ animationDelay: `${i * 60}ms` })

  if (loading) return <DashboardSkeleton />
  if (error && !stats) return <DashboardError onRetry={load} />

  return (
    <PageContainer>
      {/* Tabs centrados */}
      <div className="-mt-2 flex flex-wrap justify-center gap-2 sm:-mt-4 lg:-mt-6">
        {TABS.map((t) => {
          const active = tab === t.key
          return (
            <button key={t.key} type="button" onClick={() => setTab(t.key)} aria-pressed={active}
              className={`h-10 rounded-xl px-4 text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand/40 ${
                active ? "bg-brand text-white shadow-[0_10px_22px_-10px_rgba(41,45,150,.9)]" : "text-muted-foreground hover:bg-card hover:text-foreground"
              }`}>
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Banner con el nombre */}
      <section className="dash-banner eti-in relative flex flex-wrap items-end justify-between gap-4 px-7 py-6">
        <div aria-hidden className="pointer-events-none absolute -right-14 top-1/2 size-56 -translate-y-1/2 rounded-full border-[30px] border-white/[0.06]" />
        <div className="relative min-w-0">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.24em] text-white/70">Panel de control · {today}</p>
          <h1 className="font-display mt-2 text-[30px] font-bold leading-tight tracking-tight">Buen día, <span className="text-gold">{userName}</span></h1>
          <p className="mt-2 text-sm text-white/70">Esto es lo que está pasando hoy en el taller.</p>
        </div>
        <div className="relative flex shrink-0 flex-wrap items-center gap-2.5">
          <Link href="/reportes" className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/35 bg-white/[0.06] px-4 text-sm font-semibold text-white transition-colors hover:bg-white/15">
            <BarChart3 className="size-4" /> Reportes
          </Link>
          <Link href="/ordenes" className="inline-flex h-10 items-center gap-2 rounded-xl bg-gold px-4 text-sm font-semibold text-gold-foreground shadow-[0_12px_24px_-12px_rgba(245,235,74,.6)] transition-transform hover:-translate-y-0.5">
            <Plus className="size-4" /> Nueva orden
          </Link>
        </div>
      </section>

      {/* ═══ ADMINISTRATIVO ═══ */}
      {tab === "admin" && (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {/* Facturación (hero) */}
            <article className="stat-hero stat-card eti-in flex min-h-[172px] flex-col p-6" style={delay(0)}>
              <div aria-hidden className="pointer-events-none absolute -right-14 -top-14 size-52 rounded-full border-[26px] border-white/[0.06]" />
              <p className="relative text-[12.5px] font-medium text-white/75">Facturación</p>
              <p className="relative mt-3.5 font-display text-[38px] font-bold leading-none tabular-nums tracking-tight">{money(fin?.facturacion_total)}</p>
              <div className="relative mt-3 flex items-center gap-2.5">
                <DeltaPill pct={fin?.facturacion_mom ?? null} />
                <span className="text-xs text-white/70">vs mes anterior</span>
              </div>
              <p className="relative mt-auto pt-4 text-xs text-white/65">Completadas: {money(fin?.facturacion_completadas)}</p>
            </article>

            {/* Presup. aprobados */}
            <article className="stat-card eti-in flex min-h-[172px] flex-col p-6" style={delay(1)}>
              <div className="flex items-center gap-2.5">
                <span className={`${iconChip} bg-emerald-500/15 text-emerald-300`}><FileCheck2 className="size-4" /></span>
                <p className={kpiLabel}>Presup. aprobados</p>
              </div>
              <p className={kpiVal}>{money(fin?.presupuestos_aprobados_monto)}</p>
              <p className={kpiCap}>{nf.format(fin?.presupuestos_aprobados ?? 0)} presupuestos</p>
              <div className="mt-auto h-2 overflow-hidden rounded-full bg-secondary pt-0">
                <span className="block h-full rounded-full bg-[linear-gradient(90deg,#49c2ff,var(--primary))]" style={{ width: `${aprobPct}%` }} />
              </div>
            </article>

            {/* Gauge tasa de aprobación */}
            <article className="stat-card eti-in flex flex-col items-center p-6 text-center sm:col-span-2 xl:col-span-1 xl:row-span-2" style={delay(2)}>
              <p className={`${kpiLabel} self-start`}>Tasa de aprobación</p>
              <div className="my-auto"><Gauge pct={fin?.tasa_aprobacion ?? 0} label="APROBACIÓN" /></div>
              <p className="flex items-center justify-center gap-2 text-[12px] text-muted-foreground">
                {nf.format(fin?.presupuestos_aprobados ?? 0)} de {nf.format(fin?.presupuestos_total ?? 0)} ganados
              </p>
            </article>

            {/* Por aprobar */}
            <article className="stat-card eti-in flex min-h-[172px] flex-col p-6" style={delay(3)}>
              <div className="flex items-center gap-2.5">
                <span className={`${iconChip} bg-amber-500/15 text-amber-300`}><FileClock className="size-4" /></span>
                <p className={kpiLabel}>Por aprobar</p>
              </div>
              <p className={kpiVal}>{money(fin?.presupuestos_pendientes_monto)}</p>
              <p className={kpiCap}>{nf.format(fin?.presupuestos_pendientes ?? 0)} pendientes</p>
            </article>

            {/* Ticket promedio */}
            <article className="stat-card eti-in flex min-h-[172px] flex-col p-6" style={delay(4)}>
              <div className="flex items-center gap-2.5">
                <span className={`${iconChip} bg-primary/15 text-primary-300`}><TrendingUp className="size-4" /></span>
                <p className={kpiLabel}>Ticket promedio</p>
              </div>
              <p className={kpiVal}>{money(fin?.ticket_promedio)}</p>
              <p className={kpiCap}>por orden</p>
            </article>
          </section>

          {/* Facturación mensual */}
          <section className="stat-card eti-in p-6" style={delay(5)}>
            <div className="mb-5 flex items-center gap-2.5">
              <span className={`${iconChip} bg-gold/15 text-gold`}><Wallet className="size-4" /></span>
              <h2 className="font-display text-base font-semibold">Facturación mensual</h2>
            </div>
            <MonthlyBars data={fin?.facturacion_mensual ?? []} />
          </section>

          <p className="text-xs text-muted-foreground">
            <span className="font-semibold">Facturación</span> = valor de las órdenes (excluye borradores y canceladas). No representa dinero efectivamente cobrado.
          </p>
        </>
      )}

      {/* ═══ PRODUCCIÓN ═══ */}
      {tab === "prod" && (
        <>
          {/* Órdenes por etapa (stepper) — arriba de las cards */}
          <section className="eti-in relative overflow-hidden rounded-3xl bg-brand p-5 text-white shadow-[0_30px_60px_-34px_rgba(41,45,150,.9)] sm:p-6" style={delay(0)}>
            <div className="mb-5 flex items-end justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">Producción</p>
                <h2 className="mt-1.5 text-[25px] font-display tracking-tight">Órdenes por etapa</h2>
              </div>
              <Link href="/ordenes" className="inline-flex items-center gap-1.5 border-b-2 border-gold pb-0.5 text-[13.5px] font-semibold text-white hover:text-gold">Ver órdenes <ArrowRight className="size-3.5" /></Link>
            </div>
            <div className="relative">
              <div aria-hidden className="pointer-events-none absolute left-[12.5%] right-[12.5%] top-6 hidden h-[3px] rounded-full bg-gold xl:block" />
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  { n: draft, label: "Borrador", state: "En preparación", pct: stagePct(draft), img: "/dashboard/kpis/draft-kpi-v2.png", alt: "Orden en borrador con lápiz y etiqueta" },
                  { n: pending, label: "Pendientes", state: "En espera", pct: stagePct(pending), img: "/dashboard/kpis/pending-kpi-v2.png", alt: "Bobina pendiente junto a un reloj" },
                  { n: inProgress, label: "En producción", state: "En máquina", pct: stagePct(inProgress), img: "/dashboard/kpis/production-kpi-v2.png", alt: "Cinta de etiquetas entre rodillos", active: true },
                  { n: completed, label: "Completadas", state: "Producción cerrada", pct: stagePct(completed), img: "/dashboard/kpis/completed-kpi-v2.png", alt: "Bobina terminada con indicador verde" },
                ].map((s, i) => (
                  <div key={s.label} className="relative">
                    <div className="relative z-20 flex justify-center">
                      <span className="grid size-12 place-items-center rounded-full bg-gold font-display text-lg font-semibold text-brand shadow-[0_0_0_4px_rgba(245,235,74,.15)]">{i + 1}</span>
                    </div>
                    <div className="relative mt-4 min-h-[150px] overflow-visible rounded-2xl border border-white/10 bg-white/[0.06] p-5">
                      <Image src={s.img} alt={s.alt} width={800} height={800} priority={s.active}
                        className="pointer-events-none absolute -right-7 -top-9 z-10 h-[118px] w-auto select-none object-contain drop-shadow-[0_14px_24px_rgba(0,0,0,.5)]" />
                      <span className="relative text-[10px] font-bold uppercase tracking-[0.16em] text-white/55">{s.state}</span>
                      <p className="relative mt-3 font-display text-[40px] font-semibold leading-none tabular-nums">{nf.format(s.n)}</p>
                      <p className="relative mt-1.5 text-sm font-medium text-white/70">{s.label}</p>
                      <div className="relative mt-4 flex items-center gap-3">
                        <div className="h-px flex-1 bg-white/15" />
                        <span className="text-[11px] font-bold tabular-nums text-gold">{s.pct}%</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Órdenes activas + por etapa */}
          <section className="grid gap-4 sm:grid-cols-2">
            <article className="stat-card eti-in flex min-h-[188px] flex-col p-6" style={delay(1)}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className={`${iconChip} bg-primary/15 text-primary-300`}><Activity className="size-4" /></span>
                  <p className={kpiLabel}>Órdenes activas</p>
                </div>
                <DeltaPill pct={ordenesMoM} />
              </div>
              <div className="mt-4 flex items-end justify-between">
                <p className="font-display text-[42px] font-bold leading-none tabular-nums">{nf.format(stats?.ordenes_activas ?? 0)}</p>
                <span className="mb-1 inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-primary-300"><span className="size-1.5 rounded-full bg-primary-300" /> En seguimiento</span>
              </div>
              <div className="mt-auto pt-3"><Sparkline values={serieValues} /></div>
              <p className="mt-1 text-[11px] text-muted-foreground">Pulso mensual · últimos 12 meses</p>
            </article>

            <article className="stat-card eti-in flex min-h-[188px] flex-col p-6" style={delay(2)}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className={`${iconChip} bg-secondary text-primary-300`}><Workflow className="size-4" /></span>
                  <p className={kpiLabel}>Órdenes por etapa</p>
                </div>
                <span className="rounded-full border border-border bg-secondary/60 px-2.5 py-1 text-[10px] font-semibold text-muted-foreground">4 etapas</span>
              </div>
              <p className={kpiVal}>{nf.format(totalOrdenes)}</p>
              <div className="mt-auto pt-3"><MiniBars values={[draft, pending, inProgress, completed]} hot={2} /></div>
              <div className="mt-2 grid grid-cols-4 gap-1 text-center text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                <span>Borr.</span><span>Pend.</span><span className="text-primary-300">Prod.</span><span>Listas</span>
              </div>
            </article>
          </section>

          {/* Órdenes recientes */}
          <section className="stat-card eti-in" style={delay(3)}>
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary-300"><Activity className="size-[17px]" /></span>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary-300">Actividad operativa</p>
                  <h2 className="mt-1 text-base font-display">Órdenes recientes</h2>
                </div>
              </div>
              <Link href="/ordenes" className="flex items-center gap-1 border-b border-primary/40 pb-0.5 text-[13px] font-semibold text-primary-300 hover:text-foreground">Ver todas <ArrowRight className="size-3.5" /></Link>
            </div>
            <div className="px-3 py-2">
              {orders.length === 0 ? (
                <div className="py-14 text-center text-sm text-muted-foreground">No hay órdenes registradas.</div>
              ) : orders.slice(0, 6).map((o, i) => (
                <Link key={o.id} href="/ordenes" className="group grid min-h-[68px] grid-cols-[34px_86px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-2 transition-colors hover:bg-accent">
                  <span className="relative grid h-full place-items-center" aria-hidden>
                    {i > 0 && <span className="absolute inset-x-1/2 top-0 h-[calc(50%-5px)] w-px bg-border" />}
                    {i < Math.min(orders.length, 6) - 1 && <span className="absolute inset-x-1/2 bottom-0 h-[calc(50%-5px)] w-px bg-border" />}
                    <span className={`relative size-2.5 rounded-full border-2 border-card ring-2 ${o.estado === "en_proceso" ? "bg-gold ring-gold/20" : o.estado === "completada" ? "bg-emerald-400 ring-emerald-400/15" : "bg-primary-300 ring-primary/20"}`} />
                  </span>
                  <span className="tabular-nums text-sm font-semibold font-display">{o.numero}</span>
                  <span className="min-w-0 border-l border-border/70 pl-3">
                    <span className="block truncate text-sm font-medium text-foreground group-hover:text-primary-200">{o.cliente_nombre || "Sin cliente"}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">{o.responsable_nombre || "Sin responsable"}</span>
                  </span>
                  <span className={`rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${stateStyle[o.estado] || stateStyle.borrador}`}>{stateLabel[o.estado] || o.estado}</span>
                </Link>
              ))}
            </div>
          </section>
        </>
      )}

      {/* ═══ COMERCIAL ═══ */}
      {tab === "comercial" && (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {/* Marcas con gauge */}
            <article className="stat-card eti-in flex flex-col items-center p-6 text-center" style={delay(0)}>
              <p className={`${kpiLabel} self-start`}>Marcas con razón social</p>
              <div className="my-3"><Gauge pct={pctConRs} label="CON RS" /></div>
              <p className="text-[12px] text-muted-foreground">{nf.format(totalMarcas)} marcas · {nf.format(stats?.marcas_sin_rs ?? 0)} sin razón social</p>
            </article>

            {/* Productos */}
            <article className="stat-card eti-in flex min-h-[188px] flex-col p-6" style={delay(1)}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className={`${iconChip} bg-primary/15 text-primary-300`}><PackageCheck className="size-4" /></span>
                  <p className={kpiLabel}>Productos</p>
                </div>
                <span className="rounded-full bg-primary/15 px-2.5 py-1 text-[10px] font-semibold tabular-nums text-primary-300">{pctConProd}%</span>
              </div>
              <p className={kpiVal}>{nf.format(stats?.total_productos ?? 0)}</p>
              <p className={kpiCap}>Productos configurados en catálogo</p>
              <div className="mt-auto pt-4">
                <div className="h-2 overflow-hidden rounded-full bg-secondary">
                  <span className="block h-full rounded-full bg-primary" style={{ width: `${pctConProd}%` }} />
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{nf.format(stats?.marcas_con_productos ?? 0)} marcas con producto</span>
                  <span className="font-semibold text-primary-300">Cobertura</span>
                </div>
              </div>
            </article>

            {/* Marcas (base) */}
            <article className="stat-hero stat-card eti-in flex min-h-[188px] flex-col p-6" style={delay(2)}>
              <div aria-hidden className="pointer-events-none absolute -right-14 -top-14 size-52 rounded-full border-[26px] border-white/[0.06]" />
              <div className="relative flex items-center gap-2.5">
                <span className={`${iconChip} bg-white/15 text-gold`}><Tags className="size-4" /></span>
                <p className="text-[12.5px] font-medium text-white/75">Base comercial</p>
              </div>
              <p className="relative mt-3.5 font-display text-[38px] font-bold leading-none tabular-nums">{nf.format(totalMarcas)}</p>
              <p className="relative mt-2 text-xs text-white/70">marcas en cartera</p>
              <span className="relative mt-auto pt-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-gold">Etiplast</span>
            </article>
          </section>

          {/* Marcas por rubro */}
          <section className="stat-card eti-in p-6" style={delay(3)}>
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary-300"><Tags className="size-[17px]" /></span>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary-300">Cartera comercial</p>
                <h2 className="mt-1 text-base font-display">Marcas por rubro</h2>
              </div>
            </div>
            {topR.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">Sin datos de rubros.</div>
            ) : (
              <div className="mt-6 flex flex-wrap items-center gap-6">
                <div className="relative grid size-[142px] shrink-0 place-items-center rounded-full border border-primary/15 bg-secondary/30">
                  <span aria-hidden className="absolute -right-1 top-4 size-3 rounded-full border-2 border-card bg-gold" />
                  <div className="relative size-[118px] rounded-full" style={{ background: donut }}>
                    <div className="absolute inset-[23px] grid place-items-center rounded-full border border-border bg-card">
                      <div className="text-center">
                        <div className="text-xl font-semibold leading-none tabular-nums font-display">{nf.format(totalMarcas)}</div>
                        <div className="mt-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">marcas</div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex min-w-[220px] flex-1 flex-col gap-3 text-[12px]">
                  {topR.map((r, i) => {
                    const pct = Math.round((r.cantidad / totalR) * 100)
                    return (
                      <div key={r.nombre}>
                        <div className="flex items-center gap-2">
                          <span className="size-2 shrink-0 rounded-full" style={{ background: RUBRO_COLORS[i % RUBRO_COLORS.length] }} />
                          <span className="truncate text-secondary-foreground">{r.nombre}</span>
                          <b className="ml-auto tabular-nums text-muted-foreground">{pct}%</b>
                        </div>
                        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-secondary">
                          <span className="block h-full rounded-full" style={{ width: `${Math.max(2, pct)}%`, background: RUBRO_COLORS[i % RUBRO_COLORS.length] }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </PageContainer>
  )
}

function DashboardError({ onRetry }: { onRetry: () => void }) {
  return (
    <PageContainer>
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card px-6 py-20 text-center">
        <div className="rounded-2xl border border-destructive/20 bg-destructive/10 p-4 text-destructive"><TriangleAlert className="h-6 w-6" strokeWidth={1.5} /></div>
        <p className="text-sm font-medium text-foreground">No se pudo cargar el panel</p>
        <p className="max-w-sm text-xs text-muted-foreground">El servidor puede estar iniciando (cold-start) o hubo un problema de conexión. Intentá de nuevo.</p>
        <Button onClick={onRetry} variant="outline" className="mt-1 gap-2"><RefreshCw className="h-3.5 w-3.5" /> Reintentar</Button>
      </div>
    </PageContainer>
  )
}

function DashboardSkeleton() {
  return (
    <PageContainer>
      <div className="flex justify-center gap-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-10 w-28 animate-pulse rounded-xl bg-muted" />)}</div>
      <div className="h-[132px] animate-pulse rounded-3xl bg-brand/30" />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-[172px] animate-pulse rounded-[22px] border border-border bg-card" />)}</section>
      <div className="h-[240px] animate-pulse rounded-[22px] border border-border bg-card" />
    </PageContainer>
  )
}
