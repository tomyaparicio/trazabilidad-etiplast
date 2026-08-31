"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import type { Cliente } from "@/types/database"
import type { Factura } from "@/lib/api/types"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Loader2, Check, X, Search, Receipt } from "lucide-react"

const OPT = { color: "#0b0d1e", backgroundColor: "#fff" } as const
const hoy = () => new Date().toISOString().slice(0, 10)

/** Buscador de cliente (mismo patrón que el resto del sistema). */
function ClienteSelector({ value, nombre, onSelect }: {
  value: number | null
  nombre?: string | null
  onSelect: (c: Cliente | null) => void
}) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<Cliente[]>([])
  const [open, setOpen] = useState(false)
  const [sel, setSel] = useState<string>(nombre ?? "")
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => { setSel(nombre ?? "") }, [nombre])

  useEffect(() => {
    if (!open) return
    const t = setTimeout(async () => {
      try {
        const r = await api.clientes.list({ search: query, per_page: 8 })
        setResults(r.data)
      } catch { setResults([]) }
    }, 250)
    return () => clearTimeout(t)
  }, [query, open])

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  }, [])

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={open ? query : sel}
          placeholder="Buscar cliente…"
          autoComplete="off"
          onFocus={() => { setOpen(true); setQuery("") }}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          className="h-11 pl-10"
        />
        {value != null && !open && (
          <button type="button" aria-label="Quitar cliente"
            onClick={() => { onSelect(null); setSel("") }}
            className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        )}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1.5 max-h-56 overflow-y-auto rounded-xl border border-border bg-popover shadow-xl">
          {results.map((c) => (
            <button key={c.id} type="button"
              onMouseDown={() => { onSelect(c); setSel(c.marca || ""); setOpen(false) }}
              className="flex w-full flex-col gap-0.5 px-4 py-2.5 text-left hover:bg-muted/50">
              <span className="text-sm font-semibold text-foreground">{c.marca}</span>
              {c.razon_social && <span className="text-xs text-muted-foreground">{c.razon_social}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  factura: Factura | null
  onSaved: () => void
}

export function FacturaFormDialog({ open, onOpenChange, factura, onSaved }: Props) {
  const [numero, setNumero] = useState("")
  const [tipo, setTipo] = useState("B")
  const [clienteId, setClienteId] = useState<number | null>(null)
  const [clienteNombre, setClienteNombre] = useState<string | null>(null)
  const [fecha, setFecha] = useState(hoy())
  const [vencimiento, setVencimiento] = useState("")
  const [estado, setEstado] = useState("pendiente")
  const [subtotal, setSubtotal] = useState("")
  const [iva, setIva] = useState("21")
  const [observaciones, setObservaciones] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (factura) {
      setNumero(factura.numero ?? "")
      setTipo(factura.tipo ?? "B")
      setClienteId(factura.cliente_id)
      setClienteNombre(factura.cliente_nombre ?? null)
      setFecha(factura.fecha ?? hoy())
      setVencimiento(factura.fecha_vencimiento ?? "")
      setEstado(factura.estado ?? "pendiente")
      setSubtotal(factura.subtotal != null ? String(factura.subtotal) : "")
      setIva(factura.iva_porcentaje != null ? String(factura.iva_porcentaje) : "21")
      setObservaciones(factura.observaciones ?? "")
    } else {
      setNumero(""); setTipo("B"); setClienteId(null); setClienteNombre(null)
      setFecha(hoy()); setVencimiento(""); setEstado("pendiente")
      setSubtotal(""); setIva("21"); setObservaciones("")
    }
  }, [open, factura])

  // Vista previa del total (el backend lo recalcula igual: subtotal + IVA).
  const total = useMemo(() => {
    const s = Number(subtotal) || 0
    const i = Number(iva) || 0
    return s + (s * i) / 100
  }, [subtotal, iva])

  const money = (v: number) => "$ " + new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2 }).format(v)

  const guardar = async () => {
    if (saving) return
    if (!clienteId) { toast.error("Elegí el cliente de la factura"); return }
    if (!subtotal || Number(subtotal) <= 0) { toast.error("Cargá el importe (subtotal)"); return }
    setSaving(true)
    try {
      const body = {
        numero: numero.trim() || undefined,
        tipo,
        cliente_id: clienteId,
        fecha: fecha || undefined,
        fecha_vencimiento: vencimiento || null,
        estado,
        subtotal: Number(subtotal),
        iva_porcentaje: Number(iva) || 0,
        observaciones: observaciones.trim() || null,
      }
      if (factura) await api.facturas.update(factura.id, body)
      else await api.facturas.create(body)
      toast.success(factura ? "Factura actualizada" : "Factura creada")
      onSaved()
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "No se pudo guardar la factura")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!saving) onOpenChange(o) }}>
      <DialogContent showCloseButton={false} className="w-[95vw] max-w-[680px] gap-0 overflow-hidden p-0">
        {/* Header azul de marca */}
        <div className="bg-brand relative overflow-hidden px-7 py-5 text-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logoSOLO.png" alt="" aria-hidden className="pointer-events-none absolute -right-8 -top-8 h-36 w-36 select-none object-contain opacity-[0.12] brightness-0 invert" />
          <div className="relative flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-white/65">
                {factura ? "Editar factura" : "Nueva factura"}
              </p>
              <DialogTitle className="font-brand mt-1 text-[26px] leading-tight text-white">
                {factura ? factura.numero : "Cargar factura"}
              </DialogTitle>
              <DialogDescription className="sr-only">Formulario de factura emitida</DialogDescription>
            </div>
            <button type="button" onClick={() => onOpenChange(false)} aria-label="Cerrar"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/25 bg-white/10 text-white hover:bg-white/20">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-7 py-6">
          <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-6">
            <div className="sm:col-span-4">
              <label className="mb-2 block text-[12.5px] font-bold uppercase tracking-wider text-muted-foreground">Cliente</label>
              <ClienteSelector
                value={clienteId} nombre={clienteNombre}
                onSelect={(c) => { setClienteId(c?.id ?? null); setClienteNombre(c?.marca ?? null) }}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-2 block text-[12.5px] font-bold uppercase tracking-wider text-muted-foreground">Tipo</label>
              <Select value={tipo} onChange={(e) => setTipo(e.target.value)} className="h-11">
                {["A", "B", "C", "X"].map((t) => <option key={t} value={t} style={OPT}>Factura {t}</option>)}
              </Select>
            </div>

            <div className="sm:col-span-2">
              <label className="mb-2 block text-[12.5px] font-bold uppercase tracking-wider text-muted-foreground">
                N° <span className="font-semibold normal-case tracking-normal text-muted-foreground/70">· vacío = automático</span>
              </label>
              <Input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="FC-0001" className="h-11" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-2 block text-[12.5px] font-bold uppercase tracking-wider text-muted-foreground">Fecha</label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="h-11" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-2 block text-[12.5px] font-bold uppercase tracking-wider text-muted-foreground">Vencimiento</label>
              <Input type="date" value={vencimiento} onChange={(e) => setVencimiento(e.target.value)} className="h-11" />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-2 block text-[12.5px] font-bold uppercase tracking-wider text-muted-foreground">Importe (sin IVA)</label>
              <Input type="number" step="0.01" inputMode="decimal" value={subtotal}
                onChange={(e) => setSubtotal(e.target.value)} placeholder="0.00" className="h-11" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-2 block text-[12.5px] font-bold uppercase tracking-wider text-muted-foreground">IVA %</label>
              <Select value={iva} onChange={(e) => setIva(e.target.value)} className="h-11">
                {["21", "10.5", "0"].map((v) => <option key={v} value={v} style={OPT}>{v}%</option>)}
              </Select>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-2 block text-[12.5px] font-bold uppercase tracking-wider text-muted-foreground">Estado</label>
              <Select value={estado} onChange={(e) => setEstado(e.target.value)} className="h-11">
                <option value="pendiente" style={OPT}>Pendiente de cobro</option>
                <option value="cobrada" style={OPT}>Cobrada</option>
                <option value="anulada" style={OPT}>Anulada</option>
              </Select>
            </div>

            {/* Total calculado */}
            <div className="sm:col-span-6 flex items-center justify-between rounded-2xl border border-gold/35 bg-gold/[0.06] px-5 py-4">
              <span className="flex items-center gap-2 text-[13px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
                <Receipt className="size-4 text-gold" /> Total con IVA
              </span>
              <span className="font-display text-[26px] font-bold tabular-nums text-foreground">{money(total)}</span>
            </div>

            <div className="sm:col-span-6">
              <label className="mb-2 block text-[12.5px] font-bold uppercase tracking-wider text-muted-foreground">Observaciones</label>
              <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={2}
                placeholder="Notas de la factura…"
                className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 border-t border-border px-7 py-4">
          <button type="button" onClick={() => onOpenChange(false)} disabled={saving}
            className="h-11 rounded-xl border-[1.5px] border-border px-5 text-[15px] font-extrabold text-foreground hover:bg-muted/40 disabled:opacity-40">
            Cancelar
          </button>
          <button type="button" onClick={guardar} disabled={saving}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-gold px-6 text-[15px] font-extrabold text-gold-foreground hover:brightness-95 disabled:opacity-60">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            {factura ? "Guardar cambios" : "Crear factura"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
