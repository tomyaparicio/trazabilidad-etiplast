"use client"

import { useEffect, useState, useCallback } from "react"
import { api } from "@/lib/api"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
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
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleDelete = async () => {
    setLoading(true)
    setError("")
    try {
      await api.admin.envases.delete(envase.id)
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
            Eliminar envase
          </DialogTitle>
          <DialogDescription>
            Estás por eliminar <span className="font-semibold text-foreground">"{envase.nombre}"</span>
            {envase.cantidad_productos > 0 && (
              <> — está asociado a <span className="font-semibold text-foreground">{envase.cantidad_productos} producto(s)</span>. Solo se elimina del catálogo, no afecta los productos existentes.</>
            )}.
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button variant="destructive" onClick={handleDelete} disabled={loading}>
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Eliminar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            <Package className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Envases</h1>
            <p className="text-sm text-muted-foreground">{envases.length} tipos de envase</p>
          </div>
        </div>
        <Button onClick={() => setFormEnvase(null)} className="gap-2">
          <Plus className="w-4 h-4" />
          Nuevo envase
        </Button>
      </div>

      {/* Table */}
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
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Productos</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {envases.length === 0 ? (
                <tr>
                  <td colSpan={3} className="text-center py-10 text-muted-foreground text-sm">
                    No hay envases cargados.
                  </td>
                </tr>
              ) : (
                envases.map((envase, i) => (
                  <tr
                    key={envase.id}
                    className={`border-b border-border last:border-0 hover:bg-accent/20 transition-colors ${i % 2 === 0 ? "" : "bg-muted/10"}`}
                  >
                    <td className="px-4 py-3 font-medium">{envase.nombre}</td>
                    <td className="px-4 py-3 text-muted-foreground">{envase.cantidad_productos}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="w-8 h-8 text-muted-foreground hover:text-foreground"
                          onClick={() => setFormEnvase(envase)}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="w-8 h-8 text-muted-foreground hover:text-red-400"
                          onClick={() => setDeleteEnvase(envase)}
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
    </div>
  )
}
