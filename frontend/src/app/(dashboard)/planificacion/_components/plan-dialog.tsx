"use client"

import { useEffect, useRef, useState } from "react"
import { api } from "@/lib/api"
import type { Maquina, OrdenTrabajo, PlanProduccion } from "@/lib/api/types"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AlertTriangle, Loader2, Search, Trash2 } from "lucide-react"

// ─── Tipos locales ─────────────────────────────────────────────────────────

/** PlanProduccion + campos extra que devuelve el backend (cast local, no tocamos types.ts) */
export type PlanRow = PlanProduccion & {
  cliente_nombre?: string | null
  maquina_tipo?: string | null
  warning?: string
}

const ETAPAS = [
  { value: "extrusion",  label: "Extrusión"  },
  { value: "impresion",  label: "Impresión"  },
  { value: "troquelado", label: "Troquelado" },
]

const ESTADOS_PLAN = [
  { value: "planificada", label: "Planificada" },
  { value: "en_curso",    label: "En curso"    },
  { value: "terminada",   label: "Terminada"   },
  { value: "cancelada",   label: "Cancelada"   },
]

const TIPO_LABEL: Record<string, string> = {
  extrusion:  "Extrusión",
  impresion:  "Impresión",
  troquelado: "Troquelado",
}

const inp = "h-9 text-sm border border-input rounded-lg px-3 bg-background w-full"

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</label>
      {children}
    </div>
  )
}

// ─── Selector de OT (búsqueda con debounce) ────────────────────────────────

