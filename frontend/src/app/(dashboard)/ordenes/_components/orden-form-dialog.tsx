"use client"

import { useEffect, useRef, useState } from "react"
import { api } from "@/lib/api"
import type { Bobina, Cliente, CreateOrdenRequest, EstadoOrden, OrdenTrabajo } from "@/lib/api/types"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { Loader2, Plus, Trash2, Search, ChevronDown, Check } from "lucide-react"

// ─── Helpers ───────────────────────────────────────────────────────────────

const COLORES_PRESET = [
  "Negro", "Blanco", "Rojo", "Azul", "Amarillo", "Verde",
  "Naranja", "Violeta", "Cyan", "Magenta", "Dorado", "Plateado",
]

const ESTADOS_OT: { value: EstadoOrden; label: string }[] = [
  { value: "borrador",   label: "Borrador" },
  { value: "pendiente",  label: "Pendiente" },
  { value: "en_proceso", label: "En Proceso" },
  { value: "completada", label: "Completada" },
  { value: "cancelada",  label: "Cancelada" },
]

function sectionTitle(title: string) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <h3 className="text-xs font-bold uppercase tracking-widest text-[#1a1866]">{title}</h3>
      <div className="flex-1 h-px bg-border" />
    </div>
  )
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</label>
      {children}
    </div>
  )
}

// ─── Selector de cliente con búsqueda ──────────────────────────────────────

interface ClienteSelectorProps {
  value: number | null
  onSelect: (cliente: Cliente) => void
}

function ClienteSelector({ value, onSelect }: ClienteSelectorProps) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<Cliente[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [selectedName, setSelectedName] = useState<string>("")
  const ref = useRef<HTMLDivElement>(null)

  // Cerrar al hacer click afuera
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await api.clientes.list({ search: query, per_page: 10 })
        setResults((res.data as Cliente[]) ?? [])
      } catch { setResults([]) }
      finally { setLoading(false) }
    }, 250)
    return () => clearTimeout(t)
  }, [query])

  return (
    <div ref={ref} className="relative">
      <div
        className="flex items-center gap-2 border border-input rounded-lg px-3 h-9 cursor-pointer hover:border-foreground/40 transition-colors bg-background"
        onClick={() => setOpen((o) => !o)}
      >
        {value ? (
          <span className="flex-1 text-sm font-medium truncate">{selectedName || `Cliente #${value}`}</span>
        ) : (
          <span className="flex-1 text-sm text-muted-foreground">Seleccionar cliente...</span>
        )}
        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-card border border-border rounded-xl shadow-lg overflow-hidden">
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                autoFocus
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por marca o razón social..."
                className="w-full pl-8 pr-3 py-1.5 text-sm bg-background border border-input rounded-md outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>
          <div className="max-h-52 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground text-xs">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Buscando...
              </div>
            ) : results.length === 0 ? (
              <div className="text-center py-4 text-xs text-muted-foreground">
                {query ? "Sin resultados" : "Escribí para buscar"}
              </div>
            ) : (() => {
              // Group by razon_social
              const groups = results.reduce<Record<string, Cliente[]>>((acc, c) => {
                const key = c.razon_social || "__sin__"
                if (!acc[key]) acc[key] = []
                acc[key].push(c)
                return acc
              }, {})
              const multiGroup = Object.keys(groups).length > 1
              return Object.entries(groups).map(([rs, clientes]) => (
                <div key={rs}>
                  {multiGroup && rs !== "__sin__" && (
                    <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/30 border-b border-border">
                      {rs}
                    </div>
                  )}
                  {clientes.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        onSelect(c)
                        setSelectedName(c.marca || c.razon_social || `#${c.id}`)
                        setOpen(false)
                        setQuery("")
                      }}
                      className={`w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-muted/60 transition-colors ${
                        c.id === value ? "bg-primary/5" : ""
                      }`}
                    >
                      {c.id === value && <Check className="w-3 h-3 text-primary shrink-0" />}
                      <div>
                        <p className="text-sm font-medium">{c.marca || c.razon_social}</p>
                        {!multiGroup && c.marca && c.razon_social && (
                          <p className="text-[11px] text-muted-foreground">{c.razon_social}</p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              ))
            })()}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Estado inicial del formulario ─────────────────────────────────────────

