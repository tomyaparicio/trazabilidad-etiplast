"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { api } from "@/lib/api"
import type { EstadoPresupuesto, Presupuesto } from "@/lib/api/types"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DataTable, type ColumnDef } from "@/components/ui/data-table"
import {
  ChevronDown, ChevronLeft, ChevronRight, FileText, Filter, Plus, Search, Tag, X,
} from "lucide-react"
import { PresupuestoFormDialog } from "./presupuesto-form-dialog"
import { PresupuestoDetailDialog } from "./presupuesto-detail-dialog"

/** El backend devuelve cliente_nombre/creador_nombre — el tipo base aún no los expone */
export type PresupuestoRow = Presupuesto & {
  cliente_nombre?: string | null
  creador_nombre?: string | null
  created_at?: string | null
  updated_at?: string | null
}

export const ESTADO_PRESUPUESTO: Record<EstadoPresupuesto, { label: string; className: string }> = {
  borrador:   { label: "Borrador",   className: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30" },
  enviado:    { label: "Enviado",    className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  aprobado:   { label: "Aprobado",   className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  rechazado:  { label: "Rechazado",  className: "bg-red-500/15 text-red-400 border-red-500/30" },
  vencido:    { label: "Vencido",    className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  convertido: { label: "Convertido", className: "bg-violet-500/15 text-violet-400 border-violet-500/30" },
}

export function estadoPresupuestoBadge(estado: EstadoPresupuesto) {
  const s = ESTADO_PRESUPUESTO[estado] ?? { label: estado, className: "" }
  return (
    <Badge variant="outline" className={`text-[11px] px-2.5 py-0.5 font-semibold tracking-wide ${s.className}`}>
      {s.label}
    </Badge>
  )
}

const fmtMoneda = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 })

const fmtFecha = (d?: string | null) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—"

const COLUMNS: ColumnDef<PresupuestoRow>[] = [
  {
    key: "numero",
    header: "Número",
    skeleton: <div className="h-3 w-20 rounded-full bg-muted animate-pulse" />,
    cell: (p) => (
      <span className="text-sm font-mono font-semibold text-foreground group-hover:text-gold transition-colors tabular-nums">
        {p.numero}
      </span>
    ),
  },
  {
    key: "cliente",
    header: "Cliente / Prospecto",
    cellClassName: "max-w-[220px]",
    skeleton: <div className="h-3 w-32 rounded-full bg-muted animate-pulse" />,
    cell: (p) => (
      <div className="min-w-0">
        <span className="text-sm font-medium text-foreground truncate block">
          {p.cliente_nombre ?? p.prospecto_nombre ?? "—"}
        </span>
        {!p.cliente_id && p.prospecto_nombre && (
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Prospecto</span>
        )}
      </div>
    ),
  },
  {
    key: "fecha",
    header: "Fecha",
    skeleton: <div className="h-3 w-20 rounded-full bg-muted animate-pulse" />,
    cell: (p) => <span className="text-sm text-muted-foreground tabular-nums">{fmtFecha(p.fecha)}</span>,
  },
  {
    key: "estado",
    header: "Estado",
    skeleton: <div className="h-6 w-20 rounded-lg bg-muted animate-pulse" />,
    cell: (p) => estadoPresupuestoBadge(p.estado),
  },
  {
    key: "total",
    header: "Total",
    skeleton: <div className="h-3 w-24 rounded-full bg-muted animate-pulse" />,
    cell: (p) => (
      <span className="text-sm font-semibold text-foreground tabular-nums">
        {p.total != null ? fmtMoneda.format(p.total) : "—"}
        {p.moneda && p.moneda !== "ARS" && (
          <span className="text-[10px] text-muted-foreground ml-1">{p.moneda}</span>
        )}
      </span>
    ),
  },
  {
    key: "arrow",
    header: "",
    skeleton: <div className="w-4 h-4 rounded bg-muted animate-pulse" />,
    cell: () => (
      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-gold group-hover:translate-x-0.5 transition-all duration-150" />
    ),
  },
]

export function PresupuestosTable() {
  const [presupuestos, setPresupuestos] = useState<PresupuestoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [estado, setEstado] = useState("")
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [searchDebounced, setSearchDebounced] = useState(search)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const [selected, setSelected] = useState<PresupuestoRow | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<PresupuestoRow | null>(null)

  useEffect(() => {
    debounceRef.current = setTimeout(() => setSearchDebounced(search), 300)
    return () => { clearTimeout(debounceRef.current) }
  }, [search])

  const perPage = 20
  const totalPages = Math.ceil(total / perPage)
  const nf = new Intl.NumberFormat("es-AR")

  const fetchPresupuestos = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.presupuestos.list({
        page,
        per_page: perPage,
        search: searchDebounced?.trim() || undefined,
        estado: estado || undefined,
      })
      setPresupuestos((res.data as PresupuestoRow[]) || [])
      setTotal(res.total || 0)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [page, searchDebounced, estado])

  useEffect(() => {
    fetchPresupuestos()
  }, [fetchPresupuestos])

  const handleSaved = (saved: PresupuestoRow) => {
    setPresupuestos((prev) => {
      const exists = prev.some((p) => p.id === saved.id)
      if (exists) return prev.map((p) => (p.id === saved.id ? saved : p))
      return [saved, ...prev]
    })
    if (!editTarget) setTotal((t) => t + 1)
    setSelected((prev) => (prev?.id === saved.id ? saved : prev))
  }

  const handleUpdated = (updated: PresupuestoRow) => {
    setPresupuestos((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
    setSelected((prev) => (prev?.id === updated.id ? updated : prev))
  }

  return (
    <div className="p-6 lg:p-8 space-y-5 max-w-[1200px] mx-auto">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-1 h-6 rounded-full bg-gold" />
          <div>
            <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
              <FileText className="w-5 h-5 text-gold" />
              Presupuestos
            </h2>
            <p className="text-muted-foreground text-sm">{nf.format(total)} registros encontrados</p>
          </div>
        </div>
        <Button
          onClick={() => { setEditTarget(null); setFormOpen(true) }}
          className="h-10 px-4 rounded-xl bg-[#1a1866] hover:bg-[#14115a] text-white border border-[#1a1866] text-sm font-medium gap-2 shrink-0"
        >
          <Plus className="w-4 h-4" />
          Nuevo presupuesto
        </Button>
      </div>

      {/* ── Filters ── */}
      <div className="rounded-2xl border border-border bg-card/60 p-5 backdrop-blur-sm">
        <div className="flex items-center gap-2 mb-4">
          <div className="rounded-lg p-1.5 bg-gold/10 border border-gold/20">
            <Filter className="w-3.5 h-3.5 text-gold" strokeWidth={1.5} />
          </div>
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Filtros
          </span>
          {(search || estado) && (
            <button
              onClick={() => { setSearch(""); setEstado(""); setPage(1) }}
              className="ml-auto flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground hover:text-gold transition-colors"
            >
              <X className="w-3 h-3" />
              Limpiar todo
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[240px]">
            <label className="block text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
              Búsqueda
            </label>
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="search"
                autoComplete="off"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                placeholder="Número, marca de cliente o prospecto…"
                className="pl-10 h-11 rounded-xl bg-input border-border text-foreground placeholder:text-muted-foreground focus-visible:border-gold/40 focus-visible:ring-gold/15 transition-all"
              />
            </div>
          </div>
          <div className="min-w-[180px]">
            <label className="block text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
              Estado
            </label>
            <div className="relative">
              <Tag className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <select
                value={estado}
                onChange={(e) => { setEstado(e.target.value); setPage(1) }}
                aria-label="Filtrar por estado"
                className="h-11 w-full pl-10 pr-10 bg-input border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-gold/40 focus:ring-2 focus:ring-gold/10 transition-all cursor-pointer appearance-none"
              >
                <option value="" className="bg-background">Todos los estados</option>
                {(Object.keys(ESTADO_PRESUPUESTO) as EstadoPresupuesto[]).map((e) => (
                  <option key={e} value={e} className="bg-background">{ESTADO_PRESUPUESTO[e].label}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      {/* ── Table ── */}
      <DataTable
        columns={COLUMNS}
        data={presupuestos}
        loading={loading}
        keyExtractor={(p) => p.id}
        onRowClick={setSelected}
        emptyIcon={<FileText className="w-8 h-8 text-muted-foreground" strokeWidth={1.5} />}
        emptyTitle="Sin presupuestos"
        emptyDescription="No se encontraron presupuestos con los filtros aplicados"
      >
        {totalPages > 1 && (
          <nav className="flex items-center justify-between px-5 py-4 border-t border-border" aria-label="Paginación">
            <p className="text-xs text-muted-foreground">
              Mostrando{" "}
              <span className="text-foreground font-medium tabular-nums">
                {nf.format((page - 1) * perPage + 1)}–{nf.format(Math.min(page * perPage, total))}
              </span>{" "}
              de{" "}
              <span className="text-foreground font-medium tabular-nums">{nf.format(total)}</span>
            </p>
            <div className="flex gap-1.5">
              <Button variant="outline" size="icon"
                className="h-8 w-8 bg-muted/50 border-border text-muted-foreground hover:bg-muted hover:text-foreground rounded-lg"
                onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} aria-label="Página anterior"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const p = page <= 3 ? i + 1 : page + i - 2
                if (p < 1 || p > totalPages) return null
                return (
                  <Button key={p} variant="outline" size="icon"
                    className={`h-8 w-8 text-xs tabular-nums transition-all rounded-lg ${p === page ? "bg-gold/10 border-gold/30 text-gold hover:bg-gold/15 font-semibold" : "bg-muted/50 border-border text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                    onClick={() => setPage(p)} aria-current={p === page ? "page" : undefined}
                  >
                    {p}
                  </Button>
                )
              })}
              <Button variant="outline" size="icon"
                className="h-8 w-8 bg-muted/50 border-border text-muted-foreground hover:bg-muted hover:text-foreground rounded-lg"
                onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages} aria-label="Página siguiente"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </nav>
        )}
      </DataTable>

      {/* ── Dialogs ── */}
      {formOpen && (
        <PresupuestoFormDialog
          presupuesto={editTarget}
          onClose={() => { setFormOpen(false); setEditTarget(null) }}
          onSaved={(p) => { handleSaved(p); setFormOpen(false); setEditTarget(null) }}
        />
      )}

      <PresupuestoDetailDialog
        presupuesto={selected}
        onClose={() => setSelected(null)}
        onEdit={(p) => { setSelected(null); setEditTarget(p); setFormOpen(true) }}
        onUpdated={handleUpdated}
        onConverted={() => fetchPresupuestos()}
      />
    </div>
  )
}
