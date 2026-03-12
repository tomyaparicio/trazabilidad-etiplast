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
    borrador:   { label: "Borrador",   className: "bg-zinc-100 text-zinc-600 border-zinc-200" },
    pendiente:  { label: "Pendiente",  className: "bg-yellow-50 text-yellow-700 border-yellow-200" },
    en_proceso: { label: "En Proceso", className: "bg-blue-50 text-blue-700 border-blue-200" },
    completada: { label: "Completada", className: "bg-green-50 text-green-700 border-green-200" },
    cancelada:  { label: "Cancelada",  className: "bg-red-50 text-red-600 border-red-200" },
  }
  const s = map[estado] ?? { label: estado, className: "" }
  return (
    <Badge variant="outline" className={`text-[11px] px-2 py-0.5 font-medium ${s.className}`}>
      {s.label}
    </Badge>
  )
}

function Row({ label, value }: { label: string; value?: string | number | null }) {
  if (value == null || value === "") return null
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider w-36 shrink-0">{label}</span>
      <span className="text-sm text-foreground">{value}</span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-3">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#1a1866]">{title}</h3>
        <div className="flex-1 h-px bg-border" />
      </div>
      {children}
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pb-4 border-b border-border">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="font-mono font-bold text-lg text-[#1a1866] tracking-wide">
                {orden.numero}
              </span>
              {estadoBadge(orden.estado)}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm" variant="outline"
                onClick={() => window.open(`/print/ordenes/${orden.id}`, "_blank")}
                className="gap-1.5 text-xs text-[#1a1866] border-[#1a1866]/30 hover:bg-[#1a1866]/5"
              >
                <FileText className="w-3.5 h-3.5" /> Ver PDF
              </Button>
              <Button
                size="sm" variant="outline" onClick={onEdit}
                className="gap-1.5 text-xs"
              >
                <Pencil className="w-3.5 h-3.5" /> Editar
              </Button>
            </div>
          </div>
          <DialogTitle className="sr-only">Detalle de {orden.numero}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Generales */}
          <Section title="Datos Generales">
            <Row label="Cliente" value={
              orden.cliente_nombre
                ? (orden.cliente_numero != null ? `#${orden.cliente_numero} · ${orden.cliente_nombre}` : orden.cliente_nombre)
                : `#${orden.cliente_id}`
            } />
            <Row label="Fecha" value={orden.fecha
              ? new Date(orden.fecha + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" })
              : undefined}
            />
          </Section>

          {/* Extrusión */}
          <Section title="Extrusión">
            {orden.bobinas && orden.bobinas.length > 0 && (
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
                      <tr key={b.id ?? i}>
                        <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                        <td className="px-3 py-2">{b.metros ?? "—"}</td>
                        <td className="px-3 py-2">{b.kg_bob ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Row label="Ancho" value={orden.extrusion_ancho != null ? `${orden.extrusion_ancho} mm` : null} />
            <Row label="Color" value={orden.extrusion_color} />
            <Row label="Tratamiento" value={orden.extrusion_trat} />
            <Row label="Micronaje (µ)" value={orden.extrusion_espesor != null ? `${orden.extrusion_espesor} µ` : "60 µ"} />
            <Row label="Cant. Bobinas" value={orden.extrusion_cant_bob} />
            <Row label="Formulación" value={orden.extrusion_formulacion} />
            <Row label="Máquina" value={orden.extrusion_maquina} />
            <Row label="Operador" value={orden.operador_extrusion} />
            <Row label="Observaciones" value={orden.extrusion_observaciones} />
          </Section>

          {/* Impresión */}
          <Section title="Impresión">
            <Row label="Frente" value={orden.impresion_frente} />
            <Row label="Observación" value={orden.impresion_observaciones} />
            <Row label="Cilindro" value={orden.impresion_cilindro != null ? `${orden.impresion_cilindro} mm` : null} />
            <Row label="Operador" value={orden.operador_impresion} />
            {coloresActivos.length > 0 && (
              <div className="flex items-baseline gap-2">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider w-36 shrink-0">Colores</span>
                <div className="flex flex-wrap gap-1.5">
                  {coloresActivos.map((c, i) => (
                    <span key={i} className="text-xs bg-muted border border-border rounded-md px-2 py-0.5">
                      {i + 1}. {c}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Section>

          {/* Troquelado */}
          <Section title="Troquelado">
            <Row label="Ancho" value={orden.troquelado_ancho != null ? `${orden.troquelado_ancho} mm` : null} />
            <Row label="Alto" value={orden.troquelado_alto != null ? `${orden.troquelado_alto} mm` : null} />
            <Row label="Envase" value={orden.troquelado_envase} />
            <Row label="Máquina" value={orden.troquelado_maquina} />
            <Row label="Operador" value={orden.operador_troquelado} />
            <Row label="Observaciones" value={orden.troquelado_observaciones} />
          </Section>

          {/* Control de Calidad */}
          {orden.control_calidad && (
            <Section title="Control de Calidad">
              <Row label="Observaciones" value={orden.control_calidad} />
            </Section>
          )}

          {/* Fechas por Etapa */}
          {(orden.fecha_diseno || orden.fecha_preprensa || orden.fecha_extrusion ||
            orden.fecha_impresion || orden.fecha_troquelado || orden.fecha_entrega) && (
            <Section title="Fechas por Etapa">
              {[
                ["Diseño",      orden.fecha_diseno],
                ["Preprensa",   orden.fecha_preprensa],
                ["Extrusión",   orden.fecha_extrusion],
                ["Impresión",   orden.fecha_impresion],
                ["Troquelado",  orden.fecha_troquelado],
                ["Entrega",     orden.fecha_entrega],
              ].filter(([, v]) => v).map(([label, val]) => (
                <Row key={label as string} label={label as string}
                  value={new Date((val as string) + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" })} />
              ))}
            </Section>
          )}

          {/* Totales */}
          <Section title="Totales">
            <Row label="Cantidad" value={orden.cantidad?.toLocaleString("es-AR")} />
            <Row label="Total Final" value={orden.total_final?.toLocaleString("es-AR", { style: "currency", currency: "ARS" })} />
            <Row label="Observaciones" value={orden.observaciones} />
          </Section>

          {/* Metadata */}
          <div className="text-[11px] text-muted-foreground pt-2 border-t border-border space-y-0.5">
            {orden.created_at && <p>Creada: {new Date(orden.created_at).toLocaleString("es-AR")}</p>}
            {orden.updated_at && <p>Modificada: {new Date(orden.updated_at).toLocaleString("es-AR")}</p>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
