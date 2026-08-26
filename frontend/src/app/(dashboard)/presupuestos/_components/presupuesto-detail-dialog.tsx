"use client"

import { useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { api } from "@/lib/api"
import type { EstadoPresupuesto, OrdenTrabajo } from "@/lib/api/types"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  ArrowRight, CheckCircle2, FileText, Loader2, Pencil, Printer,
} from "lucide-react"
import {
  ESTADO_PRESUPUESTO, estadoPresupuestoBadge, type PresupuestoRow,
} from "./presupuestos-table"

// ─── Helpers ───────────────────────────────────────────────────────────────

const fmtMoneda = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 })

const fmtFecha = (d?: string | null) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" }) : null

function Field({ label, value }: { label: string; value?: string | number | null }) {
  if (value == null || value === "") return null
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">{label}</p>
      <p className="text-sm text-foreground font-medium">{value}</p>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-brand dark:text-[#6b7aff]">{title}</span>
        <div className="flex-1 h-px bg-border/60" />
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 pl-0.5">
        {children}
      </div>
    </div>
  )
}

// ─── Dialog ────────────────────────────────────────────────────────────────

interface Props {
  presupuesto: PresupuestoRow | null
  onClose: () => void
  onEdit: (p: PresupuestoRow) => void
  onUpdated: (p: PresupuestoRow) => void
  /** Se llama después de una conversión exitosa para refrescar el listado */
  onConverted: () => void
}

