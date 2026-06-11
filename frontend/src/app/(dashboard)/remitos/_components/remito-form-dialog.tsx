"use client"

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import type { Cliente, OrdenTrabajo } from "@/lib/api/types"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Loader2, Plus, Trash2, Search, ChevronDown, Check } from "lucide-react"
import type { RemitoX } from "./remitos-table"

// ─── Tipos ─────────────────────────────────────────────────────────────────

/** OT con lote (el tipo base aún no lo expone) */
type OrdenConLote = OrdenTrabajo & { lote?: string | null }

type ItemForm = {
  orden_trabajo_id: number | null
  descripcion: string
  cantidad: number | null
  unidad: string
  lote: string
}

function emptyItem(): ItemForm {
  return { orden_trabajo_id: null, descripcion: "", cantidad: null, unidad: "un", lote: "" }
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</label>
      {children}
    </div>
  )
}

// ─── Selector de cliente (patrón orden-form-dialog) ────────────────────────

function ClienteSelector({ value, onSelect, initialName }: { value: number | null; onSelect: (c: Cliente) => void; initialName?: string }) {
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
        className="flex items-center gap-2 border border-input rounded-lg px-3 h-9 cursor-pointer hover:border-foreground/40 transition-colors bg-background"
        onClick={() => setOpen((o) => !o)}
      >
        {value
          ? <span className="flex-1 text-sm font-medium truncate">{displayName}</span>
          : <span className="flex-1 text-sm text-muted-foreground">Seleccionar cliente...</span>
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
            ) : results.map((c) => (
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
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Componente principal ──────────────────────────────────────────────────

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  remito: RemitoX | null
  onSaved: (remito: RemitoX) => void
}

export function RemitoFormDialog({ open, onOpenChange, remito, onSaved }: Props) {
  const [clienteId, setClienteId] = useState<number | null>(null)
  const [clienteName, setClienteName] = useState("")
  const [fecha, setFecha] = useState("")
  const [transporte, setTransporte] = useState("")
  const [domicilio, setDomicilio] = useState("")
  const [observaciones, setObservaciones] = useState("")
  const [items, setItems] = useState<ItemForm[]>([emptyItem()])
  const [ordenes, setOrdenes] = useState<OrdenConLote[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const fetchOrdenes = (cid: number) => {
    api.ordenes.list({ cliente_id: cid, estado: "completada", per_page: 100 })
      .then((res) => setOrdenes(res.data as OrdenConLote[]))
      .catch(() => setOrdenes([]))
  }

  useEffect(() => {
    if (!open) return
    setError("")
    if (remito) {
      setClienteId(remito.cliente_id)
      setClienteName(remito.cliente_nombre ?? "")
      setFecha(remito.fecha ?? new Date().toISOString().split("T")[0])
      setTransporte(remito.transporte ?? "")
      setDomicilio(remito.domicilio_entrega ?? "")
      setObservaciones(remito.observaciones ?? "")
      setItems(
        remito.items.length > 0
          ? remito.items.map((i) => ({
              orden_trabajo_id: i.orden_trabajo_id,
              descripcion: i.descripcion ?? "",
              cantidad: i.cantidad,
              unidad: i.unidad ?? "un",
              lote: i.lote ?? "",
            }))
          : [emptyItem()]
      )
      if (remito.cliente_id) fetchOrdenes(remito.cliente_id)
    } else {
      setClienteId(null)
      setClienteName("")
      setFecha(new Date().toISOString().split("T")[0])
      setTransporte("")
      setDomicilio("")
      setObservaciones("")
      setItems([emptyItem()])
      setOrdenes([])
    }
  }, [open, remito])

  const handleSelectCliente = (c: Cliente) => {
    setClienteId(c.id)
    setClienteName(c.marca || c.razon_social || "")
    // Prefill domicilio de entrega y transporte desde la ficha del cliente
    const dom = [c.domicilio, c.localidad].filter(Boolean).join(", ")
    setDomicilio(dom)
    if (c.transporte) setTransporte(c.transporte)
    fetchOrdenes(c.id)
  }

  const updateItem = (i: number, patch: Partial<ItemForm>) =>
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)))

  const handleSelectOrden = (i: number, value: string) => {
    const id = value === "" ? null : Number(value)
    if (id === null) {
      updateItem(i, { orden_trabajo_id: null })
      return
    }
    const ot = ordenes.find((o) => o.id === id)
    if (!ot) {
      updateItem(i, { orden_trabajo_id: id })
      return
    }
    setItems((prev) => prev.map((it, idx) => {
      if (idx !== i) return it
      return {
        ...it,
        orden_trabajo_id: id,
        // Prefill desde la OT elegida
        lote: ot.lote ?? it.lote,
        descripcion: it.descripcion || ot.troquelado_envase || `Producción ${ot.numero}`,
        cantidad: it.cantidad ?? ot.cantidad,
      }
    }))
  }

  const handleSubmit = async () => {
    if (!clienteId) { setError("Seleccioná un cliente"); return }
    const itemsValidos = items.filter((i) => i.descripcion.trim() || i.orden_trabajo_id)
    if (itemsValidos.length === 0) { setError("Agregá al menos un ítem con descripción u OT"); return }

    setSaving(true); setError("")
    try {
      const payload = {
        cliente_id: clienteId,
        fecha: fecha || undefined,
        transporte: transporte || null,
        domicilio_entrega: domicilio || null,
        observaciones: observaciones || null,
        items: itemsValidos.map((i) => ({
          orden_trabajo_id: i.orden_trabajo_id,
          descripcion: i.descripcion || null,
          cantidad: i.cantidad,
          unidad: i.unidad || null,
          lote: i.lote || null,
        })),
      }
      const saved = remito
        ? await api.remitos.update(remito.id, payload)
        : await api.remitos.create(payload)
      onSaved(saved as RemitoX)
      toast.success(remito ? "Remito actualizado" : "Remito creado")
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al guardar"
      setError(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">

        {/* ── Header ── */}
        <div className="px-6 pt-5 pb-4 border-b border-border shrink-0">
          <DialogTitle className="text-base font-semibold">
            {remito ? `Editar ${remito.numero}` : "Nuevo Remito"}
            {clienteName && <span className="ml-2 text-sm font-normal text-muted-foreground">· {clienteName}</span>}
          </DialogTitle>
        </div>

        {/* ── Content ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Cliente" className="sm:col-span-2">
              <ClienteSelector value={clienteId} onSelect={handleSelectCliente} initialName={clienteName} />
            </Field>
            <Field label="Fecha">
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="h-9 text-sm" />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Transporte">
              <Input placeholder="Nombre del transporte" value={transporte}
                onChange={(e) => setTransporte(e.target.value)} className="h-9 text-sm" />
            </Field>
            <Field label="Domicilio de entrega">
              <Input placeholder="Domicilio del cliente por defecto" value={domicilio}
                onChange={(e) => setDomicilio(e.target.value)} className="h-9 text-sm" />
            </Field>
          </div>

          {/* ── Ítems ── */}
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
              Ítems del remito
            </label>
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b border-border">
                  <tr>
                    <th className="text-left px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase">OT</th>
                    <th className="text-left px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase">Descripción</th>
                    <th className="text-left px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase">Cant.</th>
                    <th className="text-left px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase">Unidad</th>
                    <th className="text-left px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase">Lote</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.map((item, i) => (
                    <tr key={i}>
                      <td className="px-2 py-2">
                        <select
                          value={item.orden_trabajo_id ?? ""}
                          onChange={(e) => handleSelectOrden(i, e.target.value)}
                          className="h-8 text-xs border border-input rounded-md px-2 bg-background w-32"
                          disabled={!clienteId}
                        >
                          <option value="">Texto libre</option>
                          {ordenes.map((o) => (
                            <option key={o.id} value={o.id}>{o.numero}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        <Input placeholder="Descripción de la mercadería" value={item.descripcion}
                          onChange={(e) => updateItem(i, { descripcion: e.target.value })} className="h-8 text-xs min-w-40" />
                      </td>
                      <td className="px-2 py-2">
                        <Input type="number" step="0.01" placeholder="0" value={item.cantidad ?? ""}
                          onChange={(e) => updateItem(i, { cantidad: e.target.value === "" ? null : Number(e.target.value) })}
                          className="h-8 text-xs w-20" />
                      </td>
                      <td className="px-2 py-2">
                        <Input placeholder="un" value={item.unidad}
                          onChange={(e) => updateItem(i, { unidad: e.target.value })} className="h-8 text-xs w-16" />
                      </td>
                      <td className="px-2 py-2">
                        <Input placeholder="Lote" value={item.lote}
                          onChange={(e) => updateItem(i, { lote: e.target.value })} className="h-8 text-xs w-32" />
                      </td>
                      <td className="px-2 py-2">
                        {items.length > 1 && (
                          <button type="button" onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}
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
            <button type="button" onClick={() => setItems((prev) => [...prev, emptyItem()])}
              className="mt-2 flex items-center gap-1.5 text-xs text-primary hover:underline">
              <Plus className="w-3.5 h-3.5" /> Agregar ítem
            </button>
            {clienteId && ordenes.length === 0 && (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                El cliente no tiene órdenes completadas — podés cargar los ítems como texto libre.
              </p>
            )}
          </div>

          <Field label="Observaciones">
            <textarea value={observaciones} placeholder="Notas del remito"
              onChange={(e) => setObservaciones(e.target.value)} rows={2}
              className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring" />
          </Field>

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-4 py-2">{error}</p>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-4 border-t border-border shrink-0 flex items-center justify-between">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={saving}
            className="bg-[#1a1866] hover:bg-[#14115a] text-white gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {remito ? "Guardar cambios" : "Crear remito"}
          </Button>
        </div>

      </DialogContent>
    </Dialog>
  )
}
