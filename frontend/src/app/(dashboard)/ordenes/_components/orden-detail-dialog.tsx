"use client"

import { useCallback, useEffect, useState } from "react"
import { api } from "@/lib/api"
import type { EstadoOrden, OrdenTrabajo, QcRegistro, ResultadoQc } from "@/lib/api/types"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Check, ChevronDown, ChevronRight, FileText, Loader2, Pencil, Plus, RotateCcw, X,
} from "lucide-react"
import { QcRegistroDialog } from "./qc-registro-dialog"

function estadoBadge(estado: EstadoOrden) {
  const map: Record<EstadoOrden, { label: string; className: string }> = {
    borrador:   { label: "Borrador",   className: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30" },
    pendiente:  { label: "Pendiente",  className: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
    en_proceso: { label: "En Proceso", className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
    completada: { label: "Completada", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
    cancelada:  { label: "Cancelada",  className: "bg-red-500/15 text-red-400 border-red-500/30" },
  }
  const s = map[estado] ?? { label: estado, className: "" }
  return (
    <Badge variant="outline" className={`text-[11px] px-2.5 py-0.5 font-semibold tracking-wide ${s.className}`}>
      {s.label}
    </Badge>
  )
}

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

function FullRow({ label, value }: { label: string; value?: string | number | null }) {
  if (value == null || value === "") return null
  return (
    <div className="col-span-2 space-y-0.5">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">{label}</p>
      <p className="text-sm text-foreground font-medium">{value}</p>
    </div>
  )
}

// ─── Control de calidad (registros QC) ───────────────────────────────────────

type QcRegistroExt = QcRegistro & {
  plantilla_nombre?: string | null
  usuario_nombre?: string | null
}

function resultadoBadge(resultado: ResultadoQc) {
  const map: Record<ResultadoQc, { label: string; className: string }> = {
    aprobado:  { label: "Aprobado",  className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
    rechazado: { label: "Rechazado", className: "bg-red-500/15 text-red-400 border-red-500/30" },
    observado: { label: "Observado", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  }
  const s = map[resultado] ?? { label: resultado, className: "" }
  return (
    <Badge variant="outline" className={`text-[11px] px-2 py-0.5 font-semibold ${s.className}`}>
      {s.label}
    </Badge>
  )
}

const QC_ETAPA_LABEL: Record<string, string> = {
  extrusion:  "Extrusión",
  impresion:  "Impresión",
  troquelado: "Troquelado",
}

function QcControlesSection({ ordenId, open }: { ordenId: number; open: boolean }) {
  const [registros, setRegistros] = useState<QcRegistroExt[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [expandido, setExpandido] = useState<number | null>(null)
  const [nuevoControl, setNuevoControl] = useState(false)

  const fetchRegistros = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const data = await api.calidad.registros(ordenId)
      setRegistros(data as QcRegistroExt[])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar controles")
    } finally {
      setLoading(false)
    }
  }, [ordenId])

  useEffect(() => {
    if (open) fetchRegistros()
  }, [open, fetchRegistros])

  const fmtFechaHora = (d?: string | null) =>
    d ? new Date(d).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-brand dark:text-[#6b7aff]">
          Control de Calidad
        </span>
        <div className="flex-1 h-px bg-border/60" />
        <Button
          size="sm" variant="outline"
          onClick={() => setNuevoControl(true)}
          className="gap-1.5 text-xs h-7"
        >
          <Plus className="w-3.5 h-3.5" /> Nuevo control
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="flex items-center gap-3 rounded-lg border border-dashed border-destructive/30 bg-destructive/5 px-3 py-2.5">
          <p className="text-sm text-red-400 flex-1">{error}</p>
          <Button
            size="sm" variant="outline"
            onClick={() => fetchRegistros()}
            className="gap-1.5 text-xs h-7 shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reintentar
          </Button>
        </div>
      ) : registros.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin controles registrados.</p>
      ) : (
        <div className="space-y-1.5">
          {registros.map((r) => {
            const abierto = expandido === r.id
            return (
              <div key={r.id} className="rounded-lg border border-border overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpandido(abierto ? null : r.id)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-accent/20 transition-colors"
                >
                  {abierto
                    ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                  <span className="text-xs text-muted-foreground font-medium shrink-0">
                    {fmtFechaHora(r.created_at)}
                  </span>
                  <span className="text-xs font-semibold shrink-0">
                    {QC_ETAPA_LABEL[r.etapa] ?? r.etapa}
                  </span>
                  {resultadoBadge(r.resultado)}
                  <span className="text-xs text-muted-foreground truncate ml-auto">
                    {r.usuario_nombre || r.user_email || "—"}
                  </span>
                </button>

                {abierto && (
                  <div className="px-3 pb-3 pt-1 border-t border-border/60 space-y-2">
                    {r.plantilla_nombre && (
                      <p className="text-[11px] text-muted-foreground">
                        Plantilla: <span className="font-medium text-foreground">{r.plantilla_nombre}</span>
                      </p>
                    )}
                    {r.items.length > 0 ? (
                      <div className="space-y-1">
                        {r.items.map((item) => (
                          <div key={item.id} className="flex items-start gap-2 text-xs">
                            {item.cumple
                              ? <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                              : <X className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />}
                            <div className="min-w-0">
                              <span className="font-medium">{item.item_descripcion}</span>
                              {item.valor && (
                                <span className="text-muted-foreground"> · {item.valor}</span>
                              )}
                              {item.observacion && (
                                <p className="text-muted-foreground">{item.observacion}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">Sin ítems de checklist.</p>
                    )}
                    {r.observaciones && (
                      <p className="text-xs text-muted-foreground border-t border-border/40 pt-2">
                        {r.observaciones}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {nuevoControl && (
        <QcRegistroDialog
          ordenId={ordenId}
          onClose={() => setNuevoControl(false)}
          onSaved={fetchRegistros}
        />
      )}
    </div>
  )
}

interface Props {
  orden: OrdenTrabajo
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: () => void
}

export function OrdenDetailDialog({ orden, open, onOpenChange, onEdit }: Props) {
  const coloresActivos = orden.impresion_colores?.filter(Boolean) ?? []

  const fmtFecha = (d?: string | null) =>
    d ? new Date(d + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" }) : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0">

        {/* Header */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border sticky top-0 bg-background z-10">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="font-mono font-bold text-xl text-brand dark:text-[#6b7aff] tracking-wide">
                {orden.numero}
              </span>
              {estadoBadge(orden.estado)}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm" variant="outline"
                onClick={() => window.open(`/print/ordenes/${orden.id}`, "_blank")}
                className="gap-1.5 text-xs text-brand border-brand/30 hover:bg-brand/5 dark:text-[#6b7aff] dark:border-[#6b7aff]/30"
              >
                <FileText className="w-3.5 h-3.5" /> Ver PDF
              </Button>
              <Button size="sm" variant="outline" onClick={onEdit} className="gap-1.5 text-xs">
                <Pencil className="w-3.5 h-3.5" /> Editar
              </Button>
            </div>
          </div>
          <DialogTitle className="sr-only">Detalle de {orden.numero}</DialogTitle>
        </DialogHeader>

        <div className="px-6 py-5 space-y-6">

          {/* Datos Generales */}
          <Section title="Datos Generales">
            <Field label="Cliente" value={
              orden.cliente_nombre
                ? (orden.cliente_numero != null ? `#${orden.cliente_numero} · ${orden.cliente_nombre}` : orden.cliente_nombre)
                : `#${orden.cliente_id}`
            } />
            <Field label="Fecha" value={fmtFecha(orden.fecha)} />
          </Section>

          {/* Extrusión */}
          <Section title="Extrusión">
            <Field label="Color" value={orden.extrusion_color} />
            <Field label="Tratamiento" value={orden.extrusion_trat} />
            <Field label="Micronaje" value={orden.extrusion_espesor != null ? `${orden.extrusion_espesor} µ` : "60 µ"} />
            <Field label="Ancho" value={orden.extrusion_ancho != null ? `${orden.extrusion_ancho} mm` : null} />
            <Field label="Formulación" value={orden.extrusion_formulacion} />
            <Field label="Cant. Bobinas" value={orden.extrusion_cant_bob} />
            <Field label="Máquina" value={orden.extrusion_maquina} />
            <Field label="Operador" value={orden.operador_extrusion} />
            <FullRow label="Observaciones" value={orden.extrusion_observaciones} />
            {orden.bobinas && orden.bobinas.length > 0 && (
              <div className="col-span-2">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 mb-2">Bobinas</p>
                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40 border-b border-border">
                      <tr>
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground uppercase">#</th>
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground uppercase">Metros</th>
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground uppercase">KG/Bob</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {orden.bobinas.map((b, i) => (
                        <tr key={b.id ?? i} className="hover:bg-muted/20 transition-colors">
                          <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                          <td className="px-3 py-2 font-medium">{b.metros ?? "—"}</td>
                          <td className="px-3 py-2 font-medium">{b.kg_bob ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Section>

          {/* Impresión */}
          {(orden.impresion_frente || orden.impresion_observaciones || orden.impresion_cilindro != null || orden.operador_impresion || orden.impresion_maquina || coloresActivos.length > 0) && (
            <Section title="Impresión">
              <Field label="Frente" value={orden.impresion_frente} />
              <Field label="Cilindro" value={orden.impresion_cilindro != null ? `${orden.impresion_cilindro} mm` : null} />
              <Field label="Máquina" value={orden.impresion_maquina} />
              <Field label="Operador" value={orden.operador_impresion} />
              <FullRow label="Observaciones" value={orden.impresion_observaciones} />
              {coloresActivos.length > 0 && (
                <div className="col-span-2 space-y-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">Colores</p>
                  <div className="flex flex-wrap gap-1.5">
                    {coloresActivos.map((c, i) => (
                      <span key={i} className="text-xs bg-muted border border-border rounded-md px-2 py-0.5 font-medium">
                        {i + 1}. {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </Section>
          )}

          {/* Troquelado */}
          {(orden.troquelado_cierre != null || orden.troquelado_ancho != null || orden.troquelado_alto != null || orden.troquelado_envase || orden.troquelado_maquina || orden.operador_troquelado || orden.troquelado_observaciones) && (
            <Section title="Troquelado">
              <Field label="Cierre" value={orden.troquelado_cierre != null ? String(orden.troquelado_cierre) : null} />
            {/* Las órdenes viejas tienen ancho y no cierre: el dato ya cargado
                se sigue mostrando en vez de desaparecer del historial. */}
            <Field label="Ancho" value={orden.troquelado_ancho != null ? `${orden.troquelado_ancho} mm` : null} />
              <Field label="Alto" value={orden.troquelado_alto != null ? `${orden.troquelado_alto} mm` : null} />
              <Field label="Envase" value={orden.troquelado_envase} />
              <Field label="Máquina" value={orden.troquelado_maquina} />
              <Field label="Operador" value={orden.operador_troquelado} />
              <FullRow label="Observaciones" value={orden.troquelado_observaciones} />
            </Section>
          )}

          {/* Control de Calidad */}
          {orden.control_calidad && (
            <Section title="Control de Calidad">
              <FullRow label="Observaciones" value={orden.control_calidad} />
            </Section>
          )}

          {/* Fechas por Etapa */}
          {(orden.fecha_diseno || orden.fecha_preprensa || orden.fecha_extrusion ||
            orden.fecha_impresion || orden.fecha_troquelado || orden.fecha_entrega) && (
            <Section title="Fechas por Etapa">
              {[
                ["Diseño",     orden.fecha_diseno],
                ["Preprensa",  orden.fecha_preprensa],
                ["Extrusión",  orden.fecha_extrusion],
                ["Impresión",  orden.fecha_impresion],
                ["Troquelado", orden.fecha_troquelado],
                ["Entrega",    orden.fecha_entrega],
              ].filter(([, v]) => v).map(([label, val]) => (
                <Field key={label as string} label={label as string} value={fmtFecha(val as string)} />
              ))}
            </Section>
          )}

          {/* Totales */}
          {(orden.cantidad != null || orden.total_final != null || orden.observaciones) && (
            <Section title="Totales">
              <Field label="Cantidad" value={orden.cantidad?.toLocaleString("es-AR")} />
              <Field label="Total Final" value={orden.total_final?.toLocaleString("es-AR", { style: "currency", currency: "ARS" })} />
              <FullRow label="Observaciones" value={orden.observaciones} />
            </Section>
          )}

          {/* Control de Calidad — registros QC */}
          <QcControlesSection ordenId={orden.id} open={open} />

          {/* Metadata */}
          <div className="text-[11px] text-muted-foreground/60 pt-3 border-t border-border/50 flex gap-4">
            {orden.created_at && <span>Creada: {new Date(orden.created_at).toLocaleString("es-AR")}</span>}
            {orden.updated_at && <span>Modificada: {new Date(orden.updated_at).toLocaleString("es-AR")}</span>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
