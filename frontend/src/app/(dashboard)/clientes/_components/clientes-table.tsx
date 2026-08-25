"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { api } from "@/lib/api"
import type { Cliente, Filtros } from "@/types/database"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { DataTable, type ColumnDef } from "@/components/ui/data-table"
import { Search, ChevronLeft, ChevronRight, ChevronDown, X, Plus, Filter, MapPin, Tag } from "lucide-react"
import { ClienteDetailDialog } from "./cliente-detail-dialog"
import { ClienteNuevoDialog } from "./cliente-nuevo-dialog"

const RUBRO_STYLES: Record<string, { dot: string; text: string; bg: string; border: string }> = {
  Agua:             { dot: "#22d3ee", text: "text-cyan-400",    bg: "bg-cyan-500/10",    border: "border-cyan-500/20" },
  "Jugos-Gaseosas": { dot: "#fb923c", text: "text-orange-400",  bg: "bg-orange-500/10",  border: "border-orange-500/20" },
  Limpieza:         { dot: "#34d399", text: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
  Agroquimicos:     { dot: "#f87171", text: "text-red-400",     bg: "bg-red-500/10",     border: "border-red-500/20" },
  Aceite:           { dot: "#fbbf24", text: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/20" },
}

const AVATAR_PALETTE = [
  { from: "#6366f1", to: "#4338ca", color: "#fff" },
  { from: "#f5eb4a", to: "#c9a500", color: "#0d0d1a" },
  { from: "#8b5cf6", to: "#7c3aed", color: "#fff" },
  { from: "#06b6d4", to: "#0284c7", color: "#fff" },
  { from: "#10b981", to: "#059669", color: "#fff" },
  { from: "#f97316", to: "#ea580c", color: "#fff" },
  { from: "#ec4899", to: "#db2777", color: "#fff" },
]

function avatarFor(name: string) {
  const idx = Math.abs((name?.charCodeAt(0) ?? 65) - 65) % AVATAR_PALETTE.length
  return AVATAR_PALETTE[idx]
}

function getRubroStyle(r: string) {
  return RUBRO_STYLES[r] ?? { dot: "var(--muted-foreground)", text: "text-muted-foreground", bg: "bg-muted/50", border: "border-border" }
}

interface ClientesTableProps {
  initialClientes: Cliente[]
  initialTotal: number
  filtros: Filtros
}


const COLUMNS: ColumnDef<Cliente>[] = [
  {
    key: "id",
    header: "N.",
    sortable: true,
    skeleton: <div className="h-3 w-8 rounded-full bg-muted animate-pulse" />,
    cell: (c) => (
      <span className="text-xs font-mono text-muted-foreground tabular-nums">{c.id_cliente}</span>
    ),
  },
  {
    key: "marca",
    header: "Marca",
    sortable: true,
    skeleton: (
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-muted animate-pulse shrink-0" />
        <div className="h-3.5 w-28 rounded-full bg-muted animate-pulse" />
      </div>
    ),
    cell: (c) => {
      const av = avatarFor(c.marca || "")
      return (
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 border border-border"
            style={{ background: `linear-gradient(135deg, ${av.from}, ${av.to})`, color: av.color }}
          >
            {(c.marca || "?")?.[0]?.toUpperCase()}
          </div>
          <span className="text-sm font-semibold text-foreground group-hover:text-gold transition-colors">
            {c.marca}
          </span>
        </div>
      )
    },
  },
  {
    key: "rubro",
    header: "Rubro",
    skeleton: <div className="h-6 w-20 rounded-lg bg-muted animate-pulse" />,
    cell: (c) => {
      const rs = getRubroStyle(c.rubro || "")
      return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium border ${rs.bg} ${rs.text} ${rs.border}`}>
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: rs.dot }} />
          {c.rubro}
        </span>
      )
    },
  },
  {
    key: "razon_social",
    header: "Razón Social",
    sortable: true,
    cellClassName: "max-w-[180px]",
    skeleton: <div className="h-3 w-36 rounded-full bg-muted animate-pulse" />,
    cell: (c) => <span className="text-sm text-muted-foreground truncate block">{c.razon_social}</span>,
  },
  {
    key: "localidad",
    header: "Localidad",
    sortable: true,
    skeleton: <div className="h-3 w-24 rounded-full bg-muted animate-pulse" />,
    cell: (c) => <span className="text-sm text-muted-foreground truncate block">{c.localidad}</span>,
  },
  {
    key: "provincia",
    header: "Provincia",
    skeleton: <div className="h-3 w-24 rounded-full bg-muted animate-pulse" />,
    cell: (c) => <span className="text-sm text-muted-foreground truncate block">{c.provincia}</span>,
  },
  {
    key: "producto",
    header: "Producto",
    cellClassName: "max-w-[140px]",
    skeleton: <div className="h-3 w-28 rounded-full bg-muted animate-pulse" />,
    cell: (c) => <span className="text-sm text-muted-foreground truncate block">{c.producto ?? ""}</span>,
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

export function ClientesTable({ initialClientes, initialTotal, filtros: initialFiltros }: ClientesTableProps) {
  const [clientes, setClientes] = useState<Cliente[]>(initialClientes)
  const [loading, setLoading] = useState(true)
  const [filtros, setFiltros] = useState<Filtros>(initialFiltros)
  const [search, setSearch] = useState("")
  const [rubro, setRubro] = useState("")
  const [provincia, setProvincia] = useState("")
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(initialTotal)
  const [sortBy, setSortBy] = useState("marca")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null)
  const [nuevoDialogOpen, setNuevoDialogOpen] = useState(false)
  const [searchDebounced, setSearchDebounced] = useState(search)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    api.dashboard.filtros().then(setFiltros).catch(() => {})
  }, [])

  useEffect(() => {
    debounceRef.current = setTimeout(() => setSearchDebounced(search), 300)
    return () => { clearTimeout(debounceRef.current) }
  }, [search])

  const perPage = 20
  const totalPages = Math.ceil(total / perPage)
  const nf = new Intl.NumberFormat("es-AR")

  const fetchClientes = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.clientes.list({
        page,
        per_page: perPage,
        search: searchDebounced?.trim() || undefined,
        rubro: rubro || undefined,
        provincia: provincia || undefined,
        sort_by: sortBy,
        sort_dir: sortDir,
      })
      setClientes((res.data as Cliente[]) || [])
      setTotal(res.total || 0)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [page, searchDebounced, rubro, provincia, sortBy, sortDir])

  useEffect(() => {
    fetchClientes()
  }, [fetchClientes])

  const handleSort = (key: string) => {
    if (key === sortBy) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortBy(key)
      setSortDir("asc")
    }
    setPage(1)
  }

  const handleClienteUpdate = (updated: Cliente) => {
    setClientes((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
    setSelectedCliente((prev) => (prev?.id === updated.id ? updated : prev))
  }

  const handleClienteCreated = (created: Cliente) => {
    setClientes((prev) => [created, ...prev])
    setTotal((t) => t + 1)
  }

  const handleClienteDeleted = (id: number) => {
    setClientes((prev) => prev.filter((c) => c.id !== id))
    setTotal((t) => t - 1)
    setSelectedCliente(null)
  }

  return (
    <div className="p-6 lg:p-8 space-y-5 max-w-[1200px] mx-auto">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-1 h-6 rounded-full bg-gold" />
          <div>
            <h2 className="text-xl font-semibold text-foreground">Clientes</h2>
            <p className="text-muted-foreground text-sm">{nf.format(total)} registros encontrados</p>
          </div>
        </div>
        <Button
          onClick={() => setNuevoDialogOpen(true)}
          className="h-10 px-4 rounded-xl bg-brand hover:bg-brand-strong text-white border border-brand text-sm font-medium gap-2 shrink-0"
        >
          <Plus className="w-4 h-4" />
          Nuevo cliente
        </Button>
        {(rubro || provincia) && (
          <div className="flex flex-wrap items-center gap-2">
            {rubro && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-chart-1/10 text-chart-1 border border-chart-1/20 px-3 py-1.5 rounded-xl">
                {rubro}
                <button onClick={() => { setRubro(""); setPage(1) }} className="hover:text-foreground transition-colors">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {provincia && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-gold/10 text-gold border border-gold/20 px-3 py-1.5 rounded-xl">
                {provincia}
                <button onClick={() => { setProvincia(""); setPage(1) }} className="hover:text-foreground transition-colors">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
          </div>
        )}
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
          {(search || rubro || provincia) && (
            <button
              onClick={() => { setSearch(""); setRubro(""); setProvincia(""); setPage(1) }}
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
                placeholder="#ID, marca, razón social, localidad, producto…"
                className="pl-10 h-11 rounded-xl bg-input border-border text-foreground placeholder:text-muted-foreground focus-visible:border-gold/40 focus-visible:ring-gold/15 transition-all"
              />
            </div>
          </div>
          <div className="min-w-[180px]">
            <label className="block text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
              Rubro
            </label>
            <div className="relative">
              <Tag className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <select
                value={rubro}
                onChange={(e) => { setRubro(e.target.value); setPage(1) }}
                aria-label="Filtrar por rubro"
                className="h-11 w-full pl-10 pr-10 bg-input border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-gold/40 focus:ring-2 focus:ring-gold/10 transition-all cursor-pointer appearance-none"
              >
                <option value="" className="bg-background">Todos los rubros</option>
                {filtros.rubros.map((r) => <option key={r} value={r} className="bg-background">{r}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            </div>
          </div>
          <div className="min-w-[180px]">
            <label className="block text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
              Provincia
            </label>
            <div className="relative">
              <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <select
                value={provincia}
                onChange={(e) => { setProvincia(e.target.value); setPage(1) }}
                aria-label="Filtrar por provincia"
                className="h-11 w-full pl-10 pr-10 bg-input border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-gold/40 focus:ring-2 focus:ring-gold/10 transition-all cursor-pointer appearance-none"
              >
                <option value="" className="bg-background">Todas las provincias</option>
                {filtros.provincias.map((p) => <option key={p} value={p} className="bg-background">{p}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      {/* ── Table ── */}
      <DataTable
        columns={COLUMNS}
        data={clientes}
        loading={loading}
        keyExtractor={(c) => c.id}
        onRowClick={setSelectedCliente}
        sortBy={sortBy}
        sortDir={sortDir}
        onSort={handleSort}
        emptyTitle="Sin resultados"
        emptyDescription="No se encontraron clientes con los filtros aplicados"
      >
        {/* ── Pagination (slot dentro del mismo borde redondeado) ── */}
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

      <ClienteDetailDialog
        cliente={selectedCliente}
        onClose={() => setSelectedCliente(null)}
        onUpdate={handleClienteUpdate}
        onDelete={handleClienteDeleted}
      />
      <ClienteNuevoDialog
        open={nuevoDialogOpen}
        onClose={() => setNuevoDialogOpen(false)}
        onCreated={handleClienteCreated}
        filtros={filtros}
      />
    </div>
  )
}
