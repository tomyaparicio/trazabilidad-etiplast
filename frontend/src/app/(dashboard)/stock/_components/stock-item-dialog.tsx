"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import type { StockItem, TipoStockItem } from "@/lib/api/types"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AlertCircle, Loader2 } from "lucide-react"

const TIPOS: { value: TipoStockItem; label: string }[] = [
  { value: "materia_prima",      label: "Materia prima" },
  { value: "producto_terminado", label: "Producto terminado" },
  { value: "insumo",             label: "Insumo" },
]

interface StockItemDialogProps {
  open: boolean
  /** null → crear; con valor → editar */
  item: StockItem | null
  /** Tipo preseleccionado al crear (tab activa) */
  tipoInicial?: TipoStockItem
  onClose: () => void
  onSaved: () => void
}

export function StockItemDialog({ open, item, tipoInicial, onClose, onSaved }: StockItemDialogProps) {
  const editando = !!item

  const [codigo, setCodigo] = useState("")
  const [nombre, setNombre] = useState("")
  const [tipo, setTipo] = useState<TipoStockItem>("materia_prima")
  const [categoria, setCategoria] = useState("")
  const [unidad, setUnidad] = useState("kg")
  const [stockMinimo, setStockMinimo] = useState("")
  const [stockInicial, setStockInicial] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setSaving(false)
    if (item) {
      setCodigo(item.codigo || "")
      setNombre(item.nombre || "")
      setTipo(item.tipo)
      setCategoria(item.categoria || "")
      setUnidad(item.unidad || "kg")
      setStockMinimo(item.stock_minimo != null ? String(item.stock_minimo) : "")
      setStockInicial("")
    } else {
      setCodigo("")
      setNombre("")
      setTipo(tipoInicial || "materia_prima")
      setCategoria("")
      setUnidad("kg")
      setStockMinimo("")
      setStockInicial("")
    }
  }, [open, item, tipoInicial])

  const handleSubmit = async () => {
    if (!nombre.trim()) {
      setError("El nombre es obligatorio")
      return
    }
    setSaving(true)
    setError(null)
    try {
      const payload = {
        codigo: codigo.trim() || undefined,
        nombre: nombre.trim(),
        tipo,
        categoria: categoria.trim() || undefined,
        unidad: unidad.trim() || "kg",
        stock_minimo: stockMinimo !== "" ? Number(stockMinimo) : 0,
      }
      if (editando && item) {
        await api.stock.update(item.id, payload)
      } else {
        // El stock inicial NO se setea directo: se registra como movimiento
        const creado = await api.stock.create({ ...payload, stock_actual: 0 })
        const inicial = Number(stockInicial)
        if (inicial > 0) {
          await api.stock.crearMovimiento(creado.id, {
            stock_item_id: creado.id,
            tipo: "ingreso",
            cantidad: inicial,
            motivo: "stock inicial",
          })
        }
      }
      toast.success(editando ? "Ítem actualizado" : "Ítem creado")
      onSaved()
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al guardar el ítem"
      setError(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const labelCls = "block text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5"
  const inputCls = "h-10 rounded-xl bg-input border-border text-foreground placeholder:text-muted-foreground focus-visible:border-gold/40 focus-visible:ring-gold/15 transition-all"
  const selectCls = "h-10 w-full px-3 bg-input border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-gold/40 focus:ring-2 focus:ring-gold/10 transition-all cursor-pointer appearance-none"

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-lg bg-card border-border rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            {editando ? "Editar ítem de stock" : "Nuevo ítem de stock"}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {editando
              ? "El stock actual no se edita acá: usá un movimiento."
              : "Completá los datos del ítem. Si cargás stock inicial, se registra como ingreso."}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="flex items-start gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Código</label>
            <Input
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              placeholder="MP-001"
              className={`${inputCls} font-mono`}
            />
          </div>
          <div>
            <label className={labelCls}>Tipo</label>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoStockItem)}
              disabled={editando}
              aria-label="Tipo de ítem"
              className={`${selectCls} ${editando ? "opacity-60 cursor-not-allowed" : ""}`}
            >
              {TIPOS.map((t) => (
                <option key={t.value} value={t.value} className="bg-background">{t.label}</option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Nombre *</label>
            <Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Polietileno de baja densidad"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Categoría</label>
            <Input
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              placeholder="Polietileno"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Unidad</label>
            <Input
              value={unidad}
              onChange={(e) => setUnidad(e.target.value)}
              placeholder="kg"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Stock mínimo</label>
            <Input
              type="number"
              min="0"
              step="any"
              value={stockMinimo}
              onChange={(e) => setStockMinimo(e.target.value)}
              placeholder="0"
              className={inputCls}
            />
          </div>
          {!editando && (
            <div>
              <label className={labelCls}>Stock inicial</label>
              <Input
                type="number"
                min="0"
                step="any"
                value={stockInicial}
                onChange={(e) => setStockInicial(e.target.value)}
                placeholder="0"
                className={inputCls}
              />
            </div>
          )}
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
            disabled={saving}
            className="h-10 px-4 rounded-xl bg-[#1a1866] hover:bg-[#14115a] text-white border border-[#1a1866] gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {editando ? "Guardar cambios" : "Crear ítem"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
