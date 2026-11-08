"use client"

/**
 * El tablero de planta, traído UNA sola vez para todos los que lo miran.
 *
 * Por qué existe: en la pestaña «Producción» del dashboard se dibujan juntos
 * `OrdenesPorEtapa` y `PlantaEnVivo`, y cada uno tenía su propio `setInterval`
 * de 15 s contra el MISMO `GET /api/produccion/tablero`. Eso eran 8 pedidos por
 * minuto —contra un rate limit de 120/min por IP— y, peor, el cold start de
 * Railway se pagaba dos veces: los dos bloques podían quedar mostrando
 * instantes distintos de la misma planta.
 *
 * Elegí un store compartido en el módulo en vez de subir el fetch al `page.tsx`
 * y pasar `datos` por props porque los dos bloques son autónomos: se usan en
 * una pestaña que el dashboard monta y desmonta, y uno de los dos se esconde
 * solo cuando la API falla. Con props, `page.tsx` tendría que cargar el estado,
 * el intervalo y el manejo de error de un dato que él no muestra.
 *
 * `useSyncExternalStore` y no `useState` + `useEffect` a propósito: es la forma
 * que React tiene para leer de una fuente externa, y además evita el
 * `setState` dentro del efecto que el lint del repo marca.
 *
 * Un solo intervalo, con contador de suscriptores: arranca cuando se suscribe
 * el primero y se corta cuando se va el último. Si más tarde vuelve a montarse
 * alguien, recibe al instante el último dato cacheado (así no parpadea en
 * blanco) y el refresco se reanuda.
 */
import { api } from "@/lib/api"
import type { TableroProduccion } from "@/lib/api/types"
import { useSyncExternalStore } from "react"

/** Igual que `/planificacion`: polling y no websockets, el backend duerme en Railway. */
export const REFRESCO_TABLERO_MS = 15_000

export type EstadoTablero = {
  /** `null` mientras no contestó nunca */
  datos: TableroProduccion | null
  /** El último pedido falló. Puede ser `true` con `datos` cargados: dato viejo. */
  falló: boolean
  /** `Date.now()` del último pedido que salió bien, para saber qué tan viejo es el dato */
  actualizado: number | null
}

/**
 * La foto que leen los componentes.
 *
 * Se reemplaza entera en cada cambio y nunca se muta: `useSyncExternalStore`
 * compara por identidad, así que mutarla dejaría a los dos bloques sin
 * redibujar.
 */
let foto: EstadoTablero = { datos: null, falló: false, actualizado: null }

const oyentes = new Set<() => void>()
let reloj: ReturnType<typeof setInterval> | null = null
/** Evita que dos pedidos se pisen si uno tarda más que el intervalo */
let enVuelo = false

function avisar() {
  for (const oyente of oyentes) oyente()
}

/**
 * Normaliza la respuesta en un solo lugar.
 *
 * El backend promete que estas listas vienen siempre, pero front (Vercel) y
 * back (Railway) se deployan por separado: hay una ventana en la que esta
 * pantalla ya es nueva y la API todavía no manda `pendientes`. Sin los
 * defaults, en esa ventana los bloques se caen por una clave que falta.
 */
function normalizar(t: TableroProduccion): TableroProduccion {
  return {
    ...t,
    maquinas: t.maquinas ?? [],
    etapas: t.etapas ?? [],
    pendientes: t.pendientes ?? [],
    finalizadas: t.finalizadas ?? [],
    sin_ubicar: t.sin_ubicar ?? [],
    stock: t.stock ?? { terminado: [], total_items: 0, bajo_minimo: 0 },
  }
}

async function traer() {
  if (enVuelo) return
  enVuelo = true
  try {
    const t = await api.produccion.tablero()
    foto = { datos: normalizar(t), falló: false, actualizado: Date.now() }
  } catch {
    // Se conserva el último dato bueno: en una planta, «hace 15 s había 3 en
    // extrusión» sirve bastante más que la pantalla en blanco.
    foto = { ...foto, falló: true }
  } finally {
    enVuelo = false
    avisar()
  }
}

function suscribir(avisarA: () => void) {
  oyentes.add(avisarA)
  if (oyentes.size === 1) {
    traer()
    reloj = setInterval(traer, REFRESCO_TABLERO_MS)
  }
  return () => {
    oyentes.delete(avisarA)
    if (oyentes.size === 0 && reloj) {
      clearInterval(reloj)
      reloj = null
    }
  }
}

const leer = () => foto

/**
 * El tablero de planta, compartido.
 *
 * Lo pueden llamar todos los bloques que quieran: el pedido y el intervalo son
 * uno solo, y todos ven exactamente la misma foto en el mismo render.
 */
export function useTablero(): EstadoTablero {
  // El tercer argumento es la foto del server: en SSR no hay datos todavía y
  // tiene que devolver SIEMPRE la misma referencia, o React tira
  // «getServerSnapshot returned a different value».
  return useSyncExternalStore(suscribir, leer, leer)
}
