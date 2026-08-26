"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import type { Cliente, EstadoPresupuesto } from "@/lib/api/types"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Check, ChevronDown, Loader2, Plus, Search, Trash2 } from "lucide-react"
import { ESTADO_PRESUPUESTO, type PresupuestoRow } from "./presupuestos-table"

// ─── Helpers ───────────────────────────────────────────────────────────────

const fmtMoneda = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 })

function num(v: string | number | null | undefined): number {
  if (v == null || v === "") return 0
  const n = typeof v === "number" ? v : parseFloat(v)
  return isNaN(n) ? 0 : n
}

type ItemForm = {
  id?: number
  descripcion: string
  cantidad: string
  unidad: string
  precio_unitario: string
}

function emptyItem(): ItemForm {
  return { descripcion: "", cantidad: "", unidad: "un", precio_unitario: "" }
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</label>
      {children}
    </div>
  )
}

// ─── Selector de cliente (patrón de orden-form-dialog) ─────────────────────

function ClienteSelector({ value, onSelect, initialName }: {
  value: number | null
  onSelect: (c: Cliente) => void
  initialName?: string
}) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<Cliente[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [selectedName, setSelectedName] = useState<string>(initialName ?? "")
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (initialName) setSelectedName(initialName)
  }, [initialName])

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

  const displayName = selectedName || (value ? `Cliente #${value}` : "")

  return (
    <div ref={ref} className="relative">
      <div
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        tabIndex={0}
        className="flex items-center gap-2 border border-input rounded-lg px-3 h-9 cursor-pointer hover:border-foreground/40 transition-colors bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen((o) => !o) }
          else if (e.key === "Escape") setOpen(false)
        }}
      >
        {value
          ? <span className="flex-1 text-sm font-medium truncate">{displayName}</span>
          : <span className="flex-1 text-sm text-muted-foreground">Seleccionar marca...</span>
        }
        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-card border border-border rounded-xl shadow-lg overflow-hidden">
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                autoFocus type="text" value={query}
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
            ) : (
              results.map((c) => (
                <button key={c.id} type="button"
                  onClick={() => { onSelect(c); setSelectedName(c.marca || c.razon_social || `#${c.id}`); setOpen(false); setQuery("") }}
                  className={`w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-muted/60 transition-colors ${c.id === value ? "bg-primary/5" : ""}`}
                >
                  {c.id === value && <Check className="w-3 h-3 text-primary shrink-0" />}
                  <div>
                    <p className="text-sm font-medium">{c.marca || c.razon_social}</p>
                    {c.razon_social && c.marca && (
                      <p className="text-[10px] text-muted-foreground/60 mt-0.5">{c.razon_social}</p>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Dialog principal ──────────────────────────────────────────────────────

interface Props {
  /** null = crear nuevo */
  presupuesto: PresupuestoRow | null
  onClose: () => void
  onSaved: (p: PresupuestoRow) => void
}

export function PresupuestoFormDialog({ presupuesto, onClose, onSaved }: Props) {
  const editing = presupuesto != null

  const [tipoCliente, setTipoCliente] = useState<"cliente" | "prospecto">(
    presupuesto && !presupuesto.cliente_id && presupuesto.prospecto_nombre ? "prospecto" : "cliente"
  )
  const [clienteId, setClienteId] = useState<number | null>(presupuesto?.cliente_id ?? null)
  const [clienteNombre, setClienteNombre] = useState<string>(presupuesto?.cliente_nombre ?? "")
  const [prospectoNombre, setProspectoNombre] = useState(presupuesto?.prospecto_nombre ?? "")
  const [fecha, setFecha] = useState(presupuesto?.fecha ?? new Date().toISOString().split("T")[0])
  const [validezDias, setValidezDias] = useState(String(presupuesto?.validez_dias ?? 30))
  const [estado, setEstado] = useState<EstadoPresupuesto>(presupuesto?.estado ?? "borrador")
  const [moneda, setMoneda] = useState(presupuesto?.moneda ?? "ARS")
  const [condicionesPago, setCondicionesPago] = useState(presupuesto?.condiciones_pago ?? "")
  const [descuento, setDescuento] = useState(String(presupuesto?.descuento_porcentaje ?? 0))
  const [iva, setIva] = useState(String(presupuesto?.iva_porcentaje ?? 21))
  const [observaciones, setObservaciones] = useState(presupuesto?.observaciones ?? "")
  const [items, setItems] = useState<ItemForm[]>(
    presupuesto?.items?.length
      ? presupuesto.items.map((i) => ({
          id: i.id,
          descripcion: i.descripcion ?? "",
          cantidad: i.cantidad != null ? String(i.cantidad) : "",
          unidad: i.unidad ?? "un",
          precio_unitario: i.precio_unitario != null ? String(i.precio_unitario) : "",
        }))
      : [emptyItem()]
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  // Totales en vivo
  const totales = useMemo(() => {
    const subtotal = items.reduce((acc, i) => acc + num(i.cantidad) * num(i.precio_unitario), 0)
    const total = subtotal * (1 - num(descuento) / 100) * (1 + num(iva) / 100)
    return { subtotal, total }
  }, [items, descuento, iva])

  // Habilita el submit solo si los campos obligatorios están completos (misma regla que handleSubmit)
  const isValid =
    (tipoCliente === "cliente" ? !!clienteId : prospectoNombre.trim().length > 0) &&
    items.some((i) => i.descripcion.trim() || num(i.cantidad) > 0 || num(i.precio_unitario) > 0)

  const setItem = (idx: number, patch: Partial<ItemForm>) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)))
  }

  const handleSubmit = async () => {
    if (saving) return
    setError("")

    if (tipoCliente === "cliente" && !clienteId) {
      setError("Seleccioná un cliente o cambiá a prospecto")
      return
    }
    if (tipoCliente === "prospecto" && !prospectoNombre.trim()) {
      setError("Indicá el nombre del prospecto")
      return
    }
    const itemsValidos = items.filter((i) => i.descripcion.trim() || num(i.cantidad) > 0 || num(i.precio_unitario) > 0)
    if (itemsValidos.length === 0) {
      setError("Agregá al menos un ítem al presupuesto")
      return
    }

    const payload = {
      cliente_id: tipoCliente === "cliente" ? clienteId : null,
      prospecto_nombre: tipoCliente === "prospecto" ? prospectoNombre.trim() : null,
      fecha,
      validez_dias: parseInt(validezDias) || 30,
      estado,
      moneda,
      condiciones_pago: condicionesPago.trim() || null,
      descuento_porcentaje: num(descuento),
      iva_porcentaje: num(iva),
      observaciones: observaciones.trim() || null,
      items: itemsValidos.map((i) => ({
        ...(i.id != null ? { id: i.id } : {}),
        descripcion: i.descripcion.trim() || null,
        cantidad: num(i.cantidad),
        unidad: i.unidad.trim() || null,
        precio_unitario: num(i.precio_unitario),
      })),
    }

    setSaving(true)
    try {
      const saved = editing
        ? await api.presupuestos.update(presupuesto!.id, payload)
        : await api.presupuestos.create(payload)
      toast.success(editing ? "Presupuesto actualizado" : "Presupuesto creado")
      onSaved(saved as PresupuestoRow)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al guardar el presupuesto"
      setError(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !saving) onClose() }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border sticky top-0 bg-background z-10">
          <DialogTitle className="text-lg font-semibold">
            {editing ? `Editar ${presupuesto!.numero}` : "Nuevo presupuesto"}
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 py-5 space-y-6">

          {/* ── Cliente / Prospecto ── */}
          <div className="space-y-3">
            <div className="flex gap-2">
              {([
                { value: "cliente",   label: "Cliente existente" },
                { value: "prospecto", label: "Prospecto" },
              ] as const).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setTipoCliente(opt.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    tipoCliente === opt.value
                      ? "bg-brand text-white border-brand dark:bg-[#6b7aff]/20 dark:text-[#6b7aff] dark:border-[#6b7aff]/40"
                      : "bg-background text-muted-foreground border-border hover:border-foreground/30"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {tipoCliente === "cliente" ? (
              <Field label="Cliente">
                <ClienteSelector
                  value={clienteId}
                  initialName={clienteNombre}
                  onSelect={(c) => { setClienteId(c.id); setClienteNombre(c.marca || c.razon_social || `#${c.id}`) }}
                />
              </Field>
            ) : (
              <Field label="Nombre del prospecto">
                <Input
                  value={prospectoNombre}
                  onChange={(e) => setProspectoNombre(e.target.value)}
                  placeholder="Cliente potencial aún no cargado…"
                  className="h-9"
                />
              </Field>
            )}
          </div>

          {/* ── Datos generales ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Field label="Fecha">
              <Input type="date" value={fecha ?? ""} onChange={(e) => setFecha(e.target.value)} className="h-9" />
            </Field>
            <Field label="Validez (días)">
              <Input type="number" min={1} value={validezDias} onChange={(e) => setValidezDias(e.target.value)} className="h-9" />
            </Field>
            <Field label="Moneda">
              <Select value={moneda ?? "ARS"} onChange={(e) => setMoneda(e.target.value)} className="h-9">
                <option value="ARS">ARS</option>
                <option value="USD">USD</option>
              </Select>
            </Field>
            <Field label="Estado">
              <Select value={estado} onChange={(e) => setEstado(e.target.value as EstadoPresupuesto)} className="h-9">
                {(Object.keys(ESTADO_PRESUPUESTO) as EstadoPresupuesto[])
                  .filter((e) => e !== "convertido")
                  .map((e) => (
                    <option key={e} value={e}>{ESTADO_PRESUPUESTO[e].label}</option>
                  ))}
              </Select>
            </Field>
          </div>

          {/* ── Ítems ── */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <h3 className="text-xs font-bold uppercase tracking-widest text-brand dark:text-blue-400 shrink-0">Ítems</h3>
              <div className="flex-1 h-px bg-border" />
              <Button
                type="button" size="sm" variant="outline"
                onClick={() => setItems((prev) => [...prev, emptyItem()])}
                className="gap-1.5 text-xs h-7"
              >
                <Plus className="w-3.5 h-3.5" /> Agregar ítem
              </Button>
            </div>

            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b border-border">
                  <tr className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    <th className="text-left px-3 py-2">Descripción</th>
                    <th className="text-left px-3 py-2 w-24">Cantidad</th>
                    <th className="text-left px-3 py-2 w-20">Unidad</th>
                    <th className="text-left px-3 py-2 w-32">P. unitario</th>
                    <th className="text-right px-3 py-2 w-28">Subtotal</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.map((item, idx) => (
                    <tr key={idx}>
                      <td className="px-2 py-1.5">
                        <Input
                          value={item.descripcion}
                          onChange={(e) => setItem(idx, { descripcion: e.target.value })}
                          placeholder="Descripción del ítem…"
                          className="h-8 text-sm"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          type="number" min={0} step="any"
                          value={item.cantidad}
                          onChange={(e) => setItem(idx, { cantidad: e.target.value })}
                          className="h-8 text-sm tabular-nums"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          value={item.unidad}
                          onChange={(e) => setItem(idx, { unidad: e.target.value })}
                          placeholder="un"
                          className="h-8 text-sm"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          type="number" min={0} step="any"
                          value={item.precio_unitario}
                          onChange={(e) => setItem(idx, { precio_unitario: e.target.value })}
                          className="h-8 text-sm tabular-nums"
                        />
                      </td>
                      <td className="px-3 py-1.5 text-right font-medium tabular-nums whitespace-nowrap">
                        {fmtMoneda.format(num(item.cantidad) * num(item.precio_unitario))}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <button
                          type="button"
                          onClick={() => setItems((prev) => prev.length > 1 ? prev.filter((_, i) => i !== idx) : [emptyItem()])}
                          className="text-muted-foreground hover:text-red-400 transition-colors"
                          aria-label="Eliminar ítem"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Totales ── */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Descuento (%)">
                <Input type="number" min={0} max={100} step="any" value={descuento} onChange={(e) => setDescuento(e.target.value)} className="h-9 tabular-nums" />
              </Field>
              <Field label="IVA (%)">
                <Input type="number" min={0} step="any" value={iva} onChange={(e) => setIva(e.target.value)} className="h-9 tabular-nums" />
              </Field>
            </div>
            <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium tabular-nums">{fmtMoneda.format(totales.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Desc. {num(descuento)}% · IVA {num(iva)}%</span>
                <span />
              </div>
              <div className="flex justify-between text-base border-t border-border pt-1.5">
                <span className="font-semibold">Total</span>
                <span className="font-bold tabular-nums text-gold">{fmtMoneda.format(totales.total)}</span>
              </div>
            </div>
          </div>

          {/* ── Condiciones / Observaciones ── */}
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Condiciones de pago">
              <Input
                value={condicionesPago}
                onChange={(e) => setCondicionesPago(e.target.value)}
                placeholder="Ej: 50% anticipo, saldo contra entrega"
                className="h-9"
              />
            </Field>
            <Field label="Observaciones">
              <Input
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                placeholder="Notas internas o para el cliente…"
                className="h-9"
              />
            </Field>
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-4 border-t border-border flex justify-end gap-2 sticky bottom-0 bg-background">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={saving || !isValid}
            className="bg-brand hover:bg-brand-strong text-white gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {editing ? "Guardar cambios" : "Crear presupuesto"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
