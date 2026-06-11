"use client"

import { useEffect, useState, useCallback } from "react"
import { api } from "@/lib/api"
import type { QcPlantilla } from "@/lib/api/types"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import {
  ClipboardCheck, Plus, Pencil, Trash2, Loader2,
  ArrowUp, ArrowDown, X, AlertTriangle, ListChecks,
} from "lucide-react"

// ─── Etapas ───────────────────────────────────────────────────────────────────
const ETAPAS = [
  { value: "extrusion",  label: "Extrusión" },
  { value: "impresion",  label: "Impresión" },
  { value: "troquelado", label: "Troquelado" },
] as const

const ETAPA_COLOR: Record<string, string> = {
  extrusion:  "bg-blue-500/10 text-blue-400 border-blue-500/30",
  impresion:  "bg-violet-500/10 text-violet-400 border-violet-500/30",
  troquelado: "bg-amber-500/10 text-amber-400 border-amber-500/30",
}

const etapaLabel = (etapa: string) =>
  ETAPAS.find((e) => e.value === etapa)?.label ?? etapa

const etapaClass = (etapa: string) =>
  ETAPA_COLOR[etapa] ?? "bg-muted/40 text-muted-foreground border-border"

// ─── Crear / Editar dialog ────────────────────────────────────────────────────
type ItemDraft = { descripcion: string }

