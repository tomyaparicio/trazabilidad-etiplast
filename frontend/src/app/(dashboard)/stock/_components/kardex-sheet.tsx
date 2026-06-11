"use client"

import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import type { StockItem, StockMovimiento, TipoStockMovimiento } from "@/lib/api/types"
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight, History, MoveRight, User } from "lucide-react"

/** El backend devuelve usuario_nombre en el to_dict aunque el tipo no lo declare */
type MovimientoConUsuario = StockMovimiento & { usuario_nombre?: string | null }

const TIPO_BADGE: Record<TipoStockMovimiento, { label: string; cls: string }> = {
  ingreso: { label: "Ingreso", cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  egreso:  { label: "Egreso",  cls: "bg-red-500/10 text-red-400 border-red-500/20" },
  ajuste:  { label: "Ajuste",  cls: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
}

interface KardexSheetProps {
  item: StockItem | null
  onClose: () => void
}

export function KardexSheet({ item, onClose }: KardexSheetProps) {
  const [movimientos, setMovimientos] = useState<MovimientoConUsuario[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  const perPage = 20
  const totalPages = Math.ceil(total / perPage)
  const nf = new Intl.NumberFormat("es-AR")

  useEffect(() => {
    setPage(1)
  }, [item?.id])

  useEffect(() => {
    if (!item) return
    let cancelado = false
    setLoading(true)
    api.stock.movimientos(item.id, { page, per_page: perPage })
      .then((res) => {
        if (cancelado) return
        setMovimientos((res.data as MovimientoConUsuario[]) || [])
        setTotal(res.total || 0)
      })
      .catch(console.error)
      .finally(() => { if (!cancelado) setLoading(false) })
    return () => { cancelado = true }
  }, [item, page])

  const formatFecha = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString("es-AR", {
          day: "2-digit", month: "2-digit", year: "numeric",
          hour: "2-digit", minute: "2-digit",
        })
      : "—"

  return (
    <Sheet open={!!item} onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent side="right" className="w-full sm:max-w-xl bg-card border-border gap-0">
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle className="flex items-center gap-2 text-foreground">
            <History className="w-4.5 h-4.5 text-gold" />
            Kardex
          </SheetTitle>
          <SheetDescription className="text-muted-foreground">
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
          </SheetDescription>
        </SheetHeader>

        {/* ── Historial ── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border/50 bg-muted/20 p-4 space-y-2">
                <div className="h-3 w-32 rounded-full bg-muted animate-pulse" />
                <div className="h-3 w-48 rounded-full bg-muted animate-pulse" />
              </div>
            ))
          ) : movimientos.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="rounded-2xl bg-muted/50 border border-border p-5">
                <History className="w-8 h-8 text-muted-foreground" strokeWidth={1.5} />
              </div>
              <p className="text-sm font-medium text-muted-foreground">Sin movimientos</p>
              <p className="text-xs text-muted-foreground">Este ítem todavía no registra movimientos de stock</p>
            </div>
          ) : (
            movimientos.map((m) => {
              const badge = TIPO_BADGE[m.tipo] ?? TIPO_BADGE.ajuste
              return (
                <div key={m.id} className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-2">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2.5">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-[11px] font-medium border ${badge.cls}`}>
                        {badge.label}
                      </span>
                      <span className="text-sm font-semibold text-foreground tabular-nums">
                        {nf.format(m.cantidad ?? 0)} {item?.unidad || ""}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {formatFecha(m.created_at)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="tabular-nums">{nf.format(m.stock_anterior ?? 0)}</span>
                    <MoveRight className="w-3.5 h-3.5 shrink-0" />
                    <span className="tabular-nums text-foreground font-medium">
                      {nf.format(m.stock_resultante ?? 0)}
                    </span>
                    {m.motivo && (
                      <>
                        <span className="text-border">·</span>
                        <span>{m.motivo}</span>
                      </>
                    )}
                    {m.lote && (
                      <>
                        <span className="text-border">·</span>
                        <span className="font-mono">{m.lote}</span>
                      </>
                    )}
                  </div>
                  {m.usuario_nombre && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <User className="w-3 h-3 shrink-0" />
                      {m.usuario_nombre}
                    </div>
                  )}
                  {m.observaciones && (
                    <p className="text-xs text-muted-foreground/80 italic">{m.observaciones}</p>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* ── Paginación ── */}
        {totalPages > 1 && (
          <nav className="flex items-center justify-between border-t border-border px-5 py-3.5" aria-label="Paginación del kardex">
            <p className="text-xs text-muted-foreground tabular-nums">
              Página {page} de {totalPages} · {nf.format(total)} movimientos
            </p>
            <div className="flex gap-1.5">
              <Button variant="outline" size="icon"
                className="h-8 w-8 bg-muted/50 border-border text-muted-foreground hover:bg-muted hover:text-foreground rounded-lg"
                onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1 || loading} aria-label="Página anterior"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              <Button variant="outline" size="icon"
                className="h-8 w-8 bg-muted/50 border-border text-muted-foreground hover:bg-muted hover:text-foreground rounded-lg"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages || loading} aria-label="Página siguiente"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </nav>
        )}
      </SheetContent>
    </Sheet>
  )
}