function emptyForm(): CreateOrdenRequest & { impresion_colores: string[]; bobinas: Bobina[] } {
  return {
    cliente_id: 0,
    cliente_producto_id: null,
    fecha: new Date().toISOString().split("T")[0],
    estado: "borrador",

    extrusion_ancho: null,
    extrusion_color: "Blanco",
    extrusion_trat: "Con",
    extrusion_espesor: 60,
    extrusion_cant_bob: null,
    extrusion_formulacion: "2045/208",
    bobinas: [{ metros: null, kg_bob: null }],

    impresion_frente: "",
    impresion_observaciones: "",
    impresion_cilindro: null,
    impresion_colores: ["", "", "", "", "", ""],

    troquelado_ancho: null,
    troquelado_alto: null,
    troquelado_envase: "",

    cantidad: null,
    total_final: null,
    observaciones: "",
  }
}

function ordenToForm(orden: OrdenTrabajo): ReturnType<typeof emptyForm> {
  const colores = [...(orden.impresion_colores ?? [])]
  while (colores.length < 6) colores.push("")
  const bobinas = orden.bobinas && orden.bobinas.length > 0
    ? orden.bobinas
    : [{ metros: null, kg_bob: null }]

  return {
    cliente_id: orden.cliente_id,
    cliente_producto_id: orden.cliente_producto_id,
    fecha: orden.fecha ?? new Date().toISOString().split("T")[0],
    estado: orden.estado,

    extrusion_ancho: orden.extrusion_ancho,
    extrusion_color: orden.extrusion_color ?? "Blanco",
    extrusion_trat: orden.extrusion_trat ?? "Con",
    extrusion_espesor: orden.extrusion_espesor ?? 60,
    extrusion_cant_bob: orden.extrusion_cant_bob,
    extrusion_formulacion: orden.extrusion_formulacion ?? "2045/208",
    bobinas,

    impresion_frente: orden.impresion_frente ?? "",
    impresion_observaciones: orden.impresion_observaciones ?? "",
    impresion_cilindro: orden.impresion_cilindro,
    impresion_colores: colores,

    troquelado_ancho: orden.troquelado_ancho,
    troquelado_alto: orden.troquelado_alto,
    troquelado_envase: orden.troquelado_envase ?? "",

    cantidad: orden.cantidad,
    total_final: orden.total_final,
    observaciones: orden.observaciones ?? "",
  }
}

// ─── Componente principal ──────────────────────────────────────────────────

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  orden: OrdenTrabajo | null
  onSaved: (orden: OrdenTrabajo) => void
}

