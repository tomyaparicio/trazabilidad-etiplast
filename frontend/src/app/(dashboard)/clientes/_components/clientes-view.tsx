"use client"

import { useState } from "react"
import { Plus, RefreshCw, TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PageContainer } from "@/components/ui/page-container"
import { PageHeader } from "@/components/ui/page-header"
import type { Cliente } from "@/types/database"
import { useClientes } from "../_hooks/use-clientes"
import { ClientesFilters } from "./clientes-filters"
import { ClientesTable } from "./clientes-table"
import { ClienteDetailDialog } from "./cliente-detail-dialog"
import { ClienteNuevoDialog } from "./cliente-nuevo-dialog"

const nf = new Intl.NumberFormat("es-AR")

/**
 * Orquestador de la vista Clientes: conecta el hook de datos con los componentes
 * presentacionales (filtros, tabla) y los diálogos. Sin lógica de fetch propia.
 */
export function ClientesView() {
  const c = useClientes()
  const [selected, setSelected] = useState<Cliente | null>(null)
  const [nuevoOpen, setNuevoOpen] = useState(false)

  return (
    <PageContainer>
      <PageHeader
        title="Clientes"
        subtitle={`${nf.format(c.total)} registros encontrados`}
        actions={
          <Button onClick={() => setNuevoOpen(true)} className="h-10 gap-2 rounded-xl bg-brand px-4 text-sm font-medium text-white hover:bg-brand-strong">
            <Plus className="h-4 w-4" /> Nuevo cliente
          </Button>
        }
      />

      <ClientesFilters
        filtros={c.filtros}
        search={c.search} onSearch={c.setSearch}
        rubro={c.rubro} onRubro={c.setRubro}
        provincia={c.provincia} onProvincia={c.setProvincia}
        hasFilters={c.hasFilters} onClear={c.clearFilters}
      />

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
          onRowClick={setSelected}
          page={c.page} perPage={c.perPage} total={c.total} onPageChange={c.setPage}
        />
      )}

      <ClienteDetailDialog
        cliente={selected}
        onClose={() => setSelected(null)}
        onUpdate={c.onUpdated}
        onDelete={(id) => { c.onDeleted(id); setSelected(null) }}
      />
      <ClienteNuevoDialog
        open={nuevoOpen}
        onClose={() => setNuevoOpen(false)}
        onCreated={c.onCreated}
        filtros={c.filtros}
      />
    </PageContainer>
  )
}
