"use client"

import { useCallback, useEffect, useState } from "react"
import { api } from "@/lib/api"
import type { OrdenTrabajo, EstadoOrden } from "@/lib/api/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { DataTable, type ColumnDef } from "@/components/ui/data-table"
import {
  ClipboardList, Plus, Search, ChevronLeft, ChevronRight, Pencil, Trash2, FileText,
} from "lucide-react"
import { OrdenFormDialog } from "./orden-form-dialog"
import { OrdenDetailDialog } from "./orden-detail-dialog"
import { EscanearOrdenButton } from "./escanear-orden-button"
import type { OrderPrefill } from "@/lib/voice/types"

// ─── Helpers de estado ─────────────────────────────────────────────────────

const ESTADOS: { value: EstadoOrden | ""; label: string }[] = [
  { value: "", label: "Todos" },
  { value: "borrador", label: "Borrador" },
  { value: "pendiente", label: "Pendiente" },
  { value: "en_proceso", label: "En Proceso" },
  { value: "completada", label: "Completada" },
  { value: "cancelada", label: "Cancelada" },
]

function estadoBadge(estado: EstadoOrden) {
  const map: Record<EstadoOrden, { label: string; className: string }> = {
    borrador:   { label: "Borrador",   className: "bg-zinc-100 text-zinc-600 border-zinc-200" },
    pendiente:  { label: "Pendiente",  className: "bg-yellow-50 text-yellow-700 border-yellow-200" },
    en_proceso: { label: "En Proceso", className: "bg-blue-50 text-blue-700 border-blue-200" },
    completada: { label: "Completada", className: "bg-green-50 text-green-700 border-green-200" },
    cancelada:  { label: "Cancelada",  className: "bg-red-50 text-red-600 border-red-200" },
  }
  const s = map[estado] ?? { label: estado, className: "" }
  return (
    <Badge variant="outline" className={`text-[11px] px-2 py-0.5 font-medium ${s.className}`}>
      {s.label}
    </Badge>
  )
}

// ─── Componente principal ──────────────────────────────────────────────────

interface Props {
  initialOrdenes: OrdenTrabajo[]
  initialTotal: number
}