export function OrdenFormDialog({ open, onOpenChange, orden, onSaved }: Props) {
  type Form = ReturnType<typeof emptyForm>
  const [form, setForm] = useState<Form>(emptyForm())
  const [clienteName, setClienteName] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  // Inicializar con datos de la orden al editar
  useEffect(() => {
    if (open) {
      if (orden) {
        setForm(ordenToForm(orden))
        setClienteName(orden.cliente_nombre ?? "")
      } else {
        setForm(emptyForm())
        setClienteName("")
      }
      setError("")
    }
  }, [open, orden])

  const set = (key: keyof Form, value: unknown) =>
    setForm((f) => ({ ...f, [key]: value }))

  const num = (v: string) => (v === "" ? null : Number(v))

  // Autocompletar datos del producto al seleccionar cliente
  const handleSelectCliente = (c: Cliente) => {
    set("cliente_id", c.id)
    setClienteName(c.marca || c.razon_social || "")
    // Auto-fill desde el producto del cliente
    if (c.cilindro != null) set("impresion_cilindro", c.cilindro)
    if (c.alto != null)     set("troquelado_alto", c.alto)
    if (c.envase)           set("troquelado_envase", c.envase)
  }

  // Bobinas
  const addBobina = () =>
    setForm((f) => ({ ...f, bobinas: [...f.bobinas, { metros: null, kg_bob: null }] }))

  const removeBobina = (i: number) =>
    setForm((f) => ({ ...f, bobinas: f.bobinas.filter((_, idx) => idx !== i) }))

  const updateBobina = (i: number, key: "metros" | "kg_bob", v: string) =>
    setForm((f) => ({
      ...f,
      bobinas: f.bobinas.map((b, idx) => idx === i ? { ...b, [key]: num(v) } : b),
    }))

  // Colores
  const updateColor = (i: number, v: string) =>
    setForm((f) => {
      const colores = [...f.impresion_colores]
      colores[i] = v
      return { ...f, impresion_colores: colores }
    })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.cliente_id) { setError("Seleccioná un cliente"); return }

    setSaving(true)
    setError("")
    try {
      const payload = {
        ...form,
        impresion_colores: form.impresion_colores.filter(Boolean),
        bobinas: form.bobinas.filter((b) => b.metros != null || b.kg_bob != null),
      }
      const saved = orden
        ? await api.ordenes.update(orden.id, payload)
        : await api.ordenes.create(payload)
      onSaved(saved)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border sticky top-0 bg-background z-10">
          <DialogTitle className="text-base font-semibold">
            {orden ? `Editar ${orden.numero}` : "Nueva Orden de Trabajo"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-8">
          {/* ── Encabezado: Cliente, Fecha, Estado ── */}
          {sectionTitle("Datos Generales")}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 -mt-4">
            <Field label="Cliente" className="sm:col-span-2">
              <ClienteSelector value={form.cliente_id || null} onSelect={handleSelectCliente} />
            </Field>
            <Field label="Fecha">
              <Input
                type="date"
                value={form.fecha ?? ""}
                onChange={(e) => set("fecha", e.target.value)}
                className="h-9 text-sm"
              />
            </Field>
            <Field label="Estado" className="sm:col-span-1">
              <select
                value={form.estado}
                onChange={(e) => set("estado", e.target.value)}
                className="h-9 text-sm border border-input rounded-lg px-3 bg-background"
              >
                {ESTADOS_OT.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </Field>
          </div>

          {/* ── Extrusión ── */}
          {sectionTitle("Extrusión")}
          <div className="space-y-4 -mt-4">
            {/* Tabla de bobinas MTS / KG/BOB */}
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                MTS / KG por Bobina
              </label>
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 border-b border-border">
                    <tr>
                      <th className="text-left px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase">#</th>
                      <th className="text-left px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase">Metros</th>
                      <th className="text-left px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase">KG/Bob</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {form.bobinas.map((b, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{i + 1}</td>
                        <td className="px-3 py-2">
                          <Input
                            type="number" step="0.01"
                            placeholder="0.00"
                            value={b.metros ?? ""}
                            onChange={(e) => updateBobina(i, "metros", e.target.value)}
                            className="h-7 text-sm w-28"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="number" step="0.001"
                            placeholder="0.000"
                            value={b.kg_bob ?? ""}
                            onChange={(e) => updateBobina(i, "kg_bob", e.target.value)}
                            className="h-7 text-sm w-28"
                          />
                        </td>
                        <td className="px-2 py-2">
                          {form.bobinas.length > 1 && (
                            <button type="button" onClick={() => removeBobina(i)}
                              className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button type="button" onClick={addBobina}
                className="mt-2 flex items-center gap-1.5 text-xs text-primary hover:underline">
                <Plus className="w-3.5 h-3.5" /> Agregar fila
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Field label="Ancho (mm)">
                <Input type="number" step="0.01" value={form.extrusion_ancho ?? ""} placeholder="0.00"
                  onChange={(e) => set("extrusion_ancho", num(e.target.value))} className="h-9 text-sm" />
              </Field>
              <Field label="Color">
                <select
                  value={form.extrusion_color ?? "Blanco"}
                  onChange={(e) => set("extrusion_color", e.target.value)}
                  className="h-9 text-sm border border-input rounded-lg px-3 bg-background"
                >
                  <option value="Blanco">Blanco</option>
                  <option value="Cristal">Cristal</option>
                </select>
              </Field>
              <Field label="Tratamiento">
                <select
                  value={form.extrusion_trat ?? "Con"}
                  onChange={(e) => set("extrusion_trat", e.target.value)}
                  className="h-9 text-sm border border-input rounded-lg px-3 bg-background"
                >
                  <option value="Con">Con</option>
                  <option value="Sin">Sin</option>
                </select>
              </Field>
              <Field label="Micronaje (µ)">
                <div className="h-9 flex items-center px-3 border border-input rounded-lg bg-muted/40 text-sm font-medium text-muted-foreground">
                  60
                </div>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Cant. Bobinas">
                <Input type="number" value={form.extrusion_cant_bob ?? ""} placeholder="0"
                  onChange={(e) => set("extrusion_cant_bob", num(e.target.value))} className="h-9 text-sm" />
              </Field>
              <Field label="Formulación">
                <div className="h-9 flex items-center px-3 border border-input rounded-lg bg-muted/40 text-sm font-medium text-muted-foreground">
                  2045/208
                </div>
              </Field>
            </div>
          </div>

          {/* ── Impresión ── */}
          {sectionTitle("Impresión")}
          <div className="space-y-4 -mt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Frente">
                <textarea value={form.impresion_frente ?? ""} placeholder="Descripción del frente"
                  onChange={(e) => set("impresion_frente", e.target.value)}
                  rows={3}
                  className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring" />
              </Field>
              <Field label="Observación">
                <textarea value={form.impresion_observaciones ?? ""} placeholder="Observaciones de impresión"
                  onChange={(e) => set("impresion_observaciones", e.target.value)}
                  rows={3}
                  className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring" />
              </Field>
            </div>
            <Field label="Cilindro (mm) — auto-completado desde cliente">
              <Input type="number" step="0.01" value={form.impresion_cilindro ?? ""} placeholder="0.00"
                onChange={(e) => set("impresion_cilindro", num(e.target.value))} className="h-9 text-sm w-48" />
            </Field>
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                Colores (hasta 6)
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {form.impresion_colores.map((color, i) => (
                  <div key={i} className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground">{i + 1}.</span>
                    <Input
                      value={color}
                      onChange={(e) => updateColor(i, e.target.value)}
                      placeholder={COLORES_PRESET[i] ?? `Color ${i + 1}`}
                      className="h-9 text-sm pl-7"
                      list={`colores-preset-${i}`}
                    />
                    <datalist id={`colores-preset-${i}`}>
                      {COLORES_PRESET.map((c) => <option key={c} value={c} />)}
                    </datalist>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Troquelado ── */}
          {sectionTitle("Troquelado")}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 -mt-4">
            <Field label="Ancho (mm)">
              <Input type="number" step="0.01" value={form.troquelado_ancho ?? ""} placeholder="0.00"
                onChange={(e) => set("troquelado_ancho", num(e.target.value))} className="h-9 text-sm" />
            </Field>
            <Field label="Alto (mm) — auto-completado">
              <Input type="number" step="0.01" value={form.troquelado_alto ?? ""} placeholder="0.00"
                onChange={(e) => set("troquelado_alto", num(e.target.value))} className="h-9 text-sm" />
            </Field>
            <Field label="Envase — auto-completado">
              <Input value={form.troquelado_envase ?? ""} placeholder="Tipo de envase"
                onChange={(e) => set("troquelado_envase", e.target.value)} className="h-9 text-sm" />
            </Field>
          </div>

          {/* ── Totales ── */}
          {sectionTitle("Totales")}
          <div className="space-y-4 -mt-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Cantidad">
                <Input type="number" value={form.cantidad ?? ""} placeholder="0"
                  onChange={(e) => set("cantidad", num(e.target.value))} className="h-9 text-sm" />
              </Field>
              <Field label="Total Final">
                <Input type="number" step="0.01" value={form.total_final ?? ""} placeholder="0.00"
                  onChange={(e) => set("total_final", num(e.target.value))} className="h-9 text-sm" />
              </Field>
            </div>

            {/* Cálculos automáticos */}
            {(() => {
              const metros = (form.cantidad != null && form.troquelado_alto != null)
                ? form.cantidad * form.troquelado_alto * 1.20
                : null
              const kilos = (form.extrusion_ancho != null && metros != null)
                ? form.extrusion_ancho * metros * 0.6 * 0.92
                : null
              return (
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Metros (calc.)">
                    <div className="h-9 flex items-center px-3 border border-input rounded-lg bg-muted/40 text-sm font-medium">
                      {metros != null ? metros.toFixed(2) : <span className="text-muted-foreground">—</span>}
                    </div>
                  </Field>
                  <Field label="Kilos (calc.)">
                    <div className="h-9 flex items-center px-3 border border-input rounded-lg bg-muted/40 text-sm font-medium">
                      {kilos != null ? kilos.toFixed(3) : <span className="text-muted-foreground">—</span>}
                    </div>
                  </Field>
                </div>
              )
            })()}

            <Field label="Observaciones">
              <Input value={form.observaciones ?? ""} placeholder="Notas adicionales"
                onChange={(e) => set("observaciones", e.target.value)} className="h-9 text-sm" />
            </Field>
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-4 py-2">{error}</p>
          )}

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="bg-[#1a1866] hover:bg-[#14115a] text-white gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {orden ? "Guardar cambios" : "Crear orden"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
