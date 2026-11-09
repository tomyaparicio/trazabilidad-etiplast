"use client"

/**
 * Esperas acumuladas y cuello de botella (RF-15).
 *
 * QUÉ MIDE, y la pantalla lo dice porque el nombre promete más de lo que el
 * dato da: el operario escanea al ENTRAR a su etapa, así que entre dos
 * escaneos hay una sola medición que contiene la cola y el trabajo de la
 * máquina juntos. Para encontrar el cuello alcanza —donde el trabajo se
 * acumula, se acumula igual por lentitud que por fila—, pero el reporte no
 * puede atribuir la causa, y entonces no la afirma.
 *
 * Agrupado por máquina sólo aparece impresión: es la única etapa que elige
 * máquina al escanear. En extrusión y troquelado son intercambiables.
 */

import { Hourglass } from "lucide-react"

import type { EsperaAgrupacion, EsperaFila, ReporteEsperas } from "@/lib/api/types"

/**
 * Rótulos de las etapas. La `etiqueta` que manda el backend sale de
 * `etapa.capitalize()` sobre la clave cruda, que da «Impresion» sin tilde: la
 * clave es un identificador, no un texto para mostrar. Al agrupar por máquina
 * o por mes la etiqueta del backend sí sirve —es el nombre de la máquina o el
 * mes— y se usa tal cual.
 */
const ETIQUETA_ETAPA: Record<string, string> = {
  extrusion: "Extrusión",
  impresion: "Impresión",
  troquelado: "Troquelado",
}

const AGRUPACIONES: { valor: EsperaAgrupacion; label: string }[] = [
  { valor: "etapa", label: "Por etapa" },
  { valor: "maquina", label: "Por máquina" },
  { valor: "mes", label: "Por mes" },
]

/** «1 día» y no «1 días»: el reporte lo lee gente, no un parser. */
function dias(n: number): string {
  return `${n} ${n === 1 ? "día" : "días"}`
}

export function EsperasTabla({
  datos,
  agrupar,
  onAgrupar,
}: {
  datos: ReporteEsperas
  agrupar: EsperaAgrupacion
  onAgrupar: (a: EsperaAgrupacion) => void
}) {
  const total = datos.filas.reduce((acc, f) => acc + f.dias_acumulados, 0)

  /** Agrupado por etapa manda el mapa local; en los otros casos, el backend. */
  const rotulo = (f?: EsperaFila) =>
    f == null ? "" : agrupar === "etapa" ? ETIQUETA_ETAPA[f.clave] ?? f.etiqueta : f.etiqueta

  return (
    <div className="rounded-2xl border border-border bg-card/80 p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-chart-3/20 bg-chart-3/10 p-2.5">
            <Hourglass className="h-5 w-5 text-chart-3" strokeWidth={1.5} />
          </div>
          <div>
            <h2 className="text-[17px] font-bold text-foreground">
              Dónde se acumula el trabajo
            </h2>
            <p className="text-[14px] font-semibold text-muted-foreground">
              Días que las órdenes pasaron en cada etapa, máquina o mes
            </p>
          </div>
        </div>

        <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-card/60 p-1">
          {AGRUPACIONES.map((a) => (
            <button
              key={a.valor}
              onClick={() => onAgrupar(a.valor)}
              className={`rounded-lg px-4 py-2 text-[14px] font-bold transition-colors ${
                agrupar === a.valor
                  ? "border border-gold/30 bg-gold/10 text-gold"
                  : "border border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {/* El cuello, dicho con palabras antes de la tabla: es la conclusión del
          reporte, y leerla no tendría que depender de comparar números a ojo. */}
      {datos.cuello && (
        <p className="mb-5 rounded-xl border-2 border-amber-600/40 bg-amber-500/10 px-5 py-4 text-[16px] font-bold text-foreground">
          El cuello de botella está en{" "}
          <span className="text-amber-700 dark:text-amber-400">
            {rotulo(datos.filas[0])}
          </span>
          : acumula {dias(datos.filas[0]?.dias_acumulados ?? 0)} de los{" "}
          {total.toFixed(1)} medidos en el rango.
        </p>
      )}

      {datos.filas.length === 0 ? (
        <p className="rounded-xl border border-border bg-muted/30 px-5 py-4 text-[15px] font-semibold text-muted-foreground">
          No hay escaneos consecutivos en el rango: una etapa se mide entre su
          escaneo y el siguiente, así que hacen falta al menos dos.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b-2 border-border">
                {[
                  agrupar === "mes" ? "Mes" : agrupar === "maquina" ? "Máquina" : "Etapa",
                  "Días acumulados",
                  "Promedio por orden",
                  "Pases medidos",
                ].map((h) => (
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
              {datos.filas.map((f) => {
                const esCuello = datos.cuello === f.clave
                return (
                  <tr
                    key={f.clave}
                    className={`border-b border-border/60 ${esCuello ? "bg-amber-500/5" : ""}`}
                  >
                    <td className="px-3 py-3 text-[16px] font-bold text-foreground">
                      {rotulo(f)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-[16px] font-bold tabular-nums text-foreground">
                      {f.dias_acumulados}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-[15px] font-semibold tabular-nums text-foreground">
                      {f.dias_promedio ?? "—"}
                    </td>
                    {/* El denominador del promedio: con un solo pase medido, un
                        promedio no describe nada todavía. */}
                    <td className="whitespace-nowrap px-3 py-3 text-[15px] font-semibold tabular-nums text-muted-foreground">
                      {f.pases}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-5 text-[14px] font-semibold leading-relaxed text-muted-foreground">
        Se mide el tiempo que la orden pasó en cada etapa, entre su escaneo y el
        siguiente. Eso incluye la espera en cola y el trabajo de la máquina
        juntos: con un escaneo por etapa no se pueden separar, así que el
        reporte muestra dónde se acumula el trabajo, no por qué.
        {agrupar === "maquina" && (
          <>
            {" "}
            Agrupado por máquina aparece sólo impresión, la única etapa que
            elige máquina al escanear.
          </>
        )}
      </p>
    </div>
  )
}
