"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import type { Remito, EstadoRemito } from "@/lib/api/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { DataTable, type ColumnDef } from "@/components/ui/data-table"
import { EmptyState } from "@/components/ui/empty-state"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  Truck, Plus, Search, ChevronLeft, ChevronRight, Pencil, Trash2, FileText, AlertTriangle, RefreshCw,
} from "lucide-react"
import { RemitoFormDialog } from "./remito-form-dialog"
import { RemitoDetailDialog } from "./remito-detail-dialog"

// ─── Tipos extendidos (el backend devuelve más campos que el tipo base) ─────

export type RemitoX = Remito & {
  cliente_nombre?: string | null
  cliente_razon_social?: string | null
  cliente_cuit?: string | null
  creador_nombre?: string | null
  created_at?: string | null
  updated_at?: string | null
  warnings?: string[]
}

// ─── Helpers de estado ─────────────────────────────────────────────────────

const ESTADOS: { value: EstadoRemito | ""; label: string }[] = [
  { value: "", label: "Todos" },
  { value: "pendiente", label: "Pendiente" },
  { value: "despachado", label: "Despachado" },
  { value: "entregado", label: "Entregado" },
  { value: "anulado", label: "Anulado" },
]

export function estadoRemitoBadge(estado: EstadoRemito) {
  const map: Record<EstadoRemito, { label: string; className: string }> = {
    pendiente:  { label: "Pendiente",  className: "bg-amber-50 text-amber-700 border-amber-200" },
    despachado: { label: "Despachado", className: "bg-blue-50 text-blue-700 border-blue-200" },
    entregado:  { label: "Entregado",  className: "bg-green-50 text-green-700 border-green-200" },
    anulado:    { label: "Anulado",    className: "bg-red-50 text-red-600 border-red-200" },
  }
  const s = map[estado] ?? { label: estado, className: "" }
  return (
    <Badge variant="outline" className={`text-[11px] px-2 py-0.5 font-medium ${s.className}`}>
      {s.label}
    </Badge>
  )
}

// ─── Componente principal ──────────────────────────────────────────────────