export function PresupuestoDetailDialog({ presupuesto, onClose, onEdit, onUpdated, onConverted }: Props) {
  const [cambiandoEstado, setCambiandoEstado] = useState(false)
  const [confirmConvertirOpen, setConfirmConvertirOpen] = useState(false)
  const [error, setError] = useState("")
  const [ordenCreada, setOrdenCreada] = useState<OrdenTrabajo | null>(null)

  if (!presupuesto) return null

  const p = presupuesto
  const convertido = p.estado === "convertido"

  const handleEstadoChange = async (nuevo: EstadoPresupuesto) => {
    if (nuevo === p.estado) return
    setError("")
    setCambiandoEstado(true)
    try {
      const updated = await api.presupuestos.update(p.id, { estado: nuevo })
      onUpdated(updated as PresupuestoRow)
      toast.success("Estado actualizado")
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al cambiar el estado"
      setError(msg)
      toast.error(msg)
    } finally {
      setCambiandoEstado(false)
    }
  }

  /** Ejecutada como onConfirm de ConfirmDialog: no envolver en try/catch, dejar que lance. */
  const handleConvertir = async () => {
    const orden = await api.presupuestos.convertir(p.id) as unknown as OrdenTrabajo
    setOrdenCreada(orden)
    onUpdated({ ...p, estado: "convertido", orden_trabajo_id: orden.id })
    onConverted()
    toast.success(`Orden de trabajo ${orden.numero} creada`)
  }

  const handleClose = () => {
    setOrdenCreada(null)
    setError("")
    setConfirmConvertirOpen(false)
    onClose()
  }

  const items = p.items ?? []

  return (
    <>
    <Dialog open onOpenChange={(o) => { if (!o && !cambiandoEstado) handleClose() }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0">

        {/* ── Header ── */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border sticky top-0 bg-background z-10">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <span className="font-mono font-bold text-xl text-brand dark:text-[#6b7aff] tracking-wide">
                {p.numero}
              </span>
              {estadoPresupuestoBadge(p.estado)}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm" variant="outline"
                onClick={() => window.open(`/print/presupuestos/${p.id}`, "_blank")}
                className="gap-1.5 text-xs text-brand border-brand/30 hover:bg-brand/5 dark:text-[#6b7aff] dark:border-[#6b7aff]/30"
              >
                <Printer className="w-3.5 h-3.5" /> Imprimir
              </Button>
              {!convertido && (
                <Button size="sm" variant="outline" onClick={() => onEdit(p)} className="gap-1.5 text-xs">
                  <Pencil className="w-3.5 h-3.5" /> Editar
                </Button>
              )}
            </div>
          </div>
          <DialogTitle className="sr-only">Detalle del presupuesto {p.numero}</DialogTitle>
        </DialogHeader>

        <div className="px-6 py-5 space-y-6">

          {/* ── Orden creada (resultado de conversión) ── */}
          {ordenCreada && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-emerald-400">
                  Orden de trabajo {ordenCreada.numero} creada
                </p>
                <p className="text-muted-foreground mt-0.5">
                  El presupuesto quedó marcado como convertido.{" "}
                  <Link href="/ordenes" className="text-gold hover:underline font-medium inline-flex items-center gap-1">
                    Ver órdenes <ArrowRight className="w-3 h-3" />
                  </Link>
                </p>
              </div>
            </div>
          )}

          {/* ── Datos generales ── */}
          <Section title="Datos Generales">
            <Field
              label={p.cliente_id ? "Cliente" : "Prospecto"}
              value={p.cliente_nombre ?? p.prospecto_nombre ?? "—"}
            />
            <Field label="Fecha" value={fmtFecha(p.fecha)} />
            <Field label="Validez" value={p.validez_dias != null ? `${p.validez_dias} días` : null} />
            <Field label="Moneda" value={p.moneda} />
            <Field label="Condiciones de pago" value={p.condiciones_pago} />
            <Field label="Creado por" value={p.creador_nombre} />
          </Section>

          {/* ── Ítems ── */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-brand dark:text-[#6b7aff]">Ítems</span>
              <div className="flex-1 h-px bg-border/60" />
            </div>
            {items.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin ítems cargados.</p>
            ) : (
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 border-b border-border">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold text-muted-foreground uppercase">Descripción</th>
                      <th className="text-right px-3 py-2 font-semibold text-muted-foreground uppercase">Cantidad</th>
                      <th className="text-left px-3 py-2 font-semibold text-muted-foreground uppercase">Unidad</th>
                      <th className="text-right px-3 py-2 font-semibold text-muted-foreground uppercase">P. unitario</th>
                      <th className="text-right px-3 py-2 font-semibold text-muted-foreground uppercase">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {items.map((item) => (
                      <tr key={item.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-3 py-2 font-medium">{item.descripcion ?? "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {item.cantidad != null ? new Intl.NumberFormat("es-AR").format(item.cantidad) : "—"}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{item.unidad ?? "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {item.precio_unitario != null ? fmtMoneda.format(item.precio_unitario) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums">
                          {item.subtotal != null ? fmtMoneda.format(item.subtotal) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Totales ── */}
          <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-1.5 sm:max-w-xs sm:ml-auto">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium tabular-nums">
                {p.subtotal != null ? fmtMoneda.format(p.subtotal) : "—"}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                Desc. {p.descuento_porcentaje ?? 0}% · IVA {p.iva_porcentaje ?? 0}%
              </span>
              <span />
            </div>
            <div className="flex justify-between text-base border-t border-border pt-1.5">
              <span className="font-semibold">Total</span>
              <span className="font-bold tabular-nums text-gold">
                {p.total != null ? fmtMoneda.format(p.total) : "—"}
                {p.moneda && p.moneda !== "ARS" && (
                  <span className="text-[10px] text-muted-foreground ml-1">{p.moneda}</span>
                )}
              </span>
            </div>
          </div>

          {/* ── Observaciones ── */}
          {p.observaciones && (
            <Section title="Observaciones">
              <div className="col-span-2">
                <p className="text-sm text-foreground">{p.observaciones}</p>
              </div>
            </Section>
          )}

          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        {/* ── Footer: estado + conversión ── */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between gap-3 flex-wrap sticky bottom-0 bg-background">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Estado</span>
            <select
              value={p.estado}
              disabled={convertido || cambiandoEstado}
              onChange={(e) => handleEstadoChange(e.target.value as EstadoPresupuesto)}
              aria-label="Cambiar estado del presupuesto"
              className="h-9 px-3 pr-8 bg-background border border-input rounded-lg text-sm outline-none focus:ring-1 focus:ring-ring disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
            >
              {(Object.keys(ESTADO_PRESUPUESTO) as EstadoPresupuesto[])
                .filter((e) => e !== "convertido" || convertido)
                .map((e) => (
                  <option key={e} value={e}>{ESTADO_PRESUPUESTO[e].label}</option>
                ))}
            </select>
            {cambiandoEstado && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
          </div>

          {convertido ? (
            <Link
              href="/ordenes"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-gold hover:underline"
            >
              <FileText className="w-4 h-4" /> Ver orden de trabajo <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          ) : (
            <Button
              onClick={() => setConfirmConvertirOpen(true)}
              className="bg-brand hover:bg-brand-strong text-white gap-2"
            >
              <ArrowRight className="w-4 h-4" />
              Convertir a Orden de Trabajo
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>

    <ConfirmDialog
      open={confirmConvertirOpen}
      onOpenChange={setConfirmConvertirOpen}
      title={`Convertir ${p.numero} a orden de trabajo`}
      description="Esta acción no se puede deshacer: el presupuesto quedará bloqueado para edición y se creará una nueva orden de trabajo en borrador."
      confirmLabel="Convertir"
      variant="default"
      onConfirm={handleConvertir}
    />
    </>
  )
}
