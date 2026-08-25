"use client"

import { useEffect, useState, useCallback } from "react"
import { api } from "@/lib/api"
import type { AuditEntry } from "@/lib/api/types"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/ui/page-header"
import { DataTable, type ColumnDef } from "@/components/ui/data-table"
import { EmptyState } from "@/components/ui/empty-state"
import {
  ScrollText, Search, ChevronDown, ChevronLeft, ChevronRight,
} from "lucide-react"

const PER_PAGE = 20

/** Entidades conocidas para el filtro (alineadas con AuditLog.entidad del backend). */
const ENTIDADES: { value: string; label: string }[] = [
  { value: "", label: "Todas las entidades" },
  { value: "orden_trabajo", label: "Órdenes de trabajo" },
  { value: "presupuesto", label: "Presupuestos" },
  { value: "remito", label: "Remitos" },
  { value: "stock_item", label: "Stock" },
  { value: "movimiento_stock", label: "Movimientos de stock" },
  { value: "cliente", label: "Clientes" },
  { value: "user", label: "Usuarios" },
]

/** Colores por acción para el badge. */
const ACCION_STYLES: Record<string, string> = {
  crear: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  actualizar: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  eliminar: "bg-red-500/10 text-red-400 border-red-500/20",
  convertir: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  despachar: "bg-amber-500/10 text-amber-400 border-amber-500/20",
}

function accionLabel(a: string) {
  return a.charAt(0).toUpperCase() + a.slice(1)
}

function fechaHora(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  return d.toLocaleString("es-AR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  })
}

export default function AuditoriaPage() {
  const [items, setItems] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [entidad, setEntidad] = useState("")
  const [search, setSearch] = useState("")

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.admin.auditoria.list({
        entidad: entidad || undefined,
        page,
        per_page: PER_PAGE,
      })
      setItems(res.data ?? [])
      setTotalPages(res.total_pages || 1)
      setTotal(res.total ?? 0)
    } catch {
      setItems([])
      setTotalPages(1)
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [entidad, page])

  useEffect(() => { fetchData() }, [fetchData])

  // Reset de página al cambiar el filtro de entidad
  const handleEntidad = (v: string) => { setEntidad(v); setPage(1) }

  // Búsqueda client-side sobre la página actual (descripción / usuario / acción)
  const q = search.trim().toLowerCase()
  const filtered = q
    ? items.filter((it) =>
        [it.descripcion, it.user_email, it.accion, it.entidad]
          .filter(Boolean)
          .some((f) => f!.toLowerCase().includes(q)),
      )
    : items

  const columns: ColumnDef<AuditEntry>[] = [
    {
      key: "created_at",
      header: "Fecha",
      cellClassName: "whitespace-nowrap text-xs text-muted-foreground tabular-nums",
      cell: (r) => fechaHora(r.created_at),
    },
    {
      key: "user_email",
      header: "Usuario",
      cell: (r) => (
        <span className="text-sm text-foreground">{r.user_email ?? "Sistema"}</span>
      ),
    },
    {
      key: "accion",
      header: "Acción",
      cell: (r) => (
        <span
          className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-[11px] font-medium ${
            ACCION_STYLES[r.accion] ?? "bg-muted text-muted-foreground border-border"
          }`}
        >
          {accionLabel(r.accion)}
        </span>
      ),
    },
    {
      key: "entidad",
      header: "Entidad",
      cell: (r) => (
        <span className="text-xs font-medium text-foreground">
          {r.entidad}
          {r.entidad_id != null && (
            <span className="ml-1 font-mono text-muted-foreground">#{r.entidad_id}</span>
          )}
        </span>
      ),
    },
    {
      key: "descripcion",
      header: "Descripción",
      cellClassName: "max-w-[420px]",
      cell: (r) => (
        <span className="text-sm text-muted-foreground">{r.descripcion ?? "—"}</span>
      ),
    },
  ]

  return (
    <div className="p-6 lg:p-8 space-y-5 max-w-[1200px] mx-auto">
      {/* ── Header ── */}
      <PageHeader
        icon={ScrollText}
        iconClassName="text-gold"
        title="Auditoría"
        subtitle={total > 0 ? `${total} registros de actividad` : "Registro de actividad del sistema"}
      />

      {/* ── Filtros ── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por descripción, usuario o acción..."
            className="h-10 pl-10 rounded-xl bg-input border-border focus-visible:border-gold/40 focus-visible:ring-gold/15"
          />
        </div>
        <div className="relative">
          <select
            value={entidad}
            onChange={(e) => handleEntidad(e.target.value)}
            className="h-10 pl-4 pr-10 bg-input border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-gold/40 appearance-none cursor-pointer"
          >
            {ENTIDADES.map((e) => (
              <option key={e.value || "all"} value={e.value}>{e.label}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        </div>
      </div>

      {/* ── Tabla / Empty ── */}
      {!loading && filtered.length === 0 ? (
        <EmptyState
          icon={<ScrollText className="w-8 h-8" strokeWidth={1.5} />}
          title="Sin registros de auditoría"
          description={
            search || entidad
              ? "No hay registros que coincidan con los filtros aplicados."
              : "Todavía no se registró actividad en el sistema."
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          loading={loading}
          keyExtractor={(r) => r.id}
          emptyIcon={<ScrollText className="w-8 h-8 text-muted-foreground" strokeWidth={1.5} />}
          emptyTitle="Sin registros de auditoría"
          emptyDescription="Todavía no se registró actividad en el sistema."
        >
          {/* Paginación */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-border px-5 py-3">
              <span className="text-xs text-muted-foreground">
                Página {page} de {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="h-8 rounded-lg border-border text-muted-foreground hover:text-foreground gap-1"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages || loading}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="h-8 rounded-lg border-border text-muted-foreground hover:text-foreground gap-1"
                >
                  Siguiente
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}
        </DataTable>
      )}
    </div>
  )
}
