"use client"

import { ChevronRight } from "lucide-react"
import { DataTable, type ColumnDef } from "@/components/ui/data-table"
import { Pagination } from "@/components/ui/pagination"
import type { Cliente } from "@/types/database"
import type { SortDir } from "../_hooks/use-clientes"

// ── Estilos por rubro / avatar (presentación) ──────────────────────────────────
const RUBRO_STYLES: Record<string, { dot: string; text: string; bg: string; border: string }> = {
  Agua:             { dot: "#22d3ee", text: "text-cyan-400",    bg: "bg-cyan-500/10",    border: "border-cyan-500/20" },
  "Jugos-Gaseosas": { dot: "#fb923c", text: "text-orange-400",  bg: "bg-orange-500/10",  border: "border-orange-500/20" },
  Limpieza:         { dot: "#34d399", text: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
  Agroquimicos:     { dot: "#f87171", text: "text-red-400",     bg: "bg-red-500/10",     border: "border-red-500/20" },
  Aceite:           { dot: "#fbbf24", text: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/20" },
}

const AVATAR_PALETTE = [
  { from: "var(--primary-400)", to: "var(--primary-600)", color: "#fff" },
  { from: "var(--gold)",        to: "var(--gold-text)",   color: "#0d0d1a" },
  { from: "#8b5cf6", to: "#7c3aed", color: "#fff" },
  { from: "#06b6d4", to: "#0284c7", color: "#fff" },
  { from: "#10b981", to: "#059669", color: "#fff" },
  { from: "#f97316", to: "#ea580c", color: "#fff" },
  { from: "#ec4899", to: "#db2777", color: "#fff" },
]

const avatarFor = (name: string) =>
  AVATAR_PALETTE[Math.abs((name?.charCodeAt(0) ?? 65) - 65) % AVATAR_PALETTE.length]

const rubroStyle = (r: string) =>
  RUBRO_STYLES[r] ?? { dot: "var(--muted-foreground)", text: "text-muted-foreground", bg: "bg-muted/50", border: "border-border" }

const skel = (w: string) => <div className={`h-3 ${w} animate-pulse rounded-full bg-muted`} />

const COLUMNS: ColumnDef<Cliente>[] = [
  { key: "id", header: "N.", sortable: true, skeleton: skel("w-8"),
    cell: (c) => <span className="font-mono text-xs tabular-nums text-muted-foreground">{c.id_cliente}</span> },
  { key: "marca", header: "Marca", sortable: true,
    skeleton: <div className="flex items-center gap-3"><div className="h-8 w-8 animate-pulse rounded-lg bg-muted" /><div className="h-3.5 w-28 animate-pulse rounded-full bg-muted" /></div>,
    cell: (c) => {
      const av = avatarFor(c.marca || "")
      return (
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border text-xs font-bold"
            style={{ background: `linear-gradient(135deg, ${av.from}, ${av.to})`, color: av.color }}>
            {(c.marca || "?")?.[0]?.toUpperCase()}
          </div>
          <span className="text-sm font-semibold text-foreground transition-colors group-hover:text-gold">{c.marca}</span>
        </div>
      )
    } },
  { key: "rubro", header: "Rubro", skeleton: <div className="h-6 w-20 animate-pulse rounded-lg bg-muted" />,
    cell: (c) => {
      const rs = rubroStyle(c.rubro || "")
      return (
        <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium ${rs.bg} ${rs.text} ${rs.border}`}>
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: rs.dot }} />
          {c.rubro}
        </span>
      )
    } },
  { key: "razon_social", header: "Razón Social", sortable: true, cellClassName: "max-w-[180px]", skeleton: skel("w-36"),
    cell: (c) => <span className="block truncate text-sm text-muted-foreground">{c.razon_social}</span> },
  { key: "localidad", header: "Localidad", sortable: true, skeleton: skel("w-24"),
    cell: (c) => <span className="block truncate text-sm text-muted-foreground">{c.localidad}</span> },
  { key: "provincia", header: "Provincia", skeleton: skel("w-24"),
    cell: (c) => <span className="block truncate text-sm text-muted-foreground">{c.provincia}</span> },
  { key: "producto", header: "Producto", cellClassName: "max-w-[140px]", skeleton: skel("w-28"),
    cell: (c) => <span className="block truncate text-sm text-muted-foreground">{c.producto ?? ""}</span> },
  { key: "arrow", header: "", skeleton: <div className="h-4 w-4 animate-pulse rounded bg-muted" />,
    cell: () => <ChevronRight className="h-4 w-4 text-muted-foreground transition-all duration-150 group-hover:translate-x-0.5 group-hover:text-gold" /> },
]

export function ClientesTable({
  clientes, loading, sortBy, sortDir, onSort, onRowClick,
  page, perPage, total, onPageChange,
}: {
  clientes: Cliente[]
  loading: boolean
  sortBy: string
  sortDir: SortDir
  onSort: (key: string) => void
  onRowClick: (c: Cliente) => void
  page: number
  perPage: number
  total: number
  onPageChange: (page: number) => void
}) {
  return (
    <DataTable
      columns={COLUMNS}
      data={clientes}
      loading={loading}
      keyExtractor={(c) => c.id}
      onRowClick={onRowClick}
      sortBy={sortBy}
      sortDir={sortDir}
      onSort={onSort}
      emptyTitle="Sin resultados"
      emptyDescription="No se encontraron clientes con los filtros aplicados"
    >
      <Pagination page={page} perPage={perPage} total={total} onPageChange={onPageChange} />
    </DataTable>
  )
}
