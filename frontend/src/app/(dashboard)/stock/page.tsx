"use client"

import { useCallback, useEffect, useState } from "react"
import { api } from "@/lib/api"
import type { StockItem, TipoStockItem } from "@/lib/api/types"
import { Button } from "@/components/ui/button"
import { Boxes, Plus, AlertTriangle } from "lucide-react"
import { StockTable } from "./_components/stock-table"
import { StockItemDialog } from "./_components/stock-item-dialog"

const TABS: { value: TipoStockItem; label: string }[] = [
  { value: "materia_prima",      label: "Materias primas" },
  { value: "producto_terminado", label: "Producto terminado" },
  { value: "insumo",             label: "Insumos" },
]

export default function StockPage() {
  const [tab, setTab] = useState<TipoStockItem>("materia_prima")
  const [alertas, setAlertas] = useState<StockItem[]>([])
  const [nuevoOpen, setNuevoOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const cargarAlertas = useCallback(() => {
    api.stock.alertas().then(setAlertas).catch(() => {})
  }, [])

  useEffect(() => {
    cargarAlertas()
  }, [cargarAlertas, refreshKey])

  const handleChanged = useCallback(() => setRefreshKey((k) => k + 1), [])

  return (
    <div className="p-6 lg:p-8 space-y-5 max-w-[1200px] mx-auto">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-1 h-6 rounded-full bg-[#1a1866]" />
          <div>
            <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
              <Boxes className="w-5 h-5 text-[#1a1866]" />
              Stock
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Materias primas, producto terminado e insumos
            </p>
          </div>
        </div>
        <Button
          onClick={() => setNuevoOpen(true)}
          className="h-10 px-4 rounded-xl bg-[#1a1866] hover:bg-[#14115a] text-white border border-[#1a1866] text-sm font-medium gap-2 shrink-0"
        >
          <Plus className="w-4 h-4" />
          Nuevo ítem
        </Button>
      </div>

      {/* ── Banner de alertas de stock bajo mínimo ── */}
      {alertas.length > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-3.5">
          <AlertTriangle className="w-4.5 h-4.5 text-amber-400 shrink-0" />
          <p className="text-sm text-amber-300">
            <span className="font-semibold">
              {alertas.length} {alertas.length === 1 ? "ítem" : "ítems"} bajo stock mínimo
            </span>
            <span className="text-amber-300/70">
              {" — "}
              {alertas.slice(0, 4).map((a) => a.codigo || a.nombre).join(", ")}
              {alertas.length > 4 ? "…" : ""}
            </span>
          </p>
        </div>
      )}

      {/* ── Tabs por tipo ── */}
      <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-card/60 p-1">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.value
                ? "bg-gold/10 text-gold border border-gold/30"
                : "text-muted-foreground hover:text-foreground border border-transparent"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tabla ── */}
      <StockTable tipo={tab} refreshKey={refreshKey} onChanged={handleChanged} />

      {/* ── Dialog: nuevo ítem ── */}
      <StockItemDialog
        open={nuevoOpen}
        item={null}
        tipoInicial={tab}
        onClose={() => setNuevoOpen(false)}
        onSaved={() => {
          setNuevoOpen(false)
          handleChanged()
        }}
      />
    </div>
  )
}
