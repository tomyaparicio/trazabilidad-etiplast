"use client"

import { useEffect, useState, useCallback } from "react"
import { PageContainer } from "@/components/ui/page-container"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { PageHeader } from "@/components/ui/page-header"
import { DataTable, type ColumnDef } from "@/components/ui/data-table"
import { EmptyState } from "@/components/ui/empty-state"
import { Package, Plus, Pencil, Trash2, Loader2, AlertTriangle } from "lucide-react"

interface Envase {
  id: number
  nombre: string
  cantidad_productos: number
}

// ─── Crear / Renombrar dialog ─────────────────────────────────────────────────
function EnvaseFormDialog({
  envase,
  onClose,
  onSaved,
}: {
  envase: Envase | null
  onClose: () => void
  onSaved: () => void
}) {
  const [nombre, setNombre] = useState(envase?.nombre ?? "")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const n = nombre.trim()
    if (!n) return
    setLoading(true)
    setError("")
    try {
      if (envase) {
        await api.admin.envases.rename(envase.id, n)
      } else {
        await api.admin.envases.create(n)
      }
      toast.success(envase ? "Envase actualizado" : "Envase creado")
      onSaved()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al guardar"
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !loading) onClose() }}>
      <DialogContent showCloseButton={!loading} className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{envase ? "Renombrar envase" : "Nuevo envase"}</DialogTitle>
          <DialogDescription>
            {envase ? `Renombrando "${envase.nombre}"` : "Ingresá el nombre del nuevo tipo de envase."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            autoFocus
            placeholder="Nombre del envase"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>Cancelar</Button>
            <Button type="submit" disabled={loading || !nombre.trim()}>
              {loading && <Loader2 className="size-4 animate-spin" />}
              {envase ? "Guardar" : "Crear"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Eliminar dialog ──────────────────────────────────────────────────────────
function EliminarEnvaseDialog({
  envase,
  onClose,
  onDeleted,
}: {
  envase: Envase
  onClose: () => void
  onDeleted: () => void
}) {
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => { if (!open) onClose() }}
      title="Eliminar envase"
      description={
        <>
          Estás por eliminar <span className="font-semibold text-foreground">"{envase.nombre}"</span>
          {envase.cantidad_productos > 0 && (
            <> — está asociado a <span className="font-semibold text-foreground">{envase.cantidad_productos} producto(s)</span>. Solo se elimina del catálogo, no afecta los productos existentes.</>
          )}.
        </>
      }
      confirmLabel="Eliminar"
      variant="destructive"
      onConfirm={async () => {
        await api.admin.envases.delete(envase.id)
        toast.success("Envase eliminado")
        onDeleted()
      }}
    />
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function AdminEnvasesPage() {
  const [envases, setEnvases] = useState<Envase[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [formEnvase, setFormEnvase] = useState<Envase | null | undefined>(undefined)
  const [deleteEnvase, setDeleteEnvase] = useState<Envase | null>(null)

  const fetchEnvases = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const data = await api.admin.envases.list()
      setEnvases(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar envases")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchEnvases() }, [fetchEnvases])

  const columns: ColumnDef<Envase>[] = [
    {
      key: "nombre",
      header: "Nombre",
      cell: (r) => <span className="text-sm font-medium text-foreground">{r.nombre}</span>,
    },
    {
      key: "cantidad_productos",
      header: "Productos",
      cell: (r) => <span className="text-sm text-muted-foreground">{r.cantidad_productos}</span>,
    },
    {
      key: "acciones",
      header: "",
      headerClassName: "text-right",
      cellClassName: "text-right",
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Renombrar envase"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => setFormEnvase(r)}
          >
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Eliminar envase"
            className="text-muted-foreground hover:text-red-400"
            onClick={() => setDeleteEnvase(r)}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      ),
    },
  ]

  return (
    <PageContainer>
      <PageHeader
        icon={Package}
        iconClassName="text-blue-400"
        title="Envases"
        subtitle={`${envases.length} tipos de envase`}
        actions={
          <Button onClick={() => setFormEnvase(null)} className="gap-2">
            <Plus className="w-4 h-4" />
            Nuevo envase
          </Button>
        }
      />

      {/* Table */}
      {error ? (
        <EmptyState
          icon={<AlertTriangle className="w-8 h-8" strokeWidth={1.5} />}
          title="No se pudieron cargar los envases"
          description={error}
          action={<Button variant="outline" size="sm" onClick={fetchEnvases}>Reintentar</Button>}
        />
      ) : (
        <DataTable
          columns={columns}
          data={envases}
          loading={loading}
          keyExtractor={(r) => r.id}
          emptyIcon={<Package className="w-8 h-8 text-muted-foreground" strokeWidth={1.5} />}
          emptyTitle="Sin envases"
          emptyDescription='No hay envases cargados. Creá el primero con "Nuevo envase".'
        />
      )}

      {/* Dialogs */}
      {formEnvase !== undefined && (
        <EnvaseFormDialog
          envase={formEnvase}
          onClose={() => setFormEnvase(undefined)}
          onSaved={fetchEnvases}
        />
      )}
      {deleteEnvase && (
        <EliminarEnvaseDialog
          envase={deleteEnvase}
          onClose={() => setDeleteEnvase(null)}
          onDeleted={fetchEnvases}
        />
      )}
    </PageContainer>
  )
}