export function RemitosTable() {
  const [remitos, setRemitos] = useState<RemitoX[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [estadoFilter, setEstadoFilter] = useState<EstadoRemito | "">("")
  const [loading, setLoading] = useState(true)

  const [formOpen, setFormOpen] = useState(false)
  const [editRemito, setEditRemito] = useState<RemitoX | null>(null)
  const [detailRemito, setDetailRemito] = useState<RemitoX | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<RemitoX | null>(null)
  const [error, setError] = useState("")

  const PER_PAGE = 20

  const fetchRemitos = useCallback(async (p: number, s: string, estado: string) => {
    setLoading(true)
    setError("")
    try {
      const params: { page: number; per_page: number; search?: string; estado?: string } = {
        page: p,
        per_page: PER_PAGE,
      }
      if (s) params.search = s
      if (estado) params.estado = estado
      const res = await api.remitos.list(params)
      setRemitos(res.data as RemitoX[])
      setTotal(res.total)
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : "No se pudieron cargar los remitos")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRemitos(1, search, estadoFilter)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const t = setTimeout(() => { setPage(1); fetchRemitos(1, search, estadoFilter) }, 300)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, estadoFilter])

  const goToPage = (p: number) => {
    setPage(p)
    fetchRemitos(p, search, estadoFilter)
  }

  const handleSaved = (remito: RemitoX) => {
    if (editRemito) {
      setRemitos((prev) => prev.map((r) => (r.id === remito.id ? remito : r)))
    } else {
      setRemitos((prev) => [remito, ...prev])
      setTotal((t) => t + 1)
    }
    setEditRemito(null)
    setFormOpen(false)
  }

  const handleChanged = (remito: RemitoX) => {
    setRemitos((prev) => prev.map((r) => (r.id === remito.id ? remito : r)))
    setDetailRemito(remito)
  }

  const handleEdit = (remito: RemitoX) => {
    setEditRemito(remito)
    setFormOpen(true)
  }

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE))

  const columns: ColumnDef<RemitoX>[] = [
    {
      key: "numero",
      header: "Número",
      headerClassName: "text-gold w-28",
      skeleton: <div className="h-3 w-16 rounded-full bg-muted animate-pulse" />,
      cell: (r) => (
        <span className="font-mono font-semibold text-gold text-xs tracking-wide">
          {r.numero}
        </span>
      ),
    },
    {
      key: "cliente",
      header: "Cliente",
      headerClassName: "text-gold",
      skeleton: <div className="h-3 w-36 rounded-full bg-muted animate-pulse" />,
      cell: (r) => (
        <span className="font-medium text-foreground">
          {r.cliente_nombre ?? `Cliente #${r.cliente_id}`}
        </span>
      ),
    },
    {
      key: "fecha",
      header: "Fecha",
      headerClassName: "text-gold w-32",
      skeleton: <div className="h-3 w-20 rounded-full bg-muted animate-pulse" />,
      cell: (r) => (
        <span className="text-muted-foreground text-xs">
          {r.fecha ? new Date(r.fecha + "T00:00:00").toLocaleDateString("es-AR") : "—"}
        </span>
      ),
    },
    {
      key: "estado",
      header: "Estado",
      headerClassName: "text-gold w-32",
      skeleton: <div className="h-5 w-20 rounded-full bg-muted animate-pulse" />,
      cell: (r) => estadoRemitoBadge(r.estado),
    },
    {
      key: "items",
      header: "Ítems",
      headerClassName: "text-gold w-20",
      skeleton: <div className="h-3 w-8 rounded-full bg-muted animate-pulse" />,
      cell: (r) => (
        <span className="text-muted-foreground text-xs">
          {r.items?.length ?? 0}
        </span>
      ),
    },
    {
      key: "acciones",
      header: "",
      headerClassName: "w-32",
      cellClassName: "text-right",
      cell: (r) => (
        <div
          className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => window.open(`/print/remitos/${r.id}`, "_blank")}
            className="p-1.5 rounded-lg hover:bg-blue-500/10 text-muted-foreground hover:text-blue-600 transition-colors"
            title="Imprimir"
            aria-label="Imprimir remito"
          >
            <FileText className="w-3.5 h-3.5" />
          </button>
          {r.estado === "pendiente" && (
            <>
              <button
                onClick={() => handleEdit(r)}
                className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                title="Editar"
                aria-label="Editar remito"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setDeleteTarget(r)}
                className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                title="Eliminar (solo admin)"
                aria-label="Eliminar remito"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="p-6 lg:p-8 space-y-5 max-w-[1200px] mx-auto">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-1 h-6 rounded-full bg-brand" />
          <div>
            <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
              <Truck className="w-5 h-5 text-brand" />
              Remitos
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {total} remito{total !== 1 ? "s" : ""} registrado{total !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        <Button
          onClick={() => { setEditRemito(null); setFormOpen(true) }}
          className="bg-brand hover:bg-brand-strong text-white gap-2 h-10 px-4 rounded-xl"
        >
          <Plus className="w-4 h-4" />
          Nuevo Remito
        </Button>
      </div>

      {/* ── Filtros ── */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar por número o cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>

        <div className="flex gap-1.5 flex-wrap">
          {ESTADOS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setEstadoFilter(value as EstadoRemito | "")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                estadoFilter === value
                  ? "bg-brand text-white border-brand"
                  : "bg-background text-muted-foreground border-border hover:border-foreground/30"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tabla ── */}
      {error ? (
        <EmptyState
          icon={<AlertTriangle className="w-8 h-8 text-destructive" strokeWidth={1.5} />}
          title="No se pudieron cargar los remitos"
          description={error}
          action={
            <Button onClick={() => fetchRemitos(page, search, estadoFilter)} className="bg-brand hover:bg-brand-strong text-white gap-2">
              <RefreshCw className="w-4 h-4" />
              Reintentar
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={remitos}
          loading={loading}
          keyExtractor={(r) => r.id}
          onRowClick={setDetailRemito}
          emptyIcon={<Truck className="w-8 h-8 text-muted-foreground" strokeWidth={1.5} />}
          emptyTitle="No hay remitos"
          emptyDescription="Creá el primer remito de entrega"
          skeletonRows={8}
        >
          {/* ── Paginación ── */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-border">
              <span className="text-xs text-muted-foreground">
                Página {page} de {totalPages}
              </span>
              <div className="flex gap-1">
                <Button
                  variant="outline" size="sm"
                  onClick={() => goToPage(page - 1)}
                  disabled={page === 1}
                  className="h-8 w-8 p-0"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline" size="sm"
                  onClick={() => goToPage(page + 1)}
                  disabled={page >= totalPages}
                  className="h-8 w-8 p-0"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </DataTable>
      )}

      {/* ── Dialogs ── */}
      <RemitoFormDialog
        open={formOpen}
        onOpenChange={(o) => { setFormOpen(o); if (!o) setEditRemito(null) }}
        remito={editRemito}
        onSaved={handleSaved}
      />
      {detailRemito && (
        <RemitoDetailDialog
          remito={detailRemito}
          open={!!detailRemito}
          onOpenChange={(o) => { if (!o) setDetailRemito(null) }}
          onEdit={() => { handleEdit(detailRemito); setDetailRemito(null) }}
          onChanged={handleChanged}
        />
      )}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null) }}
        title={`¿Eliminar el remito ${deleteTarget?.numero ?? ""}?`}
        description="Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        variant="destructive"
        onConfirm={async () => {
          if (!deleteTarget) return
          await api.remitos.delete(deleteTarget.id)
          setRemitos((prev) => prev.filter((r) => r.id !== deleteTarget.id))
          setTotal((t) => t - 1)
          toast.success(`Remito ${deleteTarget.numero} eliminado`)
        }}
      />
    </div>
  )
}
