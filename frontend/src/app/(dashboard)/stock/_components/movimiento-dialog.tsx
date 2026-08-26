"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import type { StockItem, TipoStockMovimiento } from "@/lib/api/types"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { AlertCircle, Loader2, ArrowDownToLine, ArrowUpFromLine, Equal } from "lucide-react"

const TIPOS: { value: TipoStockMovimiento; label: string; descripcion: string }[] = [
  { value: "ingreso", label: "Ingreso", descripcion: "Suma la cantidad al stock actual." },
  { value: "egreso",  label: "Egreso",  descripcion: "Resta la cantidad del stock actual." },
  { value: "ajuste",  label: "Ajuste",  descripcion: "Fija el stock en el valor absoluto indicado (no suma ni resta)." },
]

const MOTIVOS = ["compra", "producción", "despacho", "devolución", "rotura", "inventario", "otro"]

interface MovimientoDialogProps {
  item: StockItem | null
  onClose: () => void
  onSaved: () => void
}

export function MovimientoDialog({ item, onClose, onSaved }: MovimientoDialogProps) {
  const [tipo, setTipo] = useState<TipoStockMovimiento>("ingreso")
  const [cantidad, setCantidad] = useState("")
  const [motivo, setMotivo] = useState(MOTIVOS[0])
  const [lote, setLote] = useState("")
  const [observaciones, setObservaciones] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!item) return
    setTipo("ingreso")
    setCantidad("")
    setMotivo(MOTIVOS[0])
    setLote("")
    setObservaciones("")
    setError(null)
    setSaving(false)
  }, [item])

  const tipoInfo = TIPOS.find((t) => t.value === tipo)
  const nf = new Intl.NumberFormat("es-AR")

  const handleSubmit = async () => {
    if (!item) return
    const cant = Number(cantidad)
    if (cantidad === "" || Number.isNaN(cant)) {
      setError("Ingresá una cantidad válida")
      return
    }
    setSaving(true)
    setError(null)
    try {
      await api.stock.crearMovimiento(item.id, {
        stock_item_id: item.id,
        tipo,
        cantidad: cant,
        motivo,
        lote: lote.trim() || undefined,
        observaciones: observaciones.trim() || undefined,
      })
      toast.success("Movimiento registrado")
      onSaved()
    } catch (err) {
      // El mensaje del backend (400) se muestra tal cual
      const msg = err instanceof Error ? err.message : "Error al registrar el movimiento"
      setError(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const labelCls = "block text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5"
  const inputCls = "h-10 rounded-xl bg-input border-border text-foreground placeholder:text-muted-foreground focus-visible:border-gold/40 focus-visible:ring-gold/15 transition-all"

  return (
    <Dialog open={!!item} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-lg bg-card border-border rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-foreground">Registrar movimiento</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {item ? (
              <>
                {item.codigo ? <span className="font-mono">{item.codigo}</span> : null}
                {item.codigo ? " · " : ""}
                {item.nombre} — stock actual:{" "}
                <span className="text-foreground font-medium tabular-nums">
                  {nf.format(item.stock_actual ?? 0)} {item.unidad || ""}
                </span>
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="flex items-start gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        {/* ── Tipo de movimiento ── */}
        <div>
          <label className={labelCls}>Tipo de movimiento</label>
          <div className="grid grid-cols-3 gap-2">
            {TIPOS.map((t) => {
              const Icon = t.value === "ingreso" ? ArrowDownToLine : t.value === "egreso" ? ArrowUpFromLine : Equal
              const activo = tipo === t.value
              return (
                <button
                  key={t.value}
                  onClick={() => setTipo(t.value)}
                  className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                    activo
                      ? t.value === "ingreso"
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                        : t.value === "egreso"
                          ? "bg-red-500/10 border-red-500/30 text-red-400"
                          : "bg-blue-500/10 border-blue-500/30 text-blue-400"
                      : "bg-input border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {t.label}
                </button>
              )
            })}
          </div>
          {tipoInfo && (
            <p className="text-xs text-muted-foreground mt-1.5">{tipoInfo.descripcion}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>
              {tipo === "ajuste" ? "Nuevo stock (valor absoluto)" : "Cantidad"}
            </label>
            <Input
              autoFocus
              type="number"
              min="0"
              step="any"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              placeholder="0"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Motivo</label>
            <Select
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              aria-label="Motivo del movimiento"
              className={inputCls}
            >
              {MOTIVOS.map((m) => (
                <option key={m} value={m} className="bg-background">
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </option>
              ))}
            </Select>
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Lote (opcional)</label>
            <Input
              value={lote}
              onChange={(e) => setLote(e.target.value)}
              placeholder="L-2026-001"
              className={`${inputCls} font-mono`}
            />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Observaciones (opcional)</label>
            <textarea
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              rows={2}
              placeholder="Detalle del movimiento…"
              className="w-full px-3 py-2 rounded-xl bg-input border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-gold/40 focus:ring-2 focus:ring-gold/10 transition-all resize-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={saving}
            className="h-10 px-4 rounded-xl bg-muted/50 border-border text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={saving || !cantidad.trim()}
            className="h-10 px-4 rounded-xl bg-brand hover:bg-brand-strong text-white border border-brand gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Registrar movimiento
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