function PlantillaFormDialog({
  plantilla,
  onClose,
  onSaved,
}: {
  plantilla: QcPlantilla | null   // null = crear nueva
  onClose: () => void
  onSaved: () => void
}) {
  const [nombre, setNombre] = useState(plantilla?.nombre ?? "")
  const [etapa, setEtapa] = useState(plantilla?.etapa ?? "extrusion")
  const [activa, setActiva] = useState(plantilla?.activa ?? true)
  const [items, setItems] = useState<ItemDraft[]>(
    plantilla?.items.map((i) => ({ descripcion: i.descripcion })) ?? [{ descripcion: "" }]
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const moverItem = (idx: number, dir: -1 | 1) => {
    const destino = idx + dir
    if (destino < 0 || destino >= items.length) return
    const copia = [...items]
    ;[copia[idx], copia[destino]] = [copia[destino], copia[idx]]
    setItems(copia)
  }

  const setDescripcion = (idx: number, value: string) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { descripcion: value } : it)))
  }

  const quitarItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx))
  }

  const itemsValidos = items.map((i) => i.descripcion.trim()).filter(Boolean)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const n = nombre.trim()
    if (!n || itemsValidos.length === 0) return
    setLoading(true)
    setError("")
    const payload = {
      etapa,
      nombre: n,
      activa,
      items: itemsValidos.map((descripcion, i) => ({ descripcion, orden: i + 1 })),
    }
    try {
      if (plantilla) {
        await api.calidad.plantillas.update(plantilla.id, payload)
      } else {
        await api.calidad.plantillas.create(payload)
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
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{plantilla ? "Editar plantilla" : "Nueva plantilla"}</DialogTitle>
          <DialogDescription>
            {plantilla
              ? `Editando "${plantilla.nombre}"`
              : "Definí el checklist de control de calidad para una etapa."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Etapa</label>
              <select
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                value={etapa}
                onChange={(e) => setEtapa(e.target.value)}
              >
                {ETAPAS.map((e) => (
                  <option key={e.value} value={e.value}>{e.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Estado</label>
              <button
                type="button"
                onClick={() => setActiva((a) => !a)}
                className={`w-full px-3 py-2 rounded-md text-sm font-medium border transition-colors ${
                  activa
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                    : "bg-muted/40 text-muted-foreground border-border"
                }`}
              >
                {activa ? "Activa" : "Inactiva"}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Nombre</label>
            <Input
              autoFocus
              placeholder="Nombre de la plantilla"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
          </div>

          {/* Items dinámicos */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">
                Ítems del checklist ({itemsValidos.length})
              </label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1 h-7 text-xs"
                onClick={() => setItems((prev) => [...prev, { descripcion: "" }])}
              >
                <Plus className="w-3 h-3" />
                Agregar ítem
              </Button>
            </div>
            <div className="space-y-1.5">
              {items.map((item, idx) => (
                <div key={idx} className="flex items-center gap-1.5">
                  <span className="w-5 text-center text-xs text-muted-foreground font-mono shrink-0">
                    {idx + 1}
                  </span>
                  <Input
                    placeholder="Descripción del control"
                    value={item.descripcion}
                    onChange={(e) => setDescripcion(idx, e.target.value)}
                    className="h-8 text-sm"
                  />
                  <Button
                    type="button" size="icon" variant="ghost"
                    className="w-7 h-7 shrink-0 text-muted-foreground hover:text-foreground"
                    disabled={idx === 0}
                    onClick={() => moverItem(idx, -1)}
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    type="button" size="icon" variant="ghost"
                    className="w-7 h-7 shrink-0 text-muted-foreground hover:text-foreground"
                    disabled={idx === items.length - 1}
                    onClick={() => moverItem(idx, 1)}
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    type="button" size="icon" variant="ghost"
                    className="w-7 h-7 shrink-0 text-muted-foreground hover:text-red-400"
                    disabled={items.length === 1}
                    onClick={() => quitarItem(idx)}
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>Cancelar</Button>
            <Button type="submit" disabled={loading || !nombre.trim() || itemsValidos.length === 0}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {plantilla ? "Guardar" : "Crear"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Eliminar dialog ──────────────────────────────────────────────────────────
function EliminarPlantillaDialog({
  plantilla,
  onClose,
  onDeleted,
}: {
  plantilla: QcPlantilla
  onClose: () => void
  onDeleted: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleDelete = async () => {
    setLoading(true)
    setError("")
    try {
      await api.calidad.plantillas.delete(plantilla.id)
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
            Eliminar plantilla
          </DialogTitle>
          <DialogDescription>
            Estás por eliminar <span className="font-semibold text-foreground">&quot;{plantilla.nombre}&quot;</span>.
            Si tiene controles registrados, se desactiva en lugar de eliminarse.
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
export default function CalidadPage() {
  const [plantillas, setPlantillas] = useState<QcPlantilla[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [formPlantilla, setFormPlantilla] = useState<QcPlantilla | null | undefined>(undefined) // undefined=cerrado, null=nueva
  const [deletePlantilla, setDeletePlantilla] = useState<QcPlantilla | null>(null)

  const fetchPlantillas = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const data = await api.calidad.plantillas.list()
      setPlantillas(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar plantillas")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchPlantillas() }, [fetchPlantillas])

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#1a1866]/10 border border-[#1a1866]/20 flex items-center justify-center dark:bg-[#6b7aff]/10 dark:border-[#6b7aff]/20">
            <ClipboardCheck className="w-5 h-5 text-[#1a1866] dark:text-[#6b7aff]" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Control de Calidad</h1>
            <p className="text-sm text-muted-foreground">
              {plantillas.length} plantilla{plantillas.length === 1 ? "" : "s"} de checklist por etapa
            </p>
          </div>
        </div>
        <Button onClick={() => setFormPlantilla(null)} className="gap-2">
          <Plus className="w-4 h-4" />
          Nueva plantilla
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
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Etapa</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Nombre</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ítems</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Estado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {plantillas.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-10 text-muted-foreground text-sm">
                    No hay plantillas cargadas.
                  </td>
                </tr>
              ) : (
                plantillas.map((p, i) => (
                  <tr
                    key={p.id}
                    className={`border-b border-border last:border-0 hover:bg-accent/20 transition-colors ${i % 2 === 0 ? "" : "bg-muted/10"}`}
                  >
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${etapaClass(p.etapa)}`}>
                        {etapaLabel(p.etapa)}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium">{p.nombre}</td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <ListChecks className="w-3.5 h-3.5" />
                        {p.items.length}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
                        p.activa
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                          : "bg-muted/40 text-muted-foreground border-border"
                      }`}>
                        {p.activa ? "Activa" : "Inactiva"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="w-8 h-8 text-muted-foreground hover:text-foreground"
                          onClick={() => setFormPlantilla(p)}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="w-8 h-8 text-muted-foreground hover:text-red-400"
                          onClick={() => setDeletePlantilla(p)}
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
      {formPlantilla !== undefined && (
        <PlantillaFormDialog
          plantilla={formPlantilla}
          onClose={() => setFormPlantilla(undefined)}
          onSaved={fetchPlantillas}
        />
      )}
      {deletePlantilla && (
        <EliminarPlantillaDialog
          plantilla={deletePlantilla}
          onClose={() => setDeletePlantilla(null)}
          onDeleted={fetchPlantillas}
        />
      )}
    </div>
  )
}
