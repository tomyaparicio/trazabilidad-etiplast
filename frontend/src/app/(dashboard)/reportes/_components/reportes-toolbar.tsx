"use client"

import { Download } from "lucide-react"
import { Button } from "@/components/ui/button"

interface ReportesToolbarProps {
  desde: string
  hasta: string
  onDesde: (v: string) => void
  onHasta: (v: string) => void
  onExport: () => void
  exportDisabled?: boolean
}

/**
 * Barra de filtros: dos inputs de fecha (rango) + botón de exportar CSV.
 */
export function ReportesToolbar({
  desde, hasta, onDesde, onHasta, onExport, exportDisabled,
}: ReportesToolbarProps) {
  const inputCls =
    "h-10 rounded-xl border border-border bg-card/60 px-3 text-sm text-foreground " +
    "outline-none focus:border-[#1a1866] focus:ring-1 focus:ring-[#1a1866]/40 " +
    "[color-scheme:light] dark:[color-scheme:dark]"

  return (
    <div className="flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-border bg-card/60 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Desde
          </span>
          <input
            type="date"
            value={desde}
            max={hasta || undefined}
            onChange={(e) => onDesde(e.target.value)}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Hasta
          </span>
          <input
            type="date"
            value={hasta}
            min={desde || undefined}
            onChange={(e) => onHasta(e.target.value)}
            className={inputCls}
          />
        </label>
      </div>

      <Button
        onClick={onExport}
        disabled={exportDisabled}
        className="h-10 px-4 rounded-xl bg-[#1a1866] hover:bg-[#14115a] text-white border border-[#1a1866] text-sm font-medium gap-2 disabled:opacity-50"
      >
        <Download className="w-4 h-4" />
        Exportar CSV
      </Button>
    </div>
  )
}
