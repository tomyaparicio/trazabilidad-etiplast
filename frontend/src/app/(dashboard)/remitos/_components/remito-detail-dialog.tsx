"use client"

import { useState } from "react"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Loader2, Pencil, Printer, Send, PackageCheck, AlertTriangle } from "lucide-react"
import { estadoRemitoBadge, type RemitoX } from "./remitos-table"

interface Props {
  remito: RemitoX
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: () => void
  onChanged: (remito: RemitoX) => void
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</span>
      <span className="text-sm text-foreground">{value ?? "—"}</span>
    </div>
  )
}

export function RemitoDetailDialog({ remito, open, onOpenChange, onEdit, onChanged }: Props) {
  const [working, setWorking] = useState(false)
  const [error, setError] = useState("")
  const [warnings, setWarnings] = useState<string[]>([])

  const handleDespachar = async () => {
    if (!confirm(`¿Despachar el remito ${remito.numero}? Se registrarán los egresos de stock vinculados.`)) return
    setWorking(true); setError(""); setWarnings([])
    try {
      const res = (await api.remitos.despachar(remito.id)) as RemitoX
      setWarnings(res.warnings ?? [])
      onChanged(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al despachar")
    } finally {
      setWorking(false)
    }
  }

  const handleEntregado = async () => {
    if (!confirm(`¿Marcar el remito ${remito.numero} como entregado?`)) return
    setWorking(true); setError("")
    try {
      const res = (await api.remitos.update(remito.id, { estado: "entregado" })) as RemitoX
      onChanged(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al actualizar")
    } finally {
      setWorking(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">

        {/* ── Header ── */}
        <div className="px-6 pt-5 pb-4 border-b border-border shrink-0 flex items-center justify-between gap-3">
          <DialogTitle className="text-base font-semibold flex items-center gap-3">
            <span className="font-mono text-gold">{remito.numero}</span>
            {estadoRemitoBadge(remito.estado)}
          </DialogTitle>
          {remito.estado === "pendiente" && (
            <Button variant="outline" size="sm" onClick={onEdit} className="gap-1.5 h-8">
              <Pencil className="w-3.5 h-3.5" /> Editar
            </Button>
          )}
        </div>

        {/* ── Content ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <InfoRow label="Cliente" value={remito.cliente_nombre ?? `Cliente #${remito.cliente_id}`} />
            <InfoRow
              label="Fecha"
              value={remito.fecha ? new Date(remito.fecha + "T00:00:00").toLocaleDateString("es-AR") : "—"}
            />
            <InfoRow label="Transporte" value={remito.transporte} />
            <InfoRow label="Domicilio de entrega" value={remito.domicilio_entrega} />
            <InfoRow label="Creado por" value={remito.creador_nombre} />
          </div>

          {remito.observaciones && (
            <InfoRow label="Observaciones" value={remito.observaciones} />
          )}

          {/* ── Ítems ── */}
          <div>
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
              Ítems ({remito.items.length})
            </span>
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b border-border">
                  <tr>
                    <th className="text-left px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase">OT</th>
                    <th className="text-left px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase">Descripción</th>
                    <th className="text-right px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase">Cantidad</th>
                    <th className="text-left px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase">Lote</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {remito.items.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-xs text-muted-foreground">
                        Sin ítems
                      </td>
                    </tr>
                  ) : remito.items.map((item) => (
                    <tr key={item.id}>
                      <td className="px-3 py-2 font-mono text-xs text-gold">
                        {item.orden_numero ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-xs">{item.descripcion ?? "—"}</td>
                      <td className="px-3 py-2 text-xs text-right">
                        {item.cantidad != null
                          ? `${item.cantidad.toLocaleString("es-AR")} ${item.unidad ?? ""}`.trim()
                          : "—"}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{item.lote ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Warnings de stock al despachar ── */}
          {warnings.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-4 py-3 space-y-1.5">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> Despachado con advertencias de stock
              </p>
              {warnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-700 dark:text-amber-400">• {w}</p>
              ))}
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-4 py-2">{error}</p>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-4 border-t border-border shrink-0 flex items-center justify-between gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={() => window.open(`/print/remitos/${remito.id}`, "_blank")}
            className="gap-2"
          >
            <Printer className="w-4 h-4" /> Imprimir
          </Button>

          <div className="flex items-center gap-2">
            {remito.estado === "pendiente" && (
              <Button onClick={handleDespachar} disabled={working}
                className="bg-[#1a1866] hover:bg-[#14115a] text-white gap-2">
                {working ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Despachar
              </Button>
            )}
            {remito.estado === "despachado" && (
              <Button onClick={handleEntregado} disabled={working}
                className="bg-green-700 hover:bg-green-800 text-white gap-2">
                {working ? <Loader2 className="w-4 h-4 animate-spin" /> : <PackageCheck className="w-4 h-4" />}
                Marcar entregado
              </Button>
            )}
          </div>
        </div>

      </DialogContent>
    </Dialog>
  )
}
