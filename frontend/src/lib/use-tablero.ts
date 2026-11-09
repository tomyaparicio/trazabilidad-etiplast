"use client"

/**
 * El tablero de planta, traído UNA sola vez para todos los que lo miran.
 *
 * Por qué existe: en la pestaña «Producción» del dashboard se dibujan juntos
 * `OrdenesPorEtapa` y `PedidosEnPlanta`, y cada uno tenía su propio `setInterval`
 * de 15 s contra el MISMO `GET /api/produccion/tablero`. Eso eran 8 pedidos por
 * minuto —contra un rate limit de 120/min por IP— y, peor, el cold start de
 * Railway se pagaba dos veces: los dos bloques podían quedar mostrando
 * instantes distintos de la misma planta. `/planificacion` tenía su propio
 * tercer intervalo contra el mismo endpoint; ahora también lee de acá.
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
 * Un solo intervalo de cada tipo, con contador de suscriptores: arrancan cuando
 * se suscribe el primero y se cortan cuando se va el último. Si más tarde
 * vuelve a montarse alguien, recibe al instante el último dato cacheado (así no
 * parpadea en blanco) y el refresco se reanuda.
 */
import { api } from "@/lib/api"
import {
  PASOS_ORDENADOS, TITULO_PASO,
  type ClavePaso, type OrdenEnPaso, type PasoTablero, type TableroProduccion,
} from "@/lib/api/types"
import { useSyncExternalStore } from "react"

/**
 * El refresco ciego, que queda SÓLO como red de seguridad.
 *
 * Antes era el único mecanismo: pedía las 7 consultas del tablero cada 15 s
 * aunque en la planta no hubiera pasado nada, y el que escaneaba en la tablet
 * tardaba hasta 15 s en aparecer en el tablero de la oficina. Ahora lo que
 * manda es `REFRESCO_VERSION_MS`; esto sólo cubre el caso de que el sondeo de
 * versión falle o devuelva siempre lo mismo por un bug del backend.
 */
export const REFRESCO_TABLERO_MS = 15_000

/**
 * Cada cuánto se pregunta si hay algo nuevo.
 *
 * Polling y no SSE: el front pasa por el proxy de Next
 * (`app/api/backend/[...path]/route.ts`), que hace `await res.text()` y buferea
 * la respuesta entera —un stream se colgaría ahí— y `vercel.json` no declara
 * `maxDuration`, así que Vercel cortaría la función igual. Un endpoint de
 * versión barato pedido seguido resuelve lo mismo sin infraestructura nueva.
 *
 * 3 s es lo que tarda el operario en guardar el celular: es «al instante» para
 * el que mira el tablero de la oficina.
 */
export const REFRESCO_VERSION_MS = 3_000

export type EstadoTablero = {
  /** `null` mientras no contestó nunca */
  datos: TableroProduccion | null
  /** El último pedido falló. Puede ser `true` con `datos` cargados: dato viejo. */
  falló: boolean
  /** El texto del último error, para mostrar lo que dijo la API y no un genérico */
  mensaje: string | null
  /** `Date.now()` del último pedido que salió bien, para saber qué tan viejo es el dato */
  actualizado: number | null
  /** Hay un pedido del tablero en vuelo ahora (para el botón «Actualizar») */
  cargando: boolean
}

/**
 * La foto que leen los componentes.
 *
 * Se reemplaza entera en cada cambio y nunca se muta: `useSyncExternalStore`
 * compara por identidad, así que mutarla dejaría a los bloques sin redibujar.
 */
let foto: EstadoTablero = {
  datos: null, falló: false, mensaje: null, actualizado: null, cargando: false,
}

const oyentes = new Set<() => void>()
let relojTablero: ReturnType<typeof setInterval> | null = null
let relojVersion: ReturnType<typeof setInterval> | null = null
/** Evita que dos pedidos se pisen si uno tarda más que el intervalo */
let enVuelo = false
/** Hay que repetir el pedido al terminar el que está en vuelo (ver `traer`) */
let repetir = false
/** El último `v` que vimos. `null` = todavía no se preguntó nunca. */
let versionVista: string | null = null

function avisar() {
  for (const oyente of oyentes) oyente()
}

/**
 * Los cinco pasos a partir de los campos viejos del tablero.
 *
 * Es el plan B para la ventana de deploy en la que esta pantalla ya es nueva y
 * la API todavía no manda `pasos` (Vercel y Railway van separados). Con `pasos`
 * en cero se vería «no hay nada en impresión» con la impresora trabajando, que
 * es peor que el dato viejo: es una mentira. Reconstruido de los campos viejos
 * se ve lo mismo que se veía antes del cambio —se siguen perdiendo las órdenes
 * con el último pase cerrado, que es justo el bug que `pasos` arregla— pero
 * nada de lo que muestra es falso.
 *
 * Todos salen con `en_maquina: true` porque los campos viejos se armaban
 * mirando sólo pases ABIERTOS: no había forma de estar ahí sin estar en la
 * máquina.
 */
