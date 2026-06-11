"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { api } from "@/lib/api"
import type { StockItem, TipoStockItem } from "@/lib/api/types"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { DataTable, type ColumnDef } from "@/components/ui/data-table"
import {
  Search, ChevronLeft, ChevronRight, AlertTriangle, Boxes,
  ArrowLeftRight, History, Pencil, Filter, X,
} from "lucide-react"
import { StockItemDialog } from "./stock-item-dialog"
import { MovimientoDialog } from "./movimiento-dialog"
import { KardexSheet } from "./kardex-sheet"

interface StockTableProps {
  tipo: TipoStockItem
  refreshKey: number
  onChanged: () => void
}

function bajoMinimoItem(item: StockItem): boolean {
  return (item.stock_actual ?? 0) < (item.stock_minimo ?? 0)
}

export function StockTable({ tipo, refreshKey, onChanged }: StockTableProps) {
  const [items, setItems] = useState<StockItem[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [searchDebounced, setSearchDebounced] = useState("")
  const [soloBajoMinimo, setSoloBajoMinimo] = useState(false)
  const [movItem, setMovItem] = useState<StockItem | null>(null)
  const [kardexItem, setKardexItem] = useState<StockItem | null>(null)
  const [editItem, setEditItem] = useState<StockItem | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    debounceRef.current = setTimeout(() => setSearchDebounced(search), 300)
    return () => clearTimeout(debounceRef.current)
  }, [search])

  // Reset de página al cambiar tab o filtros
  useEffect(() => {
    setPage(1)
  }, [tipo, searchDebounced, soloBajoMinimo])

  const perPage = 20
  const totalPages = Math.ceil(total / perPage)
  const nf = new Intl.NumberFormat("es-AR")

  const fetchItems = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.stock.list({
        tipo,
        page,
        per_page: perPage,
        search: searchDebounced.trim() || undefined,
        bajo_minimo: soloBajoMinimo || undefined,
      })
      setItems(res.data || [])
      setTotal(res.total || 0)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [tipo, page, searchDebounced, soloBajoMinimo])

  useEffect(() => {
    fetchItems()
  }, [fetchItems, refreshKey])

  const columns: ColumnDef<StockItem>[] = [
    {
      key: "codigo",
      header: "Código",
      skeleton: <div className="h-3 w-16 rounded-full bg-muted animate-pulse" />,
      cell: (i) => (
        <span className="text-xs font-mono text-muted-foreground tabular-nums">{i.codigo || "—"}</span>
      ),
    },
    {
      key: "nombre",
      header: "Nombre",
      skeleton: <div className="h-3.5 w-32 rounded-full bg-muted animate-pulse" />,
      cell: (i) => (
        <span className="text-sm font-semibold text-foreground">{i.nombre}</span>
      ),
    },
    {
      key: "categoria",
      header: "Categoría",
      skeleton: <div className="h-3 w-20 rounded-full bg-muted animate-pulse" />,
      cell: (i) => <span className="text-sm text-muted-foreground">{i.categoria || "—"}</span>,
    },
    {
      key: "stock_actual",
      header: "Stock actual",
      skeleton: <div className="h-3 w-14 rounded-full bg-muted animate-pulse" />,
      cell: (i) => {
        const bajo = bajoMinimoItem(i)
        return (
          <span
            className={`inline-flex items-center gap-1.5 text-sm font-semibold tabular-nums ${
              bajo ? "text-red-400" : "text-foreground"
            }`}
          >
            {bajo && <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
            {nf.format(i.stock_actual ?? 0)}
          </span>
        )
      },
    },
    {
      key: "stock_minimo",
      header: "Mínimo",
      skeleton: <div className="h-3 w-12 rounded-full bg-muted animate-pulse" />,
      cell: (i) => (
        <span className="text-sm text-muted-foreground tabular-nums">{nf.format(i.stock_minimo ?? 0)}</span>
      ),
    },
    {
      key: "unidad",
      header: "Unidad",
      skeleton: <div className="h-3 w-10 rounded-full bg-muted animate-pulse" />,
      cell: (i) => <span className="text-sm text-muted-foreground">{i.unidad || "—"}</span>,
    },
    {
      key: "acciones",
      header: "",
      headerClassName: "text-right",
      cellClassName: "text-right",
      skeleton: <div className="h-7 w-24 rounded-lg bg-muted animate-pulse ml-auto" />,
      cell: (i) => (
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); setMovItem(i) }}
            title="Registrar movimiento"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-gold hover:bg-muted/60 transition-colors"
          >
            <ArrowLeftRight className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setKardexItem(i) }}
            title="Ver kardex"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-gold hover:bg-muted/60 transition-colors"
          >
            <History className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setEditItem(i) }}
            title="Editar ítem"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-gold hover:bg-muted/60 transition-colors"
          >
            <Pencil className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-5">

      {/* ── Filtros ── */}
      <div className="rounded-2xl border border-border bg-card/60 p-5 backdrop-blur-sm">
        <div className="flex items-center gap-2 mb-4">
          <div className="rounded-lg p-1.5 bg-gold/10 border border-gold/20">
            <Filter className="w-3.5 h-3.5 text-gold" strokeWidth={1.5} />
          </div>
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Filtros
          </span>
          {(search || soloBajoMinimo) && (
            <button
              onClick={() => { setSearch(""); setSoloBajoMinimo(false) }}
              className="ml-auto flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground hover:text-gold transition-colors"
            >
              <X className="w-3 h-3" />
              Limpiar todo
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-end gap-4">
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
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Código o nombre…"
                className="pl-10 h-11 rounded-xl bg-input border-border text-foreground placeholder:text-muted-foreground focus-visible:border-gold/40 focus-visible:ring-gold/15 transition-all"
              />
            </div>
          </div>
          <button
            onClick={() => setSoloBajoMinimo((v) => !v)}
            aria-pressed={soloBajoMinimo}
            className={`h-11 px-4 rounded-xl border text-sm font-medium inline-flex items-center gap-2 transition-colors ${
              soloBajoMinimo
                ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                : "bg-input border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            Bajo mínimo
          </button>
        </div>
      </div>

      {/* ── Tabla ── */}
      <DataTable
        columns={columns}
        data={items}
        loading={loading}
        keyExtractor={(i) => i.id}
        onRowClick={setKardexItem}
        emptyIcon={<Boxes className="w-8 h-8 text-muted-foreground" strokeWidth={1.5} />}
        emptyTitle="Sin ítems de stock"
        emptyDescription="No se encontraron ítems con los filtros aplicados"
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

      {/* ── Dialogs y sheet ── */}
      <MovimientoDialog
        item={movItem}
        onClose={() => setMovItem(null)}
        onSaved={() => {
          setMovItem(null)
          onChanged()
        }}
      />
      <KardexSheet item={kardexItem} onClose={() => setKardexItem(null)} />
      <StockItemDialog
        open={!!editItem}
        item={editItem}
        onClose={() => setEditItem(null)}
        onSaved={() => {
          setEditItem(null)
          onChanged()
        }}
      />
    </div>
  )
}