function OrdenSelector({
  value,
  initialLabel,
  onSelect,
}: {
  value: number | null
  initialLabel?: string
  onSelect: (orden: OrdenTrabajo) => void
}) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<OrdenTrabajo[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [selectedLabel, setSelectedLabel] = useState(initialLabel ?? "")
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (initialLabel) setSelectedLabel(initialLabel)
  }, [initialLabel])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  useEffect(() => {
    if (!open) return
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        // El plan pide OTs pendientes o en proceso: el endpoint filtra de a un
        // estado, así que hacemos dos consultas y unimos.
        const [pend, proc] = await Promise.all([
          api.ordenes.list({ search: query || undefined, estado: "pendiente",  per_page: 8 }),
          api.ordenes.list({ search: query || undefined, estado: "en_proceso", per_page: 8 }),
        ])
        const vistos = new Set<number>()
        const unidas = [...pend.data, ...proc.data]
          .filter((o) => (vistos.has(o.id) ? false : (vistos.add(o.id), true)))
          .sort((a, b) => b.id - a.id)
          .slice(0, 12)
        setResults(unidas)
      } finally {
        setLoading(false)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [query, open])

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          value={open ? query : selectedLabel}
          onFocus={() => { setOpen(true); setQuery("") }}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={value ? selectedLabel : "Buscar OT por número o cliente…"}
          className="pl-9 h-9 text-sm"
        />
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-popover border border-border rounded-lg shadow-lg max-h-56 overflow-y-auto">
          {loading && (
            <div className="flex items-center gap-2 px-3 py-2.5 text-sm text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Buscando…
            </div>
          )}
          {!loading && results.length === 0 && (
            <p className="px-3 py-2.5 text-sm text-muted-foreground">
              Sin órdenes pendientes o en proceso que coincidan
            </p>
          )}
          {!loading && results.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => {
                onSelect(o)
                setSelectedLabel(`${o.numero} — ${o.cliente_nombre ?? "sin cliente"}`)
                setOpen(false)
              }}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center justify-between gap-2 ${o.id === value ? "bg-accent/60" : ""}`}
            >
              <span className="font-medium">{o.numero}</span>
              <span className="text-muted-foreground truncate">{o.cliente_nombre ?? "—"}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Dialog principal ──────────────────────────────────────────────────────

interface PlanDialogProps {
  open: boolean
  onClose: () => void
  /** Se llama después de crear/editar/borrar para refrescar la grilla */
  onSaved: () => void
  maquinas: Maquina[]
  /** Plan a editar; null = crear nuevo */
  plan: PlanRow | null
  /** Fecha inicial sugerida (lunes de la semana visible) en formato YYYY-MM-DD */
  fechaSugerida: string
}

type FormState = {
  orden_trabajo_id: number | null
  maquina_id: number | null
  etapa: string
  fecha_inicio: string
  fecha_fin: string
  orden_prioridad: number
  estado: string
  notas: string
}

export function PlanDialog({ open, onClose, onSaved, maquinas, plan, fechaSugerida }: PlanDialogProps) {
  const esEdicion = plan != null
  const [form, setForm] = useState<FormState>({
    orden_trabajo_id: null,
    maquina_id: null,
    etapa: "extrusion",
    fecha_inicio: fechaSugerida,
    fecha_fin: fechaSugerida,
    orden_prioridad: 0,
    estado: "planificada",
    notas: "",
  })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setWarning(null)
    if (plan) {
      setForm({
        orden_trabajo_id: plan.orden_trabajo_id,
        maquina_id: plan.maquina_id,
        etapa: plan.etapa ?? "extrusion",
        fecha_inicio: plan.fecha_inicio ?? fechaSugerida,
        fecha_fin: plan.fecha_fin ?? plan.fecha_inicio ?? fechaSugerida,
        orden_prioridad: plan.orden_prioridad ?? 0,
        estado: plan.estado ?? "planificada",
        notas: plan.notas ?? "",
      })
    } else {
      setForm({
        orden_trabajo_id: null,
        maquina_id: null,
        etapa: "extrusion",
        fecha_inicio: fechaSugerida,
        fecha_fin: fechaSugerida,
        orden_prioridad: 0,
        estado: "planificada",
        notas: "",
      })
    }
  }, [open, plan, fechaSugerida])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const seleccionarMaquina = (id: number | null) => {
    set("maquina_id", id)
    // Etapa auto-sugerida según el tipo de máquina
    const m = maquinas.find((mq) => mq.id === id)
    if (m && ETAPAS.some((e) => e.value === m.tipo)) set("etapa", m.tipo)
  }

  const tiposOrdenados = ["extrusion", "impresion", "troquelado"]
  const gruposMaquinas = tiposOrdenados
    .map((tipo) => ({ tipo, items: maquinas.filter((m) => m.tipo === tipo) }))
    .filter((g) => g.items.length > 0)
  const sinTipo = maquinas.filter((m) => !tiposOrdenados.includes(m.tipo))

  const handleSubmit = async () => {
    setError(null)
    if (!form.orden_trabajo_id) { setError("Seleccioná una orden de trabajo"); return }
    if (!form.maquina_id)       { setError("Seleccioná una máquina"); return }
    if (!form.fecha_inicio)     { setError("Indicá la fecha de inicio"); return }
    if (form.fecha_fin && form.fecha_fin < form.fecha_inicio) {
      setError("La fecha de fin no puede ser anterior a la de inicio")
      return
    }
    setSaving(true)
    try {
      const payload = {
        orden_trabajo_id: form.orden_trabajo_id,
        maquina_id: form.maquina_id,
        etapa: form.etapa,
        fecha_inicio: form.fecha_inicio,
        fecha_fin: form.fecha_fin || form.fecha_inicio,
        orden_prioridad: form.orden_prioridad,
        estado: form.estado,
        notas: form.notas || null,
      }
      const res = (esEdicion
        ? await api.planificacion.update(plan!.id, payload)
        : await api.planificacion.create(payload)) as PlanRow
      onSaved()
      if (res.warning) {
        // Solape de máquina: se guardó igual, avisamos sin bloquear
        setWarning(res.warning)
      } else {
        onClose()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar el plan")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!plan) return
    if (!window.confirm(`¿Eliminar la planificación de ${plan.orden_numero ?? "esta orden"}?`)) return
    setDeleting(true)
    setError(null)
    try {
      await api.planificacion.delete(plan.id)
      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al eliminar el plan")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogTitle>{esEdicion ? `Editar plan — ${plan?.orden_numero ?? ""}` : "Planificar OT"}</DialogTitle>
        <DialogDescription>
          {esEdicion
            ? "Reprogramá fechas, máquina, prioridad o estado del plan."
            : "Asigná una orden de trabajo a una máquina en un rango de fechas."}
        </DialogDescription>

        {warning ? (
          <div className="space-y-4">
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-sm text-amber-600 dark:text-amber-400">{warning}</p>
            </div>
            <div className="flex justify-end">
              <Button onClick={onClose} className="bg-[#1a1866] hover:bg-[#14115a] text-white">
                Entendido
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <Field label="Orden de trabajo">
              <OrdenSelector
                value={form.orden_trabajo_id}
                initialLabel={plan ? `${plan.orden_numero ?? ""} — ${plan.cliente_marca ?? plan.cliente_nombre ?? ""}` : undefined}
                onSelect={(o) => set("orden_trabajo_id", o.id)}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Máquina">
                <select
                  value={form.maquina_id ?? ""}
                  onChange={(e) => seleccionarMaquina(e.target.value === "" ? null : Number(e.target.value))}
                  className={inp}
                >
                  <option value="">Seleccionar…</option>
                  {gruposMaquinas.map((g) => (
                    <optgroup key={g.tipo} label={TIPO_LABEL[g.tipo] ?? g.tipo}>
                      {g.items.map((m) => (
                        <option key={m.id} value={m.id}>{m.nombre}</option>
                      ))}
                    </optgroup>
                  ))}
                  {sinTipo.length > 0 && (
                    <optgroup label="Otras">
                      {sinTipo.map((m) => (
                        <option key={m.id} value={m.id}>{m.nombre}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </Field>
              <Field label="Etapa">
                <select value={form.etapa} onChange={(e) => set("etapa", e.target.value)} className={inp}>
                  {ETAPAS.map((et) => (
                    <option key={et.value} value={et.value}>{et.label}</option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Fecha inicio">
                <input
                  type="date"
                  value={form.fecha_inicio}
                  onChange={(e) => set("fecha_inicio", e.target.value)}
                  className={inp}
                />
              </Field>
              <Field label="Fecha fin">
                <input
                  type="date"
                  value={form.fecha_fin}
                  min={form.fecha_inicio || undefined}
                  onChange={(e) => set("fecha_fin", e.target.value)}
                  className={inp}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Prioridad">
                <Input
                  type="number"
                  min={0}
                  value={form.orden_prioridad}
                  onChange={(e) => set("orden_prioridad", Number(e.target.value) || 0)}
                  className="h-9 text-sm"
                />
              </Field>
              {esEdicion && (
                <Field label="Estado">
                  <select value={form.estado} onChange={(e) => set("estado", e.target.value)} className={inp}>
                    {ESTADOS_PLAN.map((es) => (
                      <option key={es.value} value={es.value}>{es.label}</option>
                    ))}
                  </select>
                </Field>
              )}
            </div>

            <Field label="Notas">
              <textarea
                value={form.notas}
                onChange={(e) => set("notas", e.target.value)}
                rows={2}
                placeholder="Observaciones de la planificación…"
                className="text-sm border border-input rounded-lg px-3 py-2 bg-background w-full resize-none"
              />
            </Field>

            {error && (
              <div className="flex items-start gap-2.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5">
                <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            <div className="flex items-center justify-between pt-1">
              {esEdicion ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleDelete}
                  disabled={deleting || saving}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5"
                >
                  {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Eliminar
                </Button>
              ) : <span />}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
                  Cancelar
                </Button>
                <Button
                  type="button"
                  onClick={handleSubmit}
                  disabled={saving || deleting}
                  className="bg-[#1a1866] hover:bg-[#14115a] text-white gap-2"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {esEdicion ? "Guardar cambios" : "Planificar"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