function pasosDeLegado(t: TableroProduccion): PasoTablero[] {
  const deEtapa = (etapa: ClavePaso): OrdenEnPaso[] =>
    (t.etapas.find((e) => e.etapa === etapa)?.ordenes ?? []).map((o) => ({
      id: o.id, numero: o.numero, lote: o.lote, cliente: o.cliente,
      producto: o.producto, cantidad: o.cantidad, desde: o.desde,
      operario: o.operario, maquina: null, en_maquina: true,
    }))

  const impresion: OrdenEnPaso[] = t.maquinas
    .filter((m) => m.orden)
    .map((m) => ({
      id: m.orden!.id, numero: m.orden!.numero, lote: m.orden!.lote,
      cliente: m.orden!.cliente, producto: m.orden!.producto,
      cantidad: m.orden!.cantidad, desde: m.orden!.desde,
      operario: m.orden!.operario, maquina: m.nombre, en_maquina: true,
    }))

  const porClave: Record<ClavePaso, OrdenEnPaso[]> = {
    orden_trabajo: t.pendientes.map((o) => ({
      id: o.id, numero: o.numero, lote: o.lote, cliente: o.cliente,
      producto: o.producto, cantidad: o.cantidad,
      // `fecha` acá es la emisión: de una orden que no arrancó lo que importa
      // es hace cuánto espera, que es exactamente lo que mide `desde`.
      desde: o.fecha, operario: null, maquina: null, en_maquina: false,
    })),
    extrusion: deEtapa("extrusion"),
    impresion,
    troquelado: deEtapa("troquelado"),
    finalizado: t.finalizadas.map((o) => ({
      id: o.id, numero: o.numero, lote: o.lote, cliente: o.cliente,
      producto: o.producto, cantidad: o.cantidad,
      desde: o.fecha, operario: null, maquina: null, en_maquina: false,
    })),
  }

  // Los totales reales de los pasos 1 y 5: esas dos listas vienen con tope de
  // 20, así que su largo no es el total.
  const total: Partial<Record<ClavePaso, number>> = {
    orden_trabajo: t.resumen?.pendientes_total,
    finalizado: t.resumen?.finalizadas_total,
  }

  return PASOS_ORDENADOS.map((clave, i) => ({
    clave,
    numero: i + 1,
    titulo: TITULO_PASO[clave],
    total: total[clave] ?? porClave[clave].length,
    ordenes: porClave[clave],
  }))
}

/**
 * Los cinco pasos, siempre los cinco y siempre en orden.
 *
 * Si el backend manda `pasos` se usa tal cual, pero rearmado contra
 * `PASOS_ORDENADOS`: así un paso que falte sale vacío en su lugar en vez de
 * correr la numeración —si el paso 4 desapareciera, el 5 quedaría dibujado
 * donde va el 4 y el recorrido dejaría de leerse de corrido.
 */
function cincoPasos(t: TableroProduccion): PasoTablero[] {
  const vienen = t.pasos ?? []
  if (vienen.length === 0) return pasosDeLegado(t)

  const porClave = new Map(vienen.map((p) => [p.clave, p]))
  return PASOS_ORDENADOS.map((clave, i) => {
    const p = porClave.get(clave)
    return {
      clave,
      numero: p?.numero ?? i + 1,
      titulo: p?.titulo ?? TITULO_PASO[clave],
      total: p?.total ?? 0,
      ordenes: p?.ordenes ?? [],
    }
  })
}

/**
 * Normaliza la respuesta en un solo lugar.
 *
 * El backend promete que estas listas vienen siempre, pero front (Vercel) y
 * back (Railway) se deployan por separado: hay una ventana en la que esta
 * pantalla ya es nueva y la API todavía no manda `pendientes` ni `pasos`. Sin
 * los defaults, en esa ventana los bloques se caen por una clave que falta.
 */
function normalizar(t: TableroProduccion): TableroProduccion {
  const base: TableroProduccion = {
    ...t,
    maquinas: t.maquinas ?? [],
    etapas: t.etapas ?? [],
    pendientes: t.pendientes ?? [],
    finalizadas: t.finalizadas ?? [],
    sin_ubicar: t.sin_ubicar ?? [],
    stock: t.stock ?? { terminado: [], total_items: 0, bajo_minimo: 0 },
    // `t.pasos` y no `[]`: `cincoPasos` lee esta clave para decidir si usa el
    // contrato o reconstruye de los campos viejos. Dejarla vacía acá mandaba
    // SIEMPRE al plan B y tiraba los `pasos` buenos del backend — con el
    // tablero perdiendo órdenes igual que antes del cambio, pero en silencio.
    pasos: t.pasos ?? [],
  }
  return { ...base, pasos: cincoPasos(base) }
}

