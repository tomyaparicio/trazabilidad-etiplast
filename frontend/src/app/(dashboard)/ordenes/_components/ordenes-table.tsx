"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { api } from "@/lib/api"
import type { OrdenTrabajo, EstadoOrden } from "@/lib/api/types"
import { Button } from "@/components/ui/button"
import { usePermisos } from "@/components/permisos-provider"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { DataTable, type ColumnDef } from "@/components/ui/data-table"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { PageContainer } from "@/components/ui/page-container"
import { PageHeader } from "@/components/ui/page-header"
import {
  ClipboardList, Plus, Search, ChevronLeft, ChevronRight, Pencil, Trash2, FileText,
  AlertTriangle, RotateCcw,
} from "lucide-react"
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
    borrador:   { label: "Borrador",   className: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30" },
    pendiente:  { label: "Pendiente",  className: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
    en_proceso: { label: "En Proceso", className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
    completada: { label: "Completada", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
    cancelada:  { label: "Cancelada",  className: "bg-red-500/15 text-red-400 border-red-500/30" },
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
  const { can } = usePermisos()
  const [ordenes, setOrdenes] = useState<OrdenTrabajo[]>(initialOrdenes)
  const [total, setTotal] = useState(initialTotal)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [estadoFilter, setEstadoFilter] = useState<EstadoOrden | "">("")
  const [loading, setLoading] = useState(true)

  const router = useRouter()
  const [detailOrden, setDetailOrden] = useState<OrdenTrabajo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<OrdenTrabajo | null>(null)
  // Dónde está cada orden, del tablero de planta. Se pide una sola vez para
  // toda la tabla en vez de preguntar por orden: es una consulta, no N.
  const [ubicaciones, setUbicaciones] = useState<Map<number, string>>(new Map())

  // ── Agente de voz: el prefill viaja por sessionStorage a /ordenes/nueva ──
  // El tablero se refresca solo: la columna «Dónde está» sigue a la planta sin
  // que haya que recargar la página.
  useEffect(() => {
    let vivo = true
    const traer = () =>
      api.produccion.tablero()
        .then((t) => {
          if (!vivo) return
          // Impresión muestra la máquina (Venus, ReinaFlex…); extrusión y
          // troquelado muestran la etapa, porque ahí no se elige máquina.
          const m = new Map<number, string>()
          for (const maq of t.maquinas) if (maq.orden) m.set(maq.orden.id, maq.nombre)
          for (const et of t.etapas) for (const o of et.ordenes) m.set(o.id, et.titulo)
          setUbicaciones(m)
        })
        .catch(() => { /* la columna queda en «—»: no vale romper el listado */ })
    traer()
    const t = setInterval(traer, 15_000)
    return () => { vivo = false; clearInterval(t) }
  }, [])

  useEffect(() => {
    const handler = (e: Event) => {
      const payload = (e as CustomEvent<OrderPrefill>).detail
      try { sessionStorage.setItem("eti:orden-prefill", JSON.stringify(payload)) } catch { /* sin prefill */ }
      router.push("/ordenes/nueva")
    }
    window.addEventListener("eti:open-order-form", handler)
    return () => window.removeEventListener("eti:open-order-form", handler)
  }, [router])

  const PER_PAGE = 20

  const fetchOrdenes = useCallback(async (p: number, s: string, estado: string) => {
    setLoading(true)
    setError(null)
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
      setError(err instanceof Error ? err.message : "No se pudieron cargar las órdenes")
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

  const handleDeleteClick = (orden: OrdenTrabajo) => setDeleteTarget(orden)

  const handleEdit = (orden: OrdenTrabajo) => router.push(`/ordenes/${orden.id}/editar`)

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
      key: "donde",
      header: "Dónde está",
      headerClassName: "text-gold w-40",
      skeleton: <div className="h-3 w-20 rounded-full bg-muted animate-pulse" />,
      cell: (orden) => {
        const maquina = ubicaciones.get(orden.id)
        if (!maquina) {
          return <span className="text-muted-foreground text-xs">—</span>
        }
        return (
          <span className="rounded-md bg-brand/10 px-2 py-0.5 text-xs font-semibold text-brand">
            {maquina}
          </span>
        )
      },
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
            className="p-1.5 rounded-lg hover:bg-blue-500/10 text-muted-foreground hover:text-blue-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            title="Ver PDF"
            aria-label="Ver PDF de la orden"
          >
            <FileText className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => handleEdit(orden)}
            className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            title="Editar"
            aria-label="Editar orden"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => handleDeleteClick(orden)}
            className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            title="Eliminar"
            aria-label="Eliminar orden"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    },
  ]

  return (
    <PageContainer>

      {/* ── Header ── */}
      <PageHeader
        icon={ClipboardList}
        title="Órdenes de Trabajo"
        subtitle={`${total} orden${total !== 1 ? "es" : ""} registrada${total !== 1 ? "s" : ""}`}
        actions={
          <>
            <EscanearOrdenButton />
            {can("ordenes:crear") && (
              <Button
                onClick={() => router.push("/ordenes/nueva")}
                className="h-11 gap-2 rounded-xl bg-gold px-4 text-sm font-semibold text-gold-foreground hover:bg-gold hover:brightness-95"
              >
                <Plus className="w-4 h-4" />
                Nueva Orden
              </Button>
            )}
          </>
        }
      />

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
          title="No se pudieron cargar las órdenes"
          description={error}
          action={
            <Button
              variant="outline"
              onClick={() => fetchOrdenes(page, search, estadoFilter)}
              className="gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Reintentar
            </Button>
          }
        />
      ) : (
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
      )}

      {/* ── Dialogs ── */}
      {detailOrden && (
        <OrdenDetailDialog
          orden={detailOrden}
          open={!!detailOrden}
          onOpenChange={(o) => { if (!o) setDetailOrden(null) }}
          onEdit={() => { handleEdit(detailOrden); setDetailOrden(null) }}
        />
      )}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null) }}
        title={deleteTarget ? `¿Eliminar la orden ${deleteTarget.numero}?` : "¿Eliminar orden?"}
        description="Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        variant="destructive"
        onConfirm={async () => {
          if (!deleteTarget) return
          const numero = deleteTarget.numero
          await api.ordenes.delete(deleteTarget.id)
          setOrdenes((prev) => prev.filter((o) => o.id !== deleteTarget.id))
          setTotal((t) => t - 1)
          toast.success(`Orden ${numero} eliminada`)
        }}
      />
    </PageContainer>
  )
}
