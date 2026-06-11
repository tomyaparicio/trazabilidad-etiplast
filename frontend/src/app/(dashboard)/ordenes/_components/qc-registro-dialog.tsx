"use client"

import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import type { QcPlantilla, ResultadoQc } from "@/lib/api/types"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import { Check, X, Loader2 } from "lucide-react"

const ETAPAS = [
  { value: "extrusion",  label: "Extrusión" },
  { value: "impresion",  label: "Impresión" },
  { value: "troquelado", label: "Troquelado" },
] as const

const RESULTADOS: { value: ResultadoQc; label: string; className: string }[] = [
  { value: "aprobado",  label: "Aprobado",  className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" },
  { value: "observado", label: "Observado", className: "bg-amber-500/10 text-amber-400 border-amber-500/30" },
  { value: "rechazado", label: "Rechazado", className: "bg-red-500/10 text-red-400 border-red-500/30" },
]

type ChecklistItem = {
  item_descripcion: string
  cumple: boolean
  valor: string
  observacion: string
}

interface Props {
  ordenId: number
  onClose: () => void
  onSaved: () => void
}

export function QcRegistroDialog({ ordenId, onClose, onSaved }: Props) {
  const [plantillas, setPlantillas] = useState<QcPlantilla[]>([])
  const [loadingPlantillas, setLoadingPlantillas] = useState(true)
  const [etapa, setEtapa] = useState("")
  const [checklist, setChecklist] = useState<ChecklistItem[]>([])
  const [resultado, setResultado] = useState<ResultadoQc>("aprobado")
  const [resultadoManual, setResultadoManual] = useState(false)
  const [observaciones, setObservaciones] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  // Cargar plantillas activas una sola vez
  useEffect(() => {
    let cancelado = false
    api.calidad.plantillas.list()
      .then((data) => {
        if (!cancelado) setPlantillas(data.filter((p) => p.activa))
      })
      .catch((err) => {
        if (!cancelado) setError(err instanceof Error ? err.message : "Error al cargar plantillas")
      })
      .finally(() => {
        if (!cancelado) setLoadingPlantillas(false)
      })
    return () => { cancelado = true }
  }, [])

  const plantilla = plantillas.find((p) => p.etapa === etapa) ?? null

  // Al cambiar de etapa, armar el checklist desde la plantilla activa
  const handleEtapaChange = (nuevaEtapa: string) => {
    setEtapa(nuevaEtapa)
    setResultadoManual(false)
    setResultado("aprobado")
    const pl = plantillas.find((p) => p.etapa === nuevaEtapa)
    setChecklist(
      pl
        ? pl.items.map((i) => ({
            item_descripcion: i.descripcion,
            cumple: true,
            valor: "",
            observacion: "",
          }))
        : []
    )
  }

  // Sugerencia: rechazado si algún ítem no cumple (salvo override manual)
  const sugerido: ResultadoQc = checklist.some((i) => !i.cumple) ? "rechazado" : "aprobado"
  useEffect(() => {
    if (!resultadoManual) setResultado(sugerido)
  }, [sugerido, resultadoManual])

  const toggleCumple = (idx: number) => {
    setChecklist((prev) => prev.map((it, i) => (i === idx ? { ...it, cumple: !it.cumple } : it)))
  }

  const setCampo = (idx: number, campo: "valor" | "observacion", value: string) => {
    setChecklist((prev) => prev.map((it, i) => (i === idx ? { ...it, [campo]: value } : it)))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!etapa) return
    setSaving(true)
    setError("")
    try {
      await api.calidad.crearRegistro(ordenId, {
        orden_trabajo_id: ordenId,
        etapa,
        plantilla_id: plantilla?.id ?? null,
        resultado,
        observaciones: observaciones.trim() || null,
        items: checklist.map((i) => ({
          item_descripcion: i.item_descripcion,
          cumple: i.cumple,
          valor: i.valor.trim() || null,
          observacion: i.observacion.trim() || null,
        })),
      })
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar el control")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo control de calidad</DialogTitle>
          <DialogDescription>
            Seleccioná la etapa y completá el checklist de la plantilla activa.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Etapa */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Etapa</label>
            <select
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              value={etapa}
              onChange={(e) => handleEtapaChange(e.target.value)}
              disabled={loadingPlantillas}
            >
              <option value="">— Seleccionar etapa —</option>
              {ETAPAS.map((e) => (
                <option key={e.value} value={e.value}>{e.label}</option>
              ))}
            </select>
          </div>

          {/* Checklist */}
          {etapa && (
            plantilla ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  {plantilla.nombre} · {checklist.length} ítem{checklist.length === 1 ? "" : "s"}
                </p>
                <div className="space-y-2">
                  {checklist.map((item, idx) => (
                    <div key={idx} className="rounded-lg border border-border p-3 space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium">{item.item_descripcion}</p>
                        <button
                          type="button"
                          onClick={() => toggleCumple(idx)}
                          className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors ${
                            item.cumple
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                              : "bg-red-500/10 text-red-400 border-red-500/30"
                          }`}
                        >
                          {item.cumple ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                          {item.cumple ? "Cumple" : "No cumple"}
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          placeholder="Valor (opcional)"
                          value={item.valor}
                          onChange={(e) => setCampo(idx, "valor", e.target.value)}
                          className="h-8 text-xs"
                        />
                        <Input
                          placeholder="Observación (opcional)"
                          value={item.observacion}
                          onChange={(e) => setCampo(idx, "observacion", e.target.value)}
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              !loadingPlantillas && (
                <p className="text-sm text-muted-foreground border border-dashed border-border rounded-lg p-3">
                  No hay plantilla activa para esta etapa. Podés registrar el control igual,
                  sin checklist.
                </p>
              )
            )
          )}

          {/* Resultado */}
          {etapa && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Resultado
                {!resultadoManual && checklist.length > 0 && (
                  <span className="ml-1.5 text-muted-foreground/60">(sugerido: {sugerido})</span>
                )}
              </label>
              <div className="flex gap-2">
                {RESULTADOS.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => { setResultado(r.value); setResultadoManual(true) }}
                    className={`flex-1 px-3 py-2 rounded-md text-sm font-medium border transition-colors ${
                      resultado === r.value
                        ? r.className
                        : "bg-background text-muted-foreground border-border hover:bg-accent/30"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Observaciones generales */}
          {etapa && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Observaciones generales</label>
              <textarea
                rows={2}
                placeholder="Observaciones (opcional)"
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              />
            </div>
          )}

          {error && <p className="text-sm text-red-400">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button type="submit" disabled={saving || !etapa}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Guardar control
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