/**
 * Pide el tablero completo.
 *
 * `forzar` es para el pedido que sale después de un escaneo: si justo hay uno
 * en vuelo, ese arrancó ANTES del escaneo y va a traer la foto vieja, así que
 * se marca para repetirlo en cuanto termine. Los pedidos de los intervalos no
 * fuerzan: si uno tarda más que el intervalo, encadenar pedidos dejaría al
 * endpoint pedido sin pausa justo cuando está lento.
 */
async function traer(forzar = false) {
  if (enVuelo) {
    if (forzar) repetir = true
    return
  }
  enVuelo = true
  foto = { ...foto, cargando: true }
  avisar()
  try {
    const t = await api.produccion.tablero()
    foto = {
      datos: normalizar(t), falló: false, mensaje: null,
      actualizado: Date.now(), cargando: false,
    }
  } catch (e) {
    // Se conserva el último dato bueno: en una planta, «hace 15 s había 3 en
    // extrusión» sirve bastante más que la pantalla en blanco.
    foto = {
      ...foto,
      falló: true,
      mensaje: e instanceof Error ? e.message : "No se pudo leer el tablero",
      cargando: false,
    }
  } finally {
    enVuelo = false
    avisar()
    if (repetir) {
      repetir = false
      traer(true)
    }
  }
}

/**
 * Pregunta si cambió algo y, SÓLO si cambió, pide el tablero.
 *
 * Esto es lo que hace que el tablero reaccione al escaneo: el que escanea está
 * en la tablet de planta y el que mira el tablero está en otro navegador en la
 * oficina, así que el aviso tiene que llegar por la API. `GET /version`
 * devuelve un string opaco que cambia con cualquier cosa que el tablero
 * muestre (un pase nuevo, un pase que se cierra, una orden que cambia de
 * estado, un item de stock que se mueve).
 */
async function traerVersion() {
  // Ya se está pidiendo el tablero: la respuesta que venga es más nueva que
  // cualquier cosa que diga este sondeo.
  if (enVuelo) return
  try {
    const { v } = await api.produccion.version()
    // Segundo chequeo, y no es redundante: entre el `if (enVuelo)` de arriba y
    // esta línea pasó un `await`, y en ese hueco puede haber arrancado un
    // `traer()`. Ese pedido salió ANTES de que supiéramos de `v`, así que puede
    // volver con la foto vieja. Si anotáramos `v` igual, el próximo sondeo
    // compararía iguales, no refrescaría, y el cambio se perdería hasta el
    // refresco de 15 s — justo lo que este sondeo viene a evitar.
    // Al no anotar nada, el tick siguiente vuelve a detectarlo.
    if (enVuelo) return
    const anterior = versionVista
    versionVista = v
    // En la primera vuelta sólo se anota la versión: el `traer()` del
    // `suscribir` ya cubrió ese momento y pedir de nuevo sería pedir dos veces
    // el tablero al abrir la pantalla.
    if (anterior === null) return
    if (v !== anterior) traer()
  } catch {
    // En silencio y sin tocar `falló`: este sondeo el usuario no lo ve, y
    // marcar el tablero como caído por él sería mentirle sobre el dato que
    // está mirando. El refresco de 15 s sigue siendo la red de seguridad.
  }
}

function suscribir(avisarA: () => void) {
  oyentes.add(avisarA)
  if (oyentes.size === 1) {
    traer()
    relojTablero = setInterval(() => traer(), REFRESCO_TABLERO_MS)
    relojVersion = setInterval(() => traerVersion(), REFRESCO_VERSION_MS)
  }
  return () => {
    oyentes.delete(avisarA)
    if (oyentes.size === 0) {
      if (relojTablero) {
        clearInterval(relojTablero)
        relojTablero = null
      }
      if (relojVersion) {
        clearInterval(relojVersion)
        relojVersion = null
      }
      // La versión vista se olvida con el último oyente. Es estado de módulo y
      // sobrevive al desmontaje: si la planta se movió mientras la pantalla no
      // estaba, al volver quedaba una versión vieja anotada contra datos recién
      // traídos, y el primer sondeo pedía el tablero de nuevo al pedo.
      versionVista = null
    }
  }
}

const leer = () => foto

/**
 * Pide el tablero YA, sin esperar el tick.
 *
 * Para el que acaba de escanear en la tablet: ve su propio movimiento al
 * instante en vez de esperar hasta 3 s. No reemplaza al sondeo de versión —el
 * que mira el tablero en la oficina es otro navegador y a ése sólo lo despierta
 * `/version`—, le ahorra la espera al que hizo el movimiento.
 */
export function refrescarTablero() {
  traer(true)
}

/**
 * El tablero de planta, compartido.
 *
 * Lo pueden llamar todos los bloques que quieran: el pedido y los intervalos
 * son uno solo, y todos ven exactamente la misma foto en el mismo render.
 */
export function useTablero(): EstadoTablero {
  // El tercer argumento es la foto del server: en SSR no hay datos todavía y
  // tiene que devolver SIEMPRE la misma referencia, o React tira
  // «getServerSnapshot returned a different value».
  return useSyncExternalStore(suscribir, leer, leer)
}