export function OrdenesTable({ initialOrdenes, initialTotal }: Props) {
  const [ordenes, setOrdenes] = useState<OrdenTrabajo[]>(initialOrdenes)
  const [total, setTotal] = useState(initialTotal)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [estadoFilter, setEstadoFilter] = useState<EstadoOrden | "">("")
  const [loading, setLoading] = useState(true)

  const [formOpen, setFormOpen] = useState(false)
  const [editOrden, setEditOrden] = useState<OrdenTrabajo | null>(null)
  const [detailOrden, setDetailOrden] = useState<OrdenTrabajo | null>(null)
  const [prefill, setPrefill] = useState<OrderPrefill | null>(null)

  // ── Escuchar evento del agente de voz ─────────────────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const payload = (e as CustomEvent<OrderPrefill>).detail
      setPrefill(payload)
      setEditOrden(null)
      setFormOpen(true)
    }
    window.addEventListener("eti:open-order-form", handler)
    return () => window.removeEventListener("eti:open-order-form", handler)
  }, [])

  const PER_PAGE = 20

  const fetchOrdenes = useCallback(async (p: number, s: string, estado: string) => {
    setLoading(true)
    try {
      const params: Record<string, string | number | undefined> = {
        page: p,
        per_page: PER_PAGE,
      }
      if (s) params.search = s
      if (estado) params.estado = estado
      const res = await api.ordenes.list(params)
      setOrdenes(res.data)
      setTotal(res.total)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchOrdenes(1, search, estadoFilter)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const t = setTimeout(() => { setPage(1); fetchOrdenes(1, search, estadoFilter) }, 300)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, estadoFilter])

  const goToPage = (p: number) => {
    setPage(p)
    fetchOrdenes(p, search, estadoFilter)
  }

  const handleOrdenSaved = (orden: OrdenTrabajo) => {
    if (editOrden) {
      setOrdenes((prev) => prev.map((o) => (o.id === orden.id ? orden : o)))
    } else {
      setOrdenes((prev) => [orden, ...prev])
      setTotal((t) => t + 1)
    }
    setEditOrden(null)
    setPrefill(null)
    setFormOpen(false)
  }

  const handleDelete = async (orden: OrdenTrabajo) => {
    if (!confirm(`¿Eliminar la orden ${orden.numero}? Esta acción no se puede deshacer.`)) return
    try {
      await api.ordenes.delete(orden.id)
      setOrdenes((prev) => prev.filter((o) => o.id !== orden.id))
      setTotal((t) => t - 1)
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al eliminar")
    }
  }

  const handleEdit = (orden: OrdenTrabajo) => {
    setEditOrden(orden)
    setFormOpen(true)
  }

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE))

  const columns: ColumnDef<OrdenTrabajo>[] = [
    {
      key: "numero",
      header: "Número",
      headerClassName: "text-gold w-28",
      skeleton: <div className="h-3 w-16 rounded-full bg-muted animate-pulse" />,
      cell: (orden) => (
        <span className="font-mono font-semibold text-gold text-xs tracking-wide">
          {orden.numero}
        </span>
      ),
    },
    {
      key: "cliente",
      header: "Cliente",
      headerClassName: "text-gold",
      skeleton: <div className="h-3 w-36 rounded-full bg-muted animate-pulse" />,
      cell: (orden) => (
        <span className="font-medium text-foreground">
          {orden.cliente_nombre ?? `Cliente #${orden.cliente_id}`}
        </span>
      ),
    },
    {
      key: "fecha",
      header: "Fecha",
      headerClassName: "text-gold w-32",
      skeleton: <div className="h-3 w-20 rounded-full bg-muted animate-pulse" />,
      cell: (orden) => (
        <span className="text-muted-foreground text-xs">
          {orden.fecha ? new Date(orden.fecha + "T00:00:00").toLocaleDateString("es-AR") : "—"}
        </span>
      ),
    },
    {
      key: "estado",
      header: "Estado",
      headerClassName: "text-gold w-32",
      skeleton: <div className="h-5 w-20 rounded-full bg-muted animate-pulse" />,
      cell: (orden) => estadoBadge(orden.estado),
    },
    {
      key: "cantidad",
      header: "Cantidad",
      headerClassName: "text-gold w-24",
      skeleton: <div className="h-3 w-12 rounded-full bg-muted animate-pulse" />,
      cell: (orden) => (
        <span className="text-muted-foreground text-xs">
          {orden.cantidad != null ? orden.cantidad.toLocaleString("es-AR") : "—"}
        </span>
      ),
    },
    {
      key: "acciones",
      header: "",
      headerClassName: "w-32",
      cellClassName: "text-right",
      cell: (orden) => (
        <div
          className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => window.open(`/print/ordenes/${orden.id}`, "_blank")}
            className="p-1.5 rounded-lg hover:bg-blue-500/10 text-muted-foreground hover:text-blue-600 transition-colors"
            title="Ver PDF"
          >
            <FileText className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => handleEdit(orden)}
            className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
            title="Editar"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => handleDelete(orden)}
            className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
            title="Eliminar"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    },
  ]

  return (
    <div className="p-6 lg:p-8 space-y-5 max-w-[1200px] mx-auto">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-1 h-6 rounded-full bg-[#1a1866]" />
          <div>
            <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-[#1a1866]" />
              Órdenes de Trabajo
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {total} orden{total !== 1 ? "es" : ""} registrada{total !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <EscanearOrdenButton />
          <Button
            onClick={() => { setEditOrden(null); setFormOpen(true) }}
            className="bg-[#1a1866] hover:bg-[#14115a] text-white gap-2 h-10 px-4 rounded-xl"
          >
            <Plus className="w-4 h-4" />
            Nueva Orden
          </Button>
        </div>
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
              onClick={() => setEstadoFilter(value as EstadoOrden | "")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                estadoFilter === value
                  ? "bg-[#1a1866] text-white border-[#1a1866]"
                  : "bg-background text-muted-foreground border-border hover:border-foreground/30"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tabla ── */}
      <DataTable
        columns={columns}
        data={ordenes}
        loading={loading}
        keyExtractor={(o) => o.id}
        onRowClick={setDetailOrden}
        emptyIcon={<ClipboardList className="w-8 h-8 text-muted-foreground" strokeWidth={1.5} />}
        emptyTitle="No hay órdenes"
        emptyDescription="Creá la primera orden de trabajo"
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

      {/* ── Dialogs ── */}
      <OrdenFormDialog
        open={formOpen}
        onOpenChange={(o) => { setFormOpen(o); if (!o) { setEditOrden(null); setPrefill(null) } }}
        orden={editOrden}
        prefill={prefill}
        onSaved={handleOrdenSaved}
      />
      {detailOrden && (
        <OrdenDetailDialog
          orden={detailOrden}
          open={!!detailOrden}
          onOpenChange={(o) => { if (!o) setDetailOrden(null) }}
          onEdit={() => { handleEdit(detailOrden); setDetailOrden(null) }}
        />
      )}
    </div>
  )
}
