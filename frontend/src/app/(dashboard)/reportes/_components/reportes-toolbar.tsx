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
  /** true mientras se refetchean los datos del rango — bloquea edición para evitar carreras. */
  loading?: boolean
}

/**
 * Barra de filtros: dos inputs de fecha (rango) + botón de exportar CSV.
 */
export function ReportesToolbar({
  desde, hasta, onDesde, onHasta, onExport, exportDisabled, loading,
}: ReportesToolbarProps) {
  const inputCls =
    "h-10 rounded-xl border border-border bg-card/60 px-3 text-sm text-foreground " +
    "outline-none focus:border-brand focus:ring-1 focus:ring-brand/40 " +
    "disabled:opacity-50 disabled:cursor-not-allowed " +
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
            disabled={loading}
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
            disabled={loading}
            className={inputCls}
          />
        </label>
      </div>

      <Button
        onClick={onExport}
        disabled={exportDisabled || loading}
        className="h-10 px-4 rounded-xl bg-brand hover:bg-brand-strong text-white border border-brand text-sm font-medium gap-2 disabled:opacity-50"
      >
        <Download className="w-4 h-4" />
        Exportar CSV
      </Button>
    </div>
  )
}
