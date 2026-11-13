"use client"

/**
 * Las fichas de las órdenes que el tablero está mostrando, para el pasado de
 * cada fila.
 *
 * `useTablero()` contesta dónde está cada orden AHORA pero no por dónde pasó
 * (ver `recorrido-ordenes.ts`). Ese pasado está en la ficha de la orden, que se
 * pide por `GET /ordenes`.
 *
 * ── La regla que este hook existe para no romper ─────────────────────────────
 *
 * El tablero late cada 3 s contra `GET /produccion/version`, que es una
 * consulta barata hecha para eso. `GET /ordenes` NO lo es: trae las órdenes
 * completas con sus relaciones. Pedirla cada 3 s sería multiplicar por cinco el
 * costo del refresco en vivo para un dato que casi nunca cambia —las fechas de
 * las etapas que ya pasaron son historia, no se mueven—.
 *
 * Así que no se engancha al reloj: se engancha al CONTENIDO. De `pasos` se
 * calcula una firma (qué orden está en qué paso, desde cuándo y si está en
 * máquina) y las fichas se vuelven a pedir sólo cuando esa firma cambia, o sea
 * cuando la planta de verdad se movió. El refresco ciego de 15 s del tablero no
 * dispara nada si nada cambió, y el sondeo de versión tampoco.
 *
 * Consecuencia conocida y aceptada: si alguien edita a mano una `fecha_*` desde
 * Órdenes de Trabajo sin que la planta se mueva, la firma no cambia y la celda
 * del pasado queda vieja hasta el próximo movimiento. Para eso el botón
 * «Actualizar» llama también a `refrescarRecorrido()`.
 *
 * Store de módulo + `useSyncExternalStore`, igual que `use-tablero.ts`: es la
 * forma que React tiene de leer de una fuente externa y evita el `setState`
 * dentro del efecto que marca el lint del repo.
 */
import { api } from "@/lib/api"
import type { OrdenTrabajo, PasoTablero } from "@/lib/api/types"
import { useEffect, useMemo, useSyncExternalStore } from "react"

/**
 * Cuántas fichas se piden.
 *
 * `GET /ordenes` acepta hasta 100 por página y el tablero muestra como máximo
 * 20 órdenes por paso, o sea 100 filas. Una sola página alcanza para el caso
 * normal; las dos listas se ordenan distinto (el tablero por movimiento, las
 * órdenes por id), así que con el tablero lleno puede quedar alguna fila sin
 * ficha. Esa fila se dibuja igual, con las celdas del pasado en «pasó, sin
 * fecha» (ver `delPasado`): se pierde el detalle, nunca la orden.
 */
const TOPE_FICHAS = 100

export type EstadoRecorrido = {
  /** Las fichas por id. Vacío mientras no contestó nunca. */
  fichas: Map<number, OrdenTrabajo>
  /** El último pedido de fichas falló: la posición actual se sigue viendo */
  falló: boolean
}

const VACIO: EstadoRecorrido = { fichas: new Map(), falló: false }

/** Se reemplaza entera en cada cambio: `useSyncExternalStore` compara por identidad. */
let foto: EstadoRecorrido = VACIO

const oyentes = new Set<() => void>()
/** La firma de los datos con los que se trajeron las fichas que hay en `foto` */
let firmaTraida: string | null = null
/** La última firma que pidió un componente, para que «Actualizar» sepa qué repetir */
let firmaVista = ""
let enVuelo = false
/** Hay que repetir el pedido al terminar el que está en vuelo */
let pendiente: string | null = null

function avisar() {
  for (const oyente of oyentes) oyente()
}

/**
 * Qué está mostrando el tablero, resumido en un string.
 *
 * Entran el id, el paso, si está en máquina y desde cuándo: los cuatro datos
 * que cambian cuando alguien escanea o cuando una orden cambia de estado. No
 * entra nada de `resumen` ni de `stock` —un movimiento de depósito no toca el
 * recorrido de ninguna orden— ni el tope de cada paso.
 */
function firmaDe(pasos: PasoTablero[]): string {
  const partes: string[] = []
  for (const p of pasos) {
    for (const o of p.ordenes) {
      partes.push(`${o.id}@${p.clave}:${o.en_maquina ? 1 : 0}:${o.desde ?? ""}`)
    }
  }
  return partes.join("|")
}

async function traer(firma: string) {
  if (enVuelo) {
    pendiente = firma
    return
  }
  enVuelo = true
  try {
    const r = await api.ordenes.list({ page: 1, per_page: TOPE_FICHAS })
    const fichas = new Map<number, OrdenTrabajo>()
    for (const o of r.data ?? []) fichas.set(o.id, o)
    firmaTraida = firma
    foto = { fichas, falló: false }
  } catch {
    // Se conservan las fichas que ya había: con la tabla dibujada, perder el
    // pasado de todas las filas por un pedido que falló es peor que mostrarlo
    // un rato viejo. `firmaTraida` NO se anota, así que el próximo cambio en la
    // planta vuelve a intentar.
    foto = { ...foto, falló: true }
  } finally {
    enVuelo = false
    avisar()
    if (pendiente !== null) {
      const siguiente = pendiente
      pendiente = null
      if (siguiente !== firmaTraida) traer(siguiente)
    }
  }
}

function asegurar(firma: string) {
  firmaVista = firma
  // Sin órdenes en el tablero no hay nada que completar.
  if (firma === "") return
  if (firma === firmaTraida) return
  traer(firma)
}

function suscribir(avisarA: () => void) {
  oyentes.add(avisarA)
  return () => {
    oyentes.delete(avisarA)
  }
}

const leer = () => foto

/**
 * Vuelve a pedir las fichas aunque la planta no se haya movido.
 *
 * Para el botón «Actualizar»: cubre la edición a mano de una `fecha_*` desde
 * Órdenes de Trabajo, que no cambia la firma del tablero.
 */
export function refrescarRecorrido() {
  firmaTraida = null
  if (firmaVista !== "") traer(firmaVista)
}

/**
 * Las fichas de las órdenes que están en `pasos`.
 *
 * Se le pasa `pasos` y no se lee el tablero de adentro a propósito: así el
 * componente mantiene UNA sola foto —la de `useTablero()`— y este hook no
 * puede quedar mirando un instante distinto de la planta.
 */
export function useRecorrido(pasos: PasoTablero[]): EstadoRecorrido {
  const firma = useMemo(() => firmaDe(pasos), [pasos])
  const estado = useSyncExternalStore(suscribir, leer, leer)

  useEffect(() => {
    asegurar(firma)
  }, [firma])

  return estado
}
