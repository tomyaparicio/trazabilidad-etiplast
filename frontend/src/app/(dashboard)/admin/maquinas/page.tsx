"use client"

import { useEffect, useState, useCallback } from "react"
import { api } from "@/lib/api"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import { Cog, Plus, Pencil, Trash2, Loader2, AlertTriangle } from "lucide-react"

type TipoMaquina = "impresion" | "extrusion" | "troquelado"

interface MaquinaRow {
  id: number
  nombre: string
  tipo: string
  activa: boolean
}

const TIPOS: { value: TipoMaquina; label: string }[] = [
  { value: "impresion", label: "Impresión" },
  { value: "extrusion", label: "Extrusión" },
  { value: "troquelado", label: "Troquelado" },
]

function labelTipo(t: string) {
  return TIPOS.find((x) => x.value === t)?.label ?? t
}

// ─── Crear / Editar dialog ────────────────────────────────────────────────────
function MaquinaFormDialog({
  maquina,
  onClose,
  onSaved,
}: {
  maquina: MaquinaRow | null
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!maquina
  const [nombre, setNombre] = useState(maquina?.nombre ?? "")
  const [tipo, setTipo] = useState<TipoMaquina>((maquina?.tipo as TipoMaquina) || "impresion")
  const [activa, setActiva] = useState(maquina?.activa ?? true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const n = nombre.trim()
    if (!n) return
    setLoading(true)
    setError("")
    try {
      if (isEdit) {
        await api.admin.maquinas.update(maquina.id, { nombre: n, tipo, activa })
      } else {
        await api.admin.maquinas.create({ nombre: n, tipo })
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar máquina" : "Nueva máquina"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Las máquinas de tipo Impresión aparecen al asignar productos de clientes."
              : "Las de tipo Impresión se usan en la pestaña Productos del cliente."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 mb-1.5">Nombre</label>
            <Input autoFocus placeholder="Ej. Flexo 6 colores" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 mb-1.5">Tipo</label>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoMaquina)}
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              {TIPOS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          {isEdit && (
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input type="checkbox" checked={activa} onChange={(e) => setActiva(e.target.checked)} className="rounded border-border" />
              Activa
            </label>
          )}
          {error && <p className="text-sm text-red-400">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>Cancelar</Button>
            <Button type="submit" disabled={loading || !nombre.trim()}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isEdit ? "Guardar" : "Crear"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Eliminar dialog ───────────────────────────────────────────────────────────
function EliminarMaquinaDialog({
  maquina,
  onClose,
  onDeleted,
}: {
  maquina: MaquinaRow
  onClose: () => void
  onDeleted: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleDelete = async () => {
    setLoading(true)
    setError("")
    try {
      await api.admin.maquinas.delete(maquina.id)
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
            Eliminar máquina
          </DialogTitle>
          <DialogDescription>
            Se eliminará <span className="font-semibold text-foreground">{maquina.nombre}</span>.
            Si un producto la tenía asignada como impresora, quedará sin impresora (no se borran productos).
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
export default function AdminMaquinasPage() {
  const [maquinas, setMaquinas] = useState<MaquinaRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [filtroTipo, setFiltroTipo] = useState<"" | TipoMaquina>("")
  const [formMaquina, setFormMaquina] = useState<MaquinaRow | null | undefined>(undefined)
  const [deleteMaquina, setDeleteMaquina] = useState<MaquinaRow | null>(null)

  const fetchMaquinas = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const data = await api.admin.maquinas.list(filtroTipo || undefined)
      setMaquinas(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar máquinas")
    } finally {
      setLoading(false)
    }
  }, [filtroTipo])

  useEffect(() => { fetchMaquinas() }, [fetchMaquinas])

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
            <Cog className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Máquinas</h1>
            <p className="text-sm text-muted-foreground">
              {maquinas.length} registro{maquinas.length === 1 ? "" : "s"}
              {filtroTipo ? ` · ${labelTipo(filtroTipo)}` : ""}
            </p>
          </div>
        </div>
        <Button onClick={() => setFormMaquina(null)} className="gap-2 shrink-0">
          <Plus className="w-4 h-4" />
          Nueva máquina
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={filtroTipo === "" ? "default" : "outline"}
          size="sm"
          className={filtroTipo === "" ? "bg-brand" : ""}
          onClick={() => setFiltroTipo("")}
        >
          Todas
        </Button>
        {TIPOS.map((t) => (
          <Button
            key={t.value}
            type="button"
            variant={filtroTipo === t.value ? "default" : "outline"}
            size="sm"
            className={filtroTipo === t.value ? "bg-brand" : ""}
            onClick={() => setFiltroTipo(t.value)}
          >
            {t.label}
          </Button>
        ))}
      </div>

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
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tipo</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Estado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {maquinas.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-10 text-muted-foreground text-sm">
                    No hay máquinas{filtroTipo ? ` de tipo ${labelTipo(filtroTipo)}` : ""}. Creá una con &ldquo;Nueva máquina&rdquo;.
                  </td>
                </tr>
              ) : (
                maquinas.map((m, i) => (
                  <tr
                    key={m.id}
                    className={`border-b border-border last:border-0 hover:bg-accent/20 transition-colors ${i % 2 === 0 ? "" : "bg-muted/10"}`}
                  >
                    <td className="px-4 py-3 font-medium">{m.nombre}</td>
                    <td className="px-4 py-3 text-muted-foreground">{labelTipo(m.tipo)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${m.activa ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10" : "border-border text-muted-foreground bg-muted/30"}`}>
                        {m.activa ? "Activa" : "Inactiva"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="w-8 h-8 text-muted-foreground hover:text-foreground"
                          onClick={() => setFormMaquina(m)}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="w-8 h-8 text-muted-foreground hover:text-red-400"
                          onClick={() => setDeleteMaquina(m)}
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

      {formMaquina !== undefined && (
        <MaquinaFormDialog
          maquina={formMaquina}
          onClose={() => setFormMaquina(undefined)}
          onSaved={fetchMaquinas}
        />
      )}
      {deleteMaquina && (
        <EliminarMaquinaDialog
          maquina={deleteMaquina}
          onClose={() => setDeleteMaquina(null)}
          onDeleted={fetchMaquinas}
        />
      )}
    </div>
  )
}
