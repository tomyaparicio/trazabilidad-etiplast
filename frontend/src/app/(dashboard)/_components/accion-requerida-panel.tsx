"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  AlertTriangle, ArrowRight, ClipboardList, FileText, PackageX, CheckCircle2,
} from "lucide-react"
import { api } from "@/lib/api"
import type { OrdenTrabajo, Presupuesto, StockItem } from "@/lib/api/types"

type TabKey = "pendientes" | "aprobar" | "stock"

const money = (v: number | null) =>
  v == null ? "—" : "$ " + new Intl.NumberFormat("es-AR").format(Math.round(v))

/**
 * Panel "Requiere acción": segmented control con lo que necesita atención hoy —
 * órdenes pendientes, presupuestos por aprobar y stock bajo mínimo. Cada tab
 * trae datos reales y linkea a la sección correspondiente.
 */
export function AccionRequeridaPanel() {
  const [tab, setTab] = useState<TabKey>("pendientes")
  const [loading, setLoading] = useState(true)
  const [ordenes, setOrdenes] = useState<OrdenTrabajo[]>([])
  const [ordenesTotal, setOrdenesTotal] = useState(0)
  const [presus, setPresus] = useState<Presupuesto[]>([])
  const [presusTotal, setPresusTotal] = useState(0)
  const [stock, setStock] = useState<StockItem[]>([])

  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.allSettled([
      api.ordenes.list({ estado: "pendiente", per_page: 6 }),
      api.presupuestos.list({ estado: "enviado", per_page: 6 }),
      api.stock.alertas(),
    ]).then(([o, p, s]) => {
      if (!alive) return
      if (o.status === "fulfilled") { setOrdenes(o.value.data ?? []); setOrdenesTotal(o.value.total ?? 0) }
      if (p.status === "fulfilled") { setPresus(p.value.data ?? []); setPresusTotal(p.value.total ?? 0) }
      if (s.status === "fulfilled") setStock(s.value ?? [])
      setLoading(false)
    })
    return () => { alive = false }
  }, [])

  const tabs = [
    { key: "pendientes" as const, label: "Pendientes", count: ordenesTotal, Icon: ClipboardList },
    { key: "aprobar" as const, label: "Por aprobar", count: presusTotal, Icon: FileText },
    { key: "stock" as const, label: "Stock bajo", count: stock.length, Icon: PackageX },
  ]

  return (
    <section className="relative overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex flex-col gap-4 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-xl border border-amber-500/25 bg-amber-500/10 text-amber-300">
            <AlertTriangle className="size-[17px]" />
          </span>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-300/90">Centro de acción</p>
            <h2 className="mt-1 text-base font-display">Requiere acción</h2>
          </div>
        </div>

        {/* Segmented control */}
        <div className="flex gap-1 rounded-xl border border-border bg-secondary/50 p-1">
          {tabs.map(({ key, label, count, Icon }) => {
            const active = tab === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                aria-pressed={active}
                className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/40 ${
                  active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="size-4 shrink-0" />
                <span className="hidden sm:inline">{label}</span>
                <span className={`min-w-[20px] rounded-full px-1.5 py-0.5 text-center text-[10.5px] font-bold tabular-nums ${
                  active ? "bg-amber-500/20 text-amber-300" : "bg-white/10 text-muted-foreground"
                }`}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="p-3">
        {loading ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-[66px] animate-pulse rounded-xl bg-secondary/50" />
            ))}
          </div>
        ) : tab === "pendientes" ? (
          <OrdenesList items={ordenes} />
        ) : tab === "aprobar" ? (
          <PresusList items={presus} />
        ) : (
          <StockList items={stock} />
        )}
      </div>
    </section>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-14 text-center">
      <CheckCircle2 className="size-7 text-emerald-400/80" strokeWidth={1.6} />
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  )
}

function Row({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl border border-border bg-secondary/25 px-4 py-3 transition-colors hover:bg-accent"
    >
      {children}
    </Link>
  )
}

function OrdenesList({ items }: { items: OrdenTrabajo[] }) {
  if (!items.length) return <EmptyState text="No hay órdenes pendientes. ¡Todo en marcha!" />
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {items.map((o) => (
        <Row key={o.id} href="/ordenes">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-amber-500/15 text-amber-300">
            <ClipboardList className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-display text-sm font-semibold">{o.numero}</span>
            <span className="block truncate text-xs text-muted-foreground">{o.cliente_nombre || "Sin cliente"}</span>
          </span>
          <span className="shrink-0 rounded-full bg-amber-500/15 px-2.5 py-1 text-[10.5px] font-semibold text-amber-300">Pendiente</span>
          <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </Row>
      ))}
    </div>
  )
}

function PresusList({ items }: { items: Presupuesto[] }) {
  if (!items.length) return <EmptyState text="No hay presupuestos esperando aprobación." />
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {items.map((p) => (
        <Row key={p.id} href="/presupuestos">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary-300">
            <FileText className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-display text-sm font-semibold">{p.numero}</span>
            <span className="block truncate text-xs text-muted-foreground">{p.cliente_marca || p.prospecto_nombre || "Sin cliente"}</span>
          </span>
          <span className="shrink-0 text-sm font-semibold tabular-nums">{money(p.total)}</span>
          <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </Row>
      ))}
    </div>
  )
}

function StockList({ items }: { items: StockItem[] }) {
  if (!items.length) return <EmptyState text="Todo el stock está por encima del mínimo." />
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {items.map((s) => (
        <Row key={s.id} href="/stock">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-rose-500/15 text-rose-300">
            <PackageX className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-foreground">{s.nombre}</span>
            <span className="block truncate text-xs text-muted-foreground">{s.codigo}</span>
          </span>
          <span className="shrink-0 text-right">
            <span className="block text-sm font-semibold tabular-nums text-rose-300">{s.stock_actual ?? 0} {s.unidad || ""}</span>
            <span className="block text-[11px] tabular-nums text-muted-foreground">mín {s.stock_minimo ?? 0}</span>
          </span>
        </Row>
      ))}
    </div>
  )
}
