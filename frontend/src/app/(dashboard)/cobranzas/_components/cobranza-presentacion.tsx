/**
 * Cómo se muestra una cobranza: plata, fechas, medio y estado del cheque.
 *
 * Está suelto de los componentes a propósito: el panel de números, el listado y
 * el formulario tienen que decir lo MISMO con las mismas palabras y los mismos
 * colores. Si cada uno armara su badge, el día que un cheque se rechace la
 * pantalla podría mostrarlo de tres maneras distintas.
 */

import { Banknote, Landmark, Scroll } from "lucide-react"
import type { Cobranza, EstadoCheque, MedioCobranza } from "@/lib/api/types"

const nf = new Intl.NumberFormat("es-AR")

/** Plata redondeada a peso: en cobranzas los centavos son ruido visual. */
export const money = (v?: number | null) => "$ " + nf.format(Math.round(v ?? 0))
export const cantidad = (v?: number | null) => nf.format(v ?? 0)

export const fmtFecha = (f?: string | null) => {
  if (!f) return "—"
  const [y, m, d] = f.split("-").map(Number)
  if (!y || !m || !d) return "—"
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`
}

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]

/** «2026-12» → «dic 2026». El backend agrupa el calendario por mes. */
export const fmtMes = (mes: string) => {
  const [y, m] = mes.split("-").map(Number)
  if (!y || !m || m < 1 || m > 12) return mes
  return `${MESES_CORTOS[m - 1]} ${y}`
}

/** El cheque primero: es el medio con el que paga la mayoría de los clientes. */
export const MEDIOS: { valor: MedioCobranza; label: string }[] = [
  { valor: "cheque", label: "Cheque" },
  { valor: "transferencia", label: "Transferencia" },
  { valor: "efectivo", label: "Efectivo" },
]

export const ESTADOS_CHEQUE: { valor: EstadoCheque; label: string }[] = [
  { valor: "en_cartera", label: "En cartera" },
  { valor: "depositado", label: "Depositado" },
  { valor: "acreditado", label: "Acreditado" },
  { valor: "rechazado", label: "Rechazado" },
]

export const labelMedio = (m: MedioCobranza) => MEDIOS.find((x) => x.valor === m)?.label ?? m
export const labelEstado = (e: EstadoCheque) => ESTADOS_CHEQUE.find((x) => x.valor === e)?.label ?? e

const ICONO_MEDIO = {
  efectivo: Banknote,
  transferencia: Landmark,
  cheque: Scroll,
} as const

export function MedioEtiqueta({ medio }: { medio: MedioCobranza }) {
  const Icono = ICONO_MEDIO[medio] ?? Scroll
  return (
    <span className="inline-flex items-center gap-2 text-[15px] font-semibold text-foreground">
      <Icono className="size-[18px] shrink-0 text-muted-foreground" strokeWidth={1.9} />
      {labelMedio(medio)}
    </span>
  )
}

/**
 * Colores del recorrido del cheque, con el mismo significado que ya usa el
 * resto del ERP: verde = plata que YA entró, ámbar = todavía falta,
 * rojo = el problema. `depositado` es ámbar igual que `en_cartera` porque
 * depositar no es cobrar — el banco todavía puede rechazarlo.
 */
// Ojo con el tono del ámbar en tema claro: `amber-700` sobre `amber-500/15`
// mide 4,48:1 —por debajo del 4,5 de AA— y `amber-800` llega a 6,3:1. Medido,
// no estimado: el fondo compuesto real es #fff0d9, no blanco.
export const CLASE_ESTADO: Record<EstadoCheque, string> = {
  en_cartera: "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/35",
  depositado: "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/35",
  acreditado: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/35",
  rechazado: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/35",
}

/** ¿El importe de esta cobranza ya es plata en la cuenta? */
export const esPlata = (c: Cobranza) => c.medio !== "cheque" || c.cheque_estado === "acreditado"

/**
 * El color del importe, con el MISMO significado que el estado del cheque.
 *
 * Vive acá y no en cada vista porque el importe se dibuja en dos lugares —la
 * tabla del escritorio y la ficha del celular— y el día que los dos colores se
 * desfasen, la misma cobranza se vería «ya entró» en un lado y «falta» en el
 * otro.
 */
export const claseImporte = (c: Cobranza) =>
  c.cheque_estado === "rechazado"
    ? "text-red-700 line-through dark:text-red-300"
    : esPlata(c)
      ? "text-emerald-700 dark:text-emerald-300"
      : "text-amber-800 dark:text-amber-300"

/**
 * El N° de cheque y el banco, cada uno como dato suelto.
 *
 * Devuelve las partes en vez de un string armado para que quien lo dibuja
 * pueda dejar que la LÍNEA se parta sin partir ningún dato: el N° es un código
 * y no se corta nunca, el nombre del banco es prosa y puede envolver.
 */
export const datosCheque = (c: Cobranza) => ({
  numero: c.cheque_numero ? `N° ${c.cheque_numero}` : null,
  banco: c.cheque_banco || null,
})
