"use client"

/**
 * Fecha estimada de finalización y atraso proyectado (RF-13 · RF-14).
 *
 * Lo que se muestra es una ESTIMACIÓN y la pantalla lo dice: sobre este número
 * la oficina le contesta al cliente, así que tiene que quedar claro de dónde
 * sale (promedios de las órdenes ya cerradas) y cuándo no alcanza para estimar
 * (se muestra «sin datos», nunca una fecha inventada).
 *
 * Las órdenes vienen ya ordenadas por atraso del backend: lo que hay que mirar
 * primero queda arriba.
 */

import { AlertTriangle, CalendarClock } from "lucide-react"

import { fechaCorta } from "@/lib/fechas"
import type { ReporteEstimaciones } from "@/lib/api/types"

const ETIQUETA_ETAPA: Record<string, string> = {
  extrusion: "Extrusión",
  impresion: "Impresión",
  troquelado: "Troquelado",
}

function etiquetaEtapa(clave: string): string {
  return ETIQUETA_ETAPA[clave] ?? clave
}

/** El atraso, con el color del semáforo y el texto que lo explica. */
function Atraso({ dias }: { dias: number | null }) {
  if (dias == null) {
    return (
      <span className="text-[15px] font-semibold text-muted-foreground">
        Sin plazo pactado
      </span>
    )
  }
  if (dias === 0) {
    return (
      <span className="text-[15px] font-bold text-emerald-700 dark:text-emerald-400">
        En término
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[15px] font-bold text-amber-700 dark:text-amber-400">
      <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={2.5} />
      {dias} {dias === 1 ? "día tarde" : "días tarde"}
    </span>
  )
}

export function EstimacionesTabla({ datos }: { datos: ReporteEstimaciones }) {
  const etapas = Object.keys(datos.promedios_etapa)

  return (
    <div className="rounded-2xl border border-border bg-card/80 p-6">
      <div className="mb-5 flex items-center gap-3">
        <div className="rounded-xl border border-chart-2/20 bg-chart-2/10 p-2.5">
          <CalendarClock className="h-5 w-5 text-chart-2" strokeWidth={1.5} />
        </div>
        <div>
          <h2 className="text-[17px] font-bold text-foreground">
            Cuándo termina cada orden
          </h2>
          <p className="text-[14px] font-semibold text-muted-foreground">
            Estimado con los tiempos reales de las órdenes ya cerradas
          </p>
        </div>
      </div>

      {!datos.disponible ? (
        /* Sin órdenes cerradas no hay promedios, y sin promedios no hay
           estimación posible. Se dice por qué, no sólo que no hay datos: así
           el que mira sabe que esto se llena solo cuando la planta cierre
           órdenes con el QR. */
        <p className="rounded-xl border border-border bg-muted/30 px-5 py-4 text-[15px] font-semibold text-muted-foreground">
          Todavía no hay órdenes cerradas en el rango, así que no hay tiempos
          reales de los que sacar un promedio. La estimación aparece sola en
          cuanto se cierre la primera.
        </p>
      ) : (
        <>
          {/* Los promedios que alimentan la estimación, con su muestra. Van
              arriba y a la vista: una estimación cuyo origen no se puede ver
              es un número que nadie va a querer firmar frente al cliente. */}
          <div className="mb-5 flex flex-wrap gap-3">
            {etapas.map((e) => (
              <div
                key={e}
                className="rounded-xl border border-border bg-muted/30 px-4 py-2.5"
              >
                <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                  {etiquetaEtapa(e)}
                </p>
                <p className="text-[18px] font-bold tabular-nums text-foreground">
                  {datos.promedios_etapa[e]}{" "}
                  <span className="text-[14px] font-semibold text-muted-foreground">
                    {datos.promedios_etapa[e] === 1 ? "día" : "días"} ·{" "}
                    {datos.muestras_etapa[e] ?? 0}{" "}
                    {(datos.muestras_etapa[e] ?? 0) === 1 ? "medición" : "mediciones"}
                  </span>
                </p>
              </div>
            ))}
          </div>

          {datos.ordenes.length === 0 ? (
            <p className="rounded-xl border border-border bg-muted/30 px-5 py-4 text-[15px] font-semibold text-muted-foreground">
              No hay órdenes abiertas con escaneos en el rango.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b-2 border-border">
                    {["Orden", "Cliente", "Dónde está", "Falta", "Comprometida", "Estimada", "Atraso"].map((h) => (
                      <th
                        key={h}
                        className="whitespace-nowrap px-3 py-3 text-[13px] font-bold uppercase tracking-[0.08em] text-muted-foreground"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {datos.ordenes.map((o) => (
                    <tr key={o.id} className="border-b border-border/60">
                      <td className="whitespace-nowrap px-3 py-3 text-[16px] font-bold text-foreground">
                        {o.numero}
                      </td>
                      <td className="px-3 py-3 text-[15px] font-semibold text-foreground">
                        {o.cliente_nombre ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-[15px] font-semibold text-foreground">
                        {etiquetaEtapa(o.etapa_actual)}
                      </td>
                      <td className="px-3 py-3 text-[15px] font-semibold text-muted-foreground">
                        {o.etapas_faltantes.length === 0
                          ? "Nada: espera el cierre"
                          : o.etapas_faltantes.map(etiquetaEtapa).join(" · ")}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-[15px] font-semibold text-foreground">
                        {o.fecha_comprometida ? fechaCorta(o.fecha_comprometida) : "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-[16px] font-bold text-foreground">
                        {o.fecha_estimada ? (
                          fechaCorta(o.fecha_estimada)
                        ) : (
                          /* Falta el promedio de alguna etapa que esta orden
                             todavía tiene por delante. Decir «sin datos» es lo
                             honesto; poner una fecha igual sería inventarla. */
                          <span className="text-[15px] font-semibold text-muted-foreground">
                            Sin datos
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        <Atraso dias={o.atraso_proyectado_dias} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
