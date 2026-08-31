"use client"

import {
  ChevronRight, Droplet, Droplets, CupSoda, SprayCan, Sprout, Tag, MapPin, Package, Wine, Milk, FlaskConical, type LucideIcon,
} from "lucide-react"
import { DataTable, type ColumnDef } from "@/components/ui/data-table"
import { Pagination } from "@/components/ui/pagination"
import type { Cliente } from "@/types/database"
import type { SortDir } from "../_hooks/use-clientes"

// ── Rubro: ícono + color por categoría (fallback = Tag / neutro) ────────────────
const RUBRO_STYLES: Record<string, { icon: LucideIcon; text: string; bg: string; border: string }> = {
  Agua:             { icon: Droplets, text: "text-cyan-200",    bg: "bg-cyan-500/15",    border: "border-cyan-400/40" },
  "Jugos-Gaseosas": { icon: CupSoda,  text: "text-orange-200",  bg: "bg-orange-500/15",  border: "border-orange-400/40" },
  Limpieza:         { icon: SprayCan, text: "text-emerald-200", bg: "bg-emerald-500/15", border: "border-emerald-400/40" },
  Agroquimicos:     { icon: Sprout,   text: "text-red-200",     bg: "bg-red-500/15",     border: "border-red-400/40" },
  Aceite:           { icon: Droplet,  text: "text-amber-200",   bg: "bg-amber-500/15",   border: "border-amber-400/40" },
}
const rubroStyle = (r: string) =>
  RUBRO_STYLES[r] ?? { icon: Tag, text: "text-muted-foreground", bg: "bg-muted/50", border: "border-border" }

// ── Avatar de marca: color estable hasheado del NOMBRE COMPLETO (no solo la
//    inicial), para que marcas parecidas ("Acqua Ba", "Acqua Bella") se distingan.
const AVATAR_PALETTE = [
  { from: "var(--primary-400)", to: "var(--primary-600)", color: "#fff" },
  { from: "#8b5cf6", to: "#7c3aed", color: "#fff" },
  { from: "#06b6d4", to: "#0284c7", color: "#fff" },
  { from: "#10b981", to: "#059669", color: "#fff" },
  { from: "#f97316", to: "#ea580c", color: "#fff" },
  { from: "#ec4899", to: "#db2777", color: "#fff" },
  { from: "#f5eb4a", to: "#d4c81f", color: "#0d0d1a" },
  { from: "#3b82f6", to: "#2563eb", color: "#fff" },
]
const hashStr = (s: string) => {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0
  return Math.abs(h)
}
const avatarFor = (name: string) => AVATAR_PALETTE[hashStr(name || "?") % AVATAR_PALETTE.length]

// ── Badge según el PRODUCTO (por palabra clave) — color fuerte y distinto para
//    que se note a simple vista. Cae al rubro y luego a un neutro legible.
//    Ej.: "Agua x 500 cc" → cyan; "Lavandina x 1 lt" → verde; "Jugo" → naranja.
const norm = (s: string) => (s || "").toLowerCase()
type ProductoStyle = { icon: LucideIcon; bg: string; text: string; border: string }
const PRODUCTO_STYLES: (ProductoStyle & { match: string[] })[] = [
  { match: ["lavandina", "cloro", "detergente", "limpia", "limpieza", "jabon", "desinfect", "suavizante"], icon: SprayCan,     bg: "bg-emerald-500/25", text: "text-emerald-100", border: "border-emerald-400/50" },
  { match: ["agua", "mineral", "soda"],                               icon: Droplets,     bg: "bg-cyan-500/25",    text: "text-cyan-100",    border: "border-cyan-400/50" },
  { match: ["jugo", "gaseosa", "bebida", "refresco", "energizante"],  icon: CupSoda,      bg: "bg-orange-500/25",  text: "text-orange-100",  border: "border-orange-400/50" },
  { match: ["vino", "espumante", "cerveza", "licor"],                 icon: Wine,         bg: "bg-rose-500/25",    text: "text-rose-100",    border: "border-rose-400/50" },
  { match: ["leche", "lacteo", "yogur", "crema"],                     icon: Milk,         bg: "bg-violet-500/25",  text: "text-violet-100",  border: "border-violet-400/50" },
  { match: ["aceite", "oliva", "girasol"],                            icon: Droplet,      bg: "bg-amber-500/25",   text: "text-amber-100",   border: "border-amber-400/50" },
  { match: ["agroquimic", "fertilizante", "herbicida", "pesticida", "fitosanitario"], icon: Sprout, bg: "bg-red-500/25", text: "text-red-100", border: "border-red-400/50" },
  { match: ["quimico", "solvente", "acido"],                          icon: FlaskConical, bg: "bg-fuchsia-500/25", text: "text-fuchsia-100", border: "border-fuchsia-400/50" },
]
const NEUTRO: ProductoStyle = { icon: Package, bg: "bg-muted/80", text: "text-foreground", border: "border-border" }
const productoStyle = (producto?: string | null, rubro?: string | null): ProductoStyle => {
  const t = `${norm(producto ?? "")} ${norm(rubro ?? "")}`
  return PRODUCTO_STYLES.find((p) => p.match.some((m) => t.includes(m))) ?? NEUTRO
}

