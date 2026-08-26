"use client"

import { useEffect, useState, useCallback } from "react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import { PageHeader } from "@/components/ui/page-header"
import { DataTable, type ColumnDef } from "@/components/ui/data-table"
import { EmptyState } from "@/components/ui/empty-state"
import { Tag, Plus, Pencil, Trash2, Loader2, Users, AlertTriangle } from "lucide-react"

interface Rubro {
  id: number
  nombre: string
  cantidad_clientes: number
}

// ─── Color badge ──────────────────────────────────────────────────────────────
const RUBRO_COLOR: Record<string, string> = {
  Agua:             "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
  "Jugos-Gaseosas": "bg-orange-500/10 text-orange-400 border-orange-500/30",
  Limpieza:         "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  Agroquimicos:     "bg-red-500/10 text-red-400 border-red-500/30",
  Aceite:           "bg-amber-500/10 text-amber-400 border-amber-500/30",
}
const rubroClass = (nombre: string) =>
  RUBRO_COLOR[nombre] ?? "bg-muted/40 text-muted-foreground border-border"

// ─── Crear / Renombrar dialog ─────────────────────────────────────────────────
function RubroFormDialog({
  rubro,
  onClose,
  onSaved,
}: {
  rubro: Rubro | null   // null = crear nuevo
  onClose: () => void
  onSaved: () => void
}) {
  const [nombre, setNombre] = useState(rubro?.nombre ?? "")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const n = nombre.trim()
    if (!n) return
    setLoading(true)
    setError("")
    try {
      if (rubro) {
        await api.admin.rubros.rename(rubro.id, n)
      } else {
        await api.admin.rubros.create(n)
      }
      toast.success(rubro ? "Rubro actualizado" : "Rubro creado")
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
          <DialogTitle>{rubro ? "Renombrar rubro" : "Nuevo rubro"}</DialogTitle>
          <DialogDescription>
            {rubro ? `Renombrando "${rubro.nombre}"` : "Ingresá el nombre del nuevo rubro."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            autoFocus
            placeholder="Nombre del rubro"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>Cancelar</Button>
            <Button type="submit" disabled={loading || !nombre.trim()}>
              {loading && <Loader2 className="size-4 animate-spin" />}
              {rubro ? "Guardar" : "Crear"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Eliminar dialog (custom: soporta reasignación mover_a) ───────────────────
function EliminarRubroDialog({
  rubro,
  rubros,
  onClose,
  onDeleted,
}: {
  rubro: Rubro
  rubros: Rubro[]
  onClose: () => void
  onDeleted: () => void
}) {
  const [moverA, setMoverA] = useState<number | "">("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const tieneClientes = rubro.cantidad_clientes > 0
  const opciones = rubros.filter((r) => r.id !== rubro.id)

  const handleDelete = async () => {
    setLoading(true)
    setError("")
    try {
      await api.admin.rubros.delete(rubro.id, moverA !== "" ? moverA : undefined)
      toast.success("Rubro eliminado")
      onDeleted()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al eliminar"
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
          <DialogTitle className="flex items-center gap-2 text-red-400">
            <AlertTriangle className="w-4 h-4" />
            Eliminar rubro
          </DialogTitle>
          <DialogDescription>
            Estás por eliminar <span className="font-semibold text-foreground">"{rubro.nombre}"</span>
            {tieneClientes && (
              <> que tiene <span className="font-semibold text-foreground">{rubro.cantidad_clientes} cliente(s)</span></>
            )}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {tieneClientes && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Mover los clientes a otro rubro antes de eliminar:
              </p>
              <Select
                aria-label="Rubro destino"
                value={moverA}
                onChange={(e) => setMoverA(e.target.value === "" ? "" : Number(e.target.value))}
              >
                <option value="">— Seleccionar rubro destino —</option>
                {opciones.map((r) => (
                  <option key={r.id} value={r.id}>{r.nombre}</option>
                ))}
              </Select>
            </div>
          )}
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={loading || (tieneClientes && moverA === "")}
          >
            {loading && <Loader2 className="size-4 animate-spin" />}
            Eliminar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function AdminRubrosPage() {
  const [rubros, setRubros] = useState<Rubro[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [formRubro, setFormRubro] = useState<Rubro | null | undefined>(undefined) // undefined=cerrado, null=nuevo, Rubro=editar
  const [deleteRubro, setDeleteRubro] = useState<Rubro | null>(null)

  const fetchRubros = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const data = await api.admin.rubros.list()
      setRubros(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar rubros")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchRubros() }, [fetchRubros])

  const columns: ColumnDef<Rubro>[] = [
    {
      key: "nombre",
      header: "Nombre",
      cell: (r) => (
        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${rubroClass(r.nombre)}`}>
          {r.nombre}
        </span>
      ),
    },
    {
      key: "cantidad_clientes",
      header: "Clientes",
      cell: (r) => (
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Users className="w-3.5 h-3.5" />
          {r.cantidad_clientes}
        </span>
      ),
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
            aria-label="Renombrar rubro"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => setFormRubro(r)}
          >
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Eliminar rubro"
            className="text-muted-foreground hover:text-red-400"
            onClick={() => setDeleteRubro(r)}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <PageHeader
        icon={Tag}
        iconClassName="text-amber-400"
        title="Rubros"
        subtitle={`${rubros.length} rubros en el sistema`}
        actions={
          <Button onClick={() => setFormRubro(null)} className="gap-2">
            <Plus className="w-4 h-4" />
            Nuevo rubro
          </Button>
        }
      />

      {/* Content */}
      {error ? (
        <EmptyState
          icon={<AlertTriangle className="w-8 h-8" strokeWidth={1.5} />}
          title="No se pudieron cargar los rubros"
          description={error}
          action={<Button variant="outline" size="sm" onClick={fetchRubros}>Reintentar</Button>}
        />
      ) : (
        <DataTable
          columns={columns}
          data={rubros}
          loading={loading}
          keyExtractor={(r) => r.id}
          emptyIcon={<Tag className="w-8 h-8 text-muted-foreground" strokeWidth={1.5} />}
          emptyTitle="Sin rubros"
          emptyDescription='No hay rubros cargados. Creá el primero con "Nuevo rubro".'
        />
      )}

      {/* Dialogs */}
      {formRubro !== undefined && (
        <RubroFormDialog
          rubro={formRubro}
          onClose={() => setFormRubro(undefined)}
          onSaved={fetchRubros}
        />
      )}
      {deleteRubro && (
        <EliminarRubroDialog
          rubro={deleteRubro}
          rubros={rubros}
          onClose={() => setDeleteRubro(null)}
          onDeleted={fetchRubros}
        />
      )}
    </div>
  )
}
