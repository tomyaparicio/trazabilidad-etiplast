"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import type { Factura, EstadoFactura } from "@/lib/api/types"
import { Button } from "@/components/ui/button"
import { usePermisos } from "@/components/permisos-provider"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { DataTable, type ColumnDef } from "@/components/ui/data-table"
import { Pagination } from "@/components/ui/pagination"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { PageContainer } from "@/components/ui/page-container"
import { PageHeader } from "@/components/ui/page-header"
import {
  Receipt, Plus, Search, Pencil, Trash2, TriangleAlert, RefreshCw, CircleCheck, Wallet,
} from "lucide-react"
import { FacturaFormDialog } from "./factura-form-dialog"

const OPT = { color: "#0b0d1e", backgroundColor: "#fff" } as const
const nf = new Intl.NumberFormat("es-AR")
const money = (v?: number | null) => "$ " + nf.format(Math.round(v ?? 0))
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]

function estadoBadge(estado: EstadoFactura) {
  const map: Record<EstadoFactura, { label: string; className: string }> = {
    pendiente: { label: "Pendiente", className: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/35" },
    cobrada:   { label: "Cobrada",   className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/35" },
    anulada:   { label: "Anulada",   className: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/35" },
  }
  const s = map[estado] ?? { label: estado, className: "" }
  return <Badge variant="outline" className={`px-2.5 py-0.5 text-[12px] font-bold ${s.className}`}>{s.label}</Badge>
}

const fmtFecha = (f?: string | null) => {
  if (!f) return "—"
  const [y, m, d] = f.split("-").map(Number)
  return `${d}/${m}/${y}`
}

export function FacturasTable() {
  const { can } = usePermisos()
  const [facturas, setFacturas] = useState<Factura[]>([])
  const [total, setTotal] = useState(0)
  const [montoTotal, setMontoTotal] = useState(0)
  const [montoCobrado, setMontoCobrado] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [estado, setEstado] = useState<EstadoFactura | "">("")
  const [anio, setAnio] = useState<number | "">("")
  const [mes, setMes] = useState<number | "">("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editar, setEditar] = useState<Factura | null>(null)
  const [borrar, setBorrar] = useState<Factura | null>(null)

  const PER_PAGE = 20
  const anioActual = new Date().getFullYear()
  const anios = [anioActual, anioActual - 1, anioActual - 2, anioActual - 3]

  const fetchFacturas = useCallback(async () => {
    setLoading(true); setError(false)
    try {
      const r = await api.facturas.list({
        page, per_page: PER_PAGE,
        search: search || undefined,
        estado: estado || undefined,
        year: anio || undefined,
        month: anio && mes ? mes : undefined,
      })
      setFacturas(r.data)
      setTotal(r.total)
      setMontoTotal(r.monto_total ?? 0)
      setMontoCobrado(r.monto_cobrado ?? 0)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [page, search, estado, anio, mes])

  useEffect(() => {
    const t = setTimeout(fetchFacturas, search ? 300 : 0)
    return () => clearTimeout(t)
  }, [fetchFacturas, search])

  // Al cambiar cualquier filtro se vuelve a la primera página.
  useEffect(() => { setPage(1) }, [search, estado, anio, mes])

  const marcarCobrada = async (f: Factura) => {
    try {
      await api.facturas.update(f.id, { estado: "cobrada" })
      toast.success(`${f.numero} marcada como cobrada`)
      fetchFacturas()
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "No se pudo actualizar")
    }
  }

  const confirmarBorrado = async () => {
    if (!borrar) return
    try {
      await api.facturas.delete(borrar.id)
      toast.success(`Factura ${borrar.numero} eliminada`)
      setBorrar(null)
      fetchFacturas()
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "No se pudo eliminar")
    }
  }

  const columns: ColumnDef<Factura>[] = [
    { key: "numero", header: "N°", skeleton: <div className="h-3.5 w-20 animate-pulse rounded-full bg-muted" />,
      cell: (f) => (
        <div className="flex items-center gap-2">
          <span className="font-mono text-[13px] font-bold text-foreground">{f.numero}</span>
          <span className="rounded border border-border px-1.5 text-[11px] font-bold text-muted-foreground">{f.tipo}</span>
        </div>
      ) },
    { key: "cliente", header: "Cliente", cellClassName: "max-w-[220px]",
      skeleton: <div className="h-3.5 w-32 animate-pulse rounded-full bg-muted" />,
      cell: (f) => <span className="block truncate text-sm font-semibold text-foreground">{f.cliente_nombre || "—"}</span> },
    { key: "fecha", header: "Fecha", skeleton: <div className="h-3.5 w-20 animate-pulse rounded-full bg-muted" />,
      cell: (f) => <span className="text-sm text-foreground/85">{fmtFecha(f.fecha)}</span> },
    { key: "estado", header: "Estado", skeleton: <div className="h-6 w-20 animate-pulse rounded-lg bg-muted" />,
      cell: (f) => estadoBadge(f.estado) },
    { key: "total", header: "Total", cellClassName: "text-right",
      skeleton: <div className="ml-auto h-3.5 w-24 animate-pulse rounded-full bg-muted" />,
      cell: (f) => (
        <span className={`block text-right font-display text-[16px] font-bold tabular-nums ${f.estado === "anulada" ? "text-muted-foreground/50 line-through" : "text-foreground"}`}>
          {money(f.total)}
        </span>
      ) },
    { key: "acciones", header: "", cellClassName: "w-[120px]",
      skeleton: <div className="h-8 w-20 animate-pulse rounded-lg bg-muted" />,
      cell: (f) => (
        <div className="flex items-center justify-end gap-1">
          {can("facturas:editar") && f.estado === "pendiente" && (
            <button type="button" title="Marcar como cobrada"
              onClick={(e) => { e.stopPropagation(); marcarCobrada(f) }}
              className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-emerald-500/10 hover:text-emerald-400">
              <CircleCheck className="size-4" />
            </button>
          )}
          {can("facturas:editar") && (
            <button type="button" title="Editar"
              onClick={(e) => { e.stopPropagation(); setEditar(f); setFormOpen(true) }}
              className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground">
              <Pencil className="size-4" />
            </button>
          )}
          {can("facturas:borrar") && (
            <button type="button" title="Eliminar"
              onClick={(e) => { e.stopPropagation(); setBorrar(f) }}
              className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-400">
              <Trash2 className="size-4" />
            </button>
          )}
        </div>
      ) },
  ]

  return (
    <PageContainer>
      <PageHeader
        icon={Receipt}
        eyebrow="Administración"
        title="Facturas"
        subtitle="Lo facturado alimenta los números del panel Administrativo."
        actions={
          can("facturas:crear") ? (
            <Button onClick={() => { setEditar(null); setFormOpen(true) }}
              className="h-11 gap-2 rounded-xl bg-gold px-4 text-sm font-semibold text-gold-foreground hover:bg-gold hover:brightness-95">
              <Plus className="size-4" /> Nueva factura
            </Button>
          ) : undefined
        }
      >
        <div className="flex flex-col gap-3 lg:flex-row">
          <div className="relative flex-1 lg:min-w-[280px]">
            <Search className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-white/60" />
            <Input
              type="search" autoComplete="off" value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por número o cliente…"
              className="h-14 rounded-xl border-white/25 bg-white/10 pl-12 pr-4 text-[15px] text-white placeholder:text-white/55"
            />
          </div>
          {/* Cada Select va envuelto: el componente trae su propio wrapper
              `w-full`, así que el ancho hay que ponerlo afuera. */}
          <div className="relative lg:w-52">
            <CircleCheck className="pointer-events-none absolute left-4 top-1/2 z-10 size-5 -translate-y-1/2 text-white/60" />
            <Select value={estado} onChange={(e) => setEstado(e.target.value as EstadoFactura | "")}
              aria-label="Filtrar por estado"
              className="h-14 rounded-xl border-white/25 bg-white/10 pl-12 text-[15px] text-white md:text-[15px]">
              <option value="" style={OPT}>Todos los estados</option>
              <option value="pendiente" style={OPT}>Pendientes</option>
              <option value="cobrada" style={OPT}>Cobradas</option>
              <option value="anulada" style={OPT}>Anuladas</option>
            </Select>
          </div>
          <div className="relative lg:w-40">
            <Select value={String(anio)} onChange={(e) => { const v = e.target.value; setAnio(v ? Number(v) : ""); if (!v) setMes("") }}
              aria-label="Filtrar por año"
              className="h-14 rounded-xl border-white/25 bg-white/10 text-[15px] text-white md:text-[15px]">
              <option value="" style={OPT}>Todos los años</option>
              {anios.map((a) => <option key={a} value={a} style={OPT}>{a}</option>)}
            </Select>
          </div>
          <div className="relative lg:w-44">
            <Select value={String(mes)} onChange={(e) => setMes(e.target.value ? Number(e.target.value) : "")}
              disabled={!anio} aria-label="Filtrar por mes"
              className="h-14 rounded-xl border-white/25 bg-white/10 text-[15px] text-white disabled:opacity-40 md:text-[15px]">
              <option value="" style={OPT}>Todo el año</option>
              {MESES.map((m, i) => <option key={m} value={i + 1} style={OPT}>{m}</option>)}
            </Select>
          </div>
        </div>
      </PageHeader>

      {/* Totales del listado filtrado */}
      <section className="ed-island grid grid-cols-1 gap-px overflow-hidden bg-border sm:grid-cols-3">
        <div className="bg-card px-6 py-5">
          <p className="ed-eyebrow flex items-center gap-2"><Wallet className="size-3.5" />Facturado</p>
          <p className="ed-figure mt-2.5 text-[28px] text-foreground">{money(montoTotal)}</p>
          <p className="mt-1.5 text-xs text-muted-foreground">{nf.format(total)} facturas</p>
        </div>
        <div className="bg-card px-6 py-5">
          <p className="ed-eyebrow flex items-center gap-2"><CircleCheck className="size-3.5" />Cobrado</p>
          <p className="ed-figure mt-2.5 text-[28px] text-emerald-600 dark:text-emerald-300">{money(montoCobrado)}</p>
          <p className="mt-1.5 text-xs text-muted-foreground">ya ingresado</p>
        </div>
        <div className="bg-card px-6 py-5">
          <p className="ed-eyebrow">Pendiente de cobro</p>
          <p className="ed-figure mt-2.5 text-[28px] text-amber-600 dark:text-amber-300">{money(Math.max(montoTotal - montoCobrado, 0))}</p>
          <p className="mt-1.5 text-xs text-muted-foreground">por cobrar</p>
        </div>
      </section>

      {error ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card px-6 py-16 text-center">
          <div className="rounded-2xl border border-destructive/20 bg-destructive/10 p-4 text-destructive">
            <TriangleAlert className="size-6" strokeWidth={1.5} />
          </div>
          <p className="text-sm font-medium text-foreground">No se pudieron cargar las facturas</p>
          <Button onClick={fetchFacturas} variant="outline" className="mt-1 gap-2">
            <RefreshCw className="size-3.5" /> Reintentar
          </Button>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={facturas}
          loading={loading}
          keyExtractor={(f) => f.id}
          emptyTitle="Sin facturas"
          emptyDescription="Cargá la primera factura para que impacte en el panel Administrativo."
        >
          <Pagination page={page} perPage={PER_PAGE} total={total} onPageChange={setPage} />
        </DataTable>
      )}

      <FacturaFormDialog
        open={formOpen}
        onOpenChange={(o) => { setFormOpen(o); if (!o) setEditar(null) }}
        factura={editar}
        onSaved={fetchFacturas}
      />

      <ConfirmDialog
        open={!!borrar}
        onOpenChange={(o) => { if (!o) setBorrar(null) }}
        title={borrar ? `¿Eliminar la factura ${borrar.numero}?` : "¿Eliminar factura?"}
        description="Esta acción no se puede deshacer. Si sólo querés anularla, editala y ponela en estado Anulada."
        confirmLabel="Eliminar"
        onConfirm={confirmarBorrado}
      />
    </PageContainer>
  )
}