// Extrae la presentación/tamaño del nombre: "Agua x 500 cc" → "500 cc". Sin " x " → null.
const sizeFrom = (nombre?: string | null) => {
  if (!nombre) return null
  const parts = nombre.split(/\s+x\s+/i)
  return parts.length > 1 ? parts[parts.length - 1].trim() : null
}
// Presentaciones distintas del cliente. Por cada producto usa el TAMAÑO
// ("Agua x 500 cc" → "500 cc"); si no tiene tamaño cargado, usa el nombre
// tal cual ("Agua", "Soda"). Deduplica sin importar mayúsculas/espacios.
const presentacionesDe = (c: Cliente): string[] => {
  const out: string[] = []
  const seen = new Set<string>()
  for (const p of c.productos ?? []) {
    const raw = (sizeFrom(p.nombre) ?? p.nombre ?? "").trim()
    if (!raw) continue
    const key = raw.toLowerCase()
    if (!seen.has(key)) { seen.add(key); out.push(raw) }
  }
  return out
}

const skel = (w: string) => <div className={`h-3 ${w} animate-pulse rounded-full bg-muted`} />
const dash = <span className="text-sm font-medium text-foreground/85/40">—</span>

const COLUMNS: ColumnDef<Cliente>[] = [
  { key: "id", header: "N.", sortable: true, skeleton: skel("w-8"),
    cell: (c) => <span className="font-mono text-xs tabular-nums text-muted-foreground">{c.id_cliente}</span> },
  { key: "marca", header: "Marca", sortable: true,
    skeleton: <div className="flex items-center gap-3"><div className="h-9 w-9 animate-pulse rounded-xl bg-muted" /><div className="h-3.5 w-28 animate-pulse rounded-full bg-muted" /></div>,
    cell: (c) => {
      const av = avatarFor(c.marca || "")
      return (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[13px] font-bold shadow-sm ring-1 ring-inset ring-white/15"
            style={{ background: `linear-gradient(135deg, ${av.from}, ${av.to})`, color: av.color }}>
            {(c.marca || "?")?.[0]?.toUpperCase()}
          </div>
          <span className="text-sm font-semibold text-foreground transition-colors group-hover:text-gold">{c.marca}</span>
        </div>
      )
    } },
  { key: "rubro", header: "Rubro", skeleton: <div className="h-6 w-20 animate-pulse rounded-lg bg-muted" />,
    cell: (c) => {
      if (!c.rubro) return dash
      const rs = rubroStyle(c.rubro)
      const Icon = rs.icon
      return (
        <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[12.5px] font-bold ${rs.bg} ${rs.text} ${rs.border}`}>
          <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2.4} />
          {c.rubro}
        </span>
      )
    } },
  { key: "razon_social", header: "Razón Social", sortable: true, cellClassName: "max-w-[180px]", skeleton: skel("w-36"),
    cell: (c) => c.razon_social ? <span className="block truncate text-sm font-medium text-foreground/85">{c.razon_social}</span> : dash },
  { key: "localidad", header: "Localidad", sortable: true, skeleton: skel("w-24"),
    cell: (c) => c.localidad ? (
      <span className="flex items-center gap-1.5 text-sm font-medium text-foreground/85">
        <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" strokeWidth={2} />
        <span className="truncate">{c.localidad}</span>
      </span>
    ) : dash },
  { key: "provincia", header: "Provincia", skeleton: skel("w-24"),
    cell: (c) => c.provincia ? <span className="block truncate text-sm font-medium text-foreground/85">{c.provincia}</span> : dash },
  { key: "producto", header: "Presentaciones", cellClassName: "max-w-[240px]", skeleton: skel("w-32"),
    cell: (c) => {
      const pres = presentacionesDe(c)
      if (!pres.length && !c.producto) return dash
      const ps = productoStyle(c.producto, c.rubro)
      const Icon = ps.icon
      // Con tamaños: muestro 2 y "+N". Sin tamaños cargados: queda el nombre genérico.
      const label = pres.length
        ? pres.slice(0, 2).join(" · ") + (pres.length > 2 ? ` +${pres.length - 2}` : "")
        : (c.producto as string)
      const full = pres.length ? pres.join(" · ") : (c.producto ?? "")
      return (
        <span title={full} className={`inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[13px] font-bold ${ps.bg} ${ps.text} ${ps.border}`}>
          <Icon className="h-4 w-4 shrink-0" strokeWidth={2.4} />
          <span className="truncate">{label}</span>
        </span>
      )
    } },
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
