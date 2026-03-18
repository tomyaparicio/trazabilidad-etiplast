"use client"

import type { EstadoOrden, OrdenTrabajo } from "@/lib/api/types"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { FileText, Pencil } from "lucide-react"

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
        <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#1a1866] dark:text-[#6b7aff]">{title}</span>
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
              <span className="font-mono font-bold text-xl text-[#1a1866] dark:text-[#6b7aff] tracking-wide">
                {orden.numero}
              </span>
              {estadoBadge(orden.estado)}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm" variant="outline"
                onClick={() => window.open(`/print/ordenes/${orden.id}`, "_blank")}
                className="gap-1.5 text-xs text-[#1a1866] border-[#1a1866]/30 hover:bg-[#1a1866]/5 dark:text-[#6b7aff] dark:border-[#6b7aff]/30"
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
          {(orden.impresion_frente || orden.impresion_observaciones || orden.impresion_cilindro != null || orden.operador_impresion || coloresActivos.length > 0) && (
            <Section title="Impresión">
              <Field label="Frente" value={orden.impresion_frente} />
              <Field label="Cilindro" value={orden.impresion_cilindro != null ? `${orden.impresion_cilindro} mm` : null} />
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
          {(orden.troquelado_ancho != null || orden.troquelado_alto != null || orden.troquelado_envase || orden.troquelado_maquina || orden.operador_troquelado || orden.troquelado_observaciones) && (
            <Section title="Troquelado">
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
