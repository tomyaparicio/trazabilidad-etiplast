"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { BadgeCheck, Building2, FileSpreadsheet, Loader2, MapPin, PackageCheck, Plus, RefreshCw, Search, Tags, TriangleAlert, UsersRound, X } from "lucide-react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { PageContainer } from "@/components/ui/page-container"
import { PageHeader } from "@/components/ui/page-header"
import { usePermisos } from "@/components/permisos-provider"
import { useClientes } from "../_hooks/use-clientes"
import { ClientesTable } from "./clientes-table"
import { ClienteNuevoDialog } from "./cliente-nuevo-dialog"

const nf = new Intl.NumberFormat("es-AR")

/**
 * Orquestador de la vista Clientes: conecta el hook de datos con los componentes
 * presentacionales (filtros, tabla) y los diálogos. Sin lógica de fetch propia.
 */
export function ClientesView() {
  const c = useClientes()
  const { can } = usePermisos()
  const router = useRouter()
  const [nuevoOpen, setNuevoOpen] = useState(false)
  const [exportando, setExportando] = useState(false)

  const handleExportExcel = async () => {
    if (exportando) return
    setExportando(true)
    try {
      await api.clientes.exportExcel()
      toast.success("Planilla descargada")
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "No se pudo exportar la planilla")
    } finally {
      setExportando(false)
    }
  }

  const conRazonSocial = c.clientes.filter((cliente) => cliente.razon_social_id || cliente.razon_social).length
  const conProductos = c.clientes.filter((cliente) => cliente.productos?.length || cliente.producto).length
  const pageCount = c.clientes.length

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Base comercial"
        title="Clientes"
        subtitle="Marcas, datos fiscales y productos configurados en un solo lugar."
        actions={
          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              onClick={handleExportExcel}
              disabled={exportando}
              className="h-11 gap-2 rounded-xl border border-white/25 bg-white/10 px-4 text-sm font-semibold text-white hover:bg-white/20 disabled:opacity-60"
            >
              {exportando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
              Exportar Excel
            </Button>
            {can("clientes:crear") && (
              <Button onClick={() => setNuevoOpen(true)} className="h-11 gap-2 rounded-xl bg-gold px-4 text-sm font-semibold text-gold-foreground hover:bg-gold hover:brightness-95">
                <Plus className="h-4 w-4" /> Nuevo cliente
              </Button>
            )}
          </div>
        }
      >
        <div className="flex flex-col gap-3 lg:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-white/60" />
            <Input
              type="search" autoComplete="off" value={c.search}
              onChange={(e) => c.setSearch(e.target.value)}
              placeholder="Buscar marca, razón social, localidad o producto…"
              className="h-14 rounded-xl border-white/25 bg-white/10 pl-12 pr-4 text-[15px] text-white placeholder:text-white/55 focus-visible:border-white/50 focus-visible:ring-2 focus-visible:ring-white/20"
            />
          </div>
          <div className="relative lg:w-56">
            <Tags className="pointer-events-none absolute left-4 top-1/2 z-10 size-5 -translate-y-1/2 text-white/60" />
            <Select value={c.rubro} onChange={(e) => c.setRubro(e.target.value)} aria-label="Filtrar por rubro" className="h-14 rounded-xl border-white/25 bg-white/10 pl-12 text-[15px] text-white">
              <option value="" style={{ color: "#0b0d1e", backgroundColor: "#fff" }}>Todos los rubros</option>
              {c.filtros.rubros.map((r) => <option key={r} value={r} style={{ color: "#0b0d1e", backgroundColor: "#fff" }}>{r}</option>)}
            </Select>
          </div>
          <div className="relative lg:w-56">
            <MapPin className="pointer-events-none absolute left-4 top-1/2 z-10 size-5 -translate-y-1/2 text-white/60" />
            <Select value={c.provincia} onChange={(e) => c.setProvincia(e.target.value)} aria-label="Filtrar por provincia" className="h-14 rounded-xl border-white/25 bg-white/10 pl-12 text-[15px] text-white">
              <option value="" style={{ color: "#0b0d1e", backgroundColor: "#fff" }}>Todas las provincias</option>
              {c.filtros.provincias.map((p) => <option key={p} value={p} style={{ color: "#0b0d1e", backgroundColor: "#fff" }}>{p}</option>)}
            </Select>
          </div>
          {c.hasFilters && (
            <button
              onClick={c.clearFilters}
              aria-label="Limpiar filtros"
              className="flex h-14 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-white/25 bg-white/5 px-4 text-sm font-semibold text-white/80 transition-colors hover:bg-white/15"
            >
              <X className="size-4" /> Limpiar
            </button>
          )}
        </div>
      </PageHeader>

      {/* Resumen de cartera — panel editorial unificado: divisores finos + marca de agua, sin glows */}
      <section className="relative overflow-hidden rounded-2xl border border-border bg-card">
        <UsersRound aria-hidden className="pointer-events-none absolute -right-8 -top-12 size-56 text-primary/[0.04]" strokeWidth={0.8} />
        <div className="relative grid gap-px bg-border sm:grid-cols-[1.5fr_1fr_1fr]">
          {/* Cartera (dominante) */}
          <div className="bg-card px-6 py-5">
            <div className="flex items-center gap-2 text-primary-300">
              <Building2 className="size-4" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em]">Cartera</span>
            </div>
            <p className="mt-3 font-display text-[46px] font-semibold leading-none tabular-nums">{nf.format(c.total)}</p>
            <p className="mt-2.5 text-xs text-muted-foreground">{c.hasFilters ? "coinciden con los filtros activos" : "marcas registradas en el sistema"}</p>
          </div>

          {/* Con razón social */}
          <div className="bg-card px-6 py-5">
            <div className="flex items-center gap-2 text-emerald-300">
              <BadgeCheck className="size-4" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em]">Con razón social</span>
            </div>
            <p className="mt-3 font-display text-[30px] font-semibold leading-none tabular-nums">
              {conRazonSocial}<span className="ml-1.5 text-sm font-medium text-muted-foreground">de {pageCount}</span>
            </p>
            <div className="mt-3.5 h-1.5 overflow-hidden rounded-full bg-secondary">
              <span className="block h-full rounded-full bg-emerald-400" style={{ width: `${pageCount ? (conRazonSocial / pageCount) * 100 : 0}%` }} />
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">en esta página</p>
          </div>

          {/* Con productos */}
          <div className="bg-card px-6 py-5">
            <div className="flex items-center gap-2 text-gold">
              <PackageCheck className="size-4" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em]">Con productos</span>
            </div>
            <p className="mt-3 font-display text-[30px] font-semibold leading-none tabular-nums">
              {conProductos}<span className="ml-1.5 text-sm font-medium text-muted-foreground">de {pageCount}</span>
            </p>
            <div className="mt-3.5 flex gap-1" aria-hidden>
              {Array.from({ length: 10 }).map((_, i) => (
                <span key={i} className={`h-1.5 flex-1 rounded-full ${i < Math.round((pageCount ? conProductos / pageCount : 0) * 10) ? "bg-gold" : "bg-secondary"}`} />
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">en esta página</p>
          </div>
        </div>
      </section>

      {c.error ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card px-6 py-16 text-center">
          <div className="rounded-2xl border border-destructive/20 bg-destructive/10 p-4 text-destructive">
            <TriangleAlert className="h-6 w-6" strokeWidth={1.5} />
          </div>
          <p className="text-sm font-medium text-foreground">No se pudieron cargar los clientes</p>
          <p className="max-w-sm text-xs text-muted-foreground">Puede ser un problema de conexión o que el servidor esté iniciando. Intentá de nuevo.</p>
          <Button onClick={c.refetch} variant="outline" className="mt-1 gap-2">
            <RefreshCw className="h-3.5 w-3.5" /> Reintentar
          </Button>
        </div>
      ) : (
        <ClientesTable
          clientes={c.clientes} loading={c.loading}
          sortBy={c.sortBy} sortDir={c.sortDir} onSort={c.toggleSort}
          onRowClick={(cli) => router.push(`/clientes/${cli.id}`)}
          page={c.page} perPage={c.perPage} total={c.total} onPageChange={c.setPage}
        />
      )}

      <ClienteNuevoDialog
        open={nuevoOpen}
        onClose={() => setNuevoOpen(false)}
        onCreated={c.onCreated}
        filtros={c.filtros}
      />
    </PageContainer>
  )
}
