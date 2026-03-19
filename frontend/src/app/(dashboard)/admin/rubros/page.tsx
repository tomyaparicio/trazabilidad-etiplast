"use client"

import { useEffect, useState, useCallback } from "react"
import { api } from "@/lib/api"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
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
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
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
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {rubro ? "Guardar" : "Crear"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Eliminar dialog ──────────────────────────────────────────────────────────
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
      onDeleted()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al eliminar")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
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
              <select
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                value={moverA}
                onChange={(e) => setMoverA(e.target.value === "" ? "" : Number(e.target.value))}
              >
                <option value="">— Seleccionar rubro destino —</option>
                {opciones.map((r) => (
                  <option key={r.id} value={r.id}>{r.nombre}</option>
                ))}
              </select>
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
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
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

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <Tag className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Rubros</h1>
            <p className="text-sm text-muted-foreground">{rubros.length} rubros en el sistema</p>
          </div>
        </div>
        <Button onClick={() => setFormRubro(null)} className="gap-2">
          <Plus className="w-4 h-4" />
          Nuevo rubro
        </Button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <p className="text-sm text-red-400 text-center py-8">{error}</p>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Nombre</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Clientes</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rubros.length === 0 ? (
                <tr>
                  <td colSpan={3} className="text-center py-10 text-muted-foreground text-sm">
                    No hay rubros cargados.
                  </td>
                </tr>
              ) : (
                rubros.map((rubro, i) => (
                  <tr
                    key={rubro.id}
                    className={`border-b border-border last:border-0 hover:bg-accent/20 transition-colors ${i % 2 === 0 ? "" : "bg-muted/10"}`}
                  >
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${rubroClass(rubro.nombre)}`}>
                        {rubro.nombre}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <Users className="w-3.5 h-3.5" />
                        {rubro.cantidad_clientes}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="w-8 h-8 text-muted-foreground hover:text-foreground"
                          onClick={() => setFormRubro(rubro)}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="w-8 h-8 text-muted-foreground hover:text-red-400"
                          onClick={() => setDeleteRubro(rubro)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
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
