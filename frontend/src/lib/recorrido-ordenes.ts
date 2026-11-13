/**
 * El recorrido de cada orden, armado para una fila de tabla.
 *
 * De dónde sale la forma: el relevamiento de la empresa describe la «Planilla
 * de Registro de Extrusión» como el tablero de producción DE FACTO —una fila
 * por trabajo y tres casilleros de avance (Ext. / Imp. / Troq.)—, y lo que le
 * falta al papel es justo lo que el escaneo del QR captura: *cuándo* pasó cada
 * etapa, *quién* la hizo y *en qué* máquina. Las marcas binarias del papel no
 * dicen desde cuándo un trabajo está donde está.
 *
 * Esta función es esa planilla al día. Vive acá y no en el componente porque es
 * aritmética pura sobre dos respuestas de la API: se puede leer, discutir y
 * testear sin montar React.
 *
 * ── Por qué hacen falta DOS fuentes ──────────────────────────────────────────
 *
 * `GET /produccion/tablero` contesta «dónde está cada orden AHORA»: reparte
 * cada orden no cancelada en exactamente uno de los cinco pasos, con `desde`,
 * `operario`, `maquina` y `en_maquina`. Es la única fuente autorizada de la
 * posición actual —la calcula el backend mirando los pases de máquina— pero NO
 * trae el pasado: del paso 3 no se sabe qué día pasó por extrusión.
 *
 * Ese pasado está en la ficha de la orden (`fecha_extrusion`,
 * `operador_extrusion`, …), que la escribe el mismo escaneo. Así que la
 * posición actual sale del tablero y las celdas ya cumplidas de la ficha. Las
 * dos pueden estar desfasadas por un instante (el tablero se refresca primero);
 * cuando pasa, la celda del pasado se ve como «pasó, sin fecha» por un segundo,
 * que es mucho mejor que retrasar la posición actual.
 */
import {
  PASOS_ORDENADOS, TITULO_PASO, estaTrabada,
  type ClavePaso, type OrdenEnPaso, type OrdenTrabajo, type PasoTablero,
} from "@/lib/api/types"
import { desdeHaceCorto, diaCorto } from "@/lib/fechas"

/**
 * Lo que puede decir una celda de paso.
 *
 *  - `hecho`     — ya pasó por acá: la fecha y quién lo hizo
 *  - `ahora`     — el trabajo está ACÁ, sobre una máquina, en este momento
 *  - `trabada`   — pasó por acá y nadie lo escaneó en la etapa siguiente
 *  - `cola`      — está en el paso 1: emitida y todavía sin entrar a la planta
 *  - `pendiente` — todavía no llegó
 *
 * `cola` existe para que el dorado de `ahora` siga queriendo decir algo. El
 * paso 1 es también «donde está ahora» esa orden, pero es la COLA DE ENTRADA:
 * con veinte órdenes esperando para arrancar, la columna 1 entera se pintaría
 * de dorado y los dos o tres trabajos que de verdad están sobre una máquina se
 * perderían adentro de esa pared. Así que la celda dice lo mismo —hace cuánto
 * espera y quién la cargó— sin encender la señal de planta.
 */
export type EstadoCelda = "hecho" | "ahora" | "trabada" | "cola" | "pendiente"

export type CeldaPaso = {
  estado: EstadoCelda
  /** «06/11» en `hecho`; «3 h», «2 días» en `ahora` y `trabada`; `null` si no hay registro */
  cuando: string | null
  /** El operario, o la máquina cuando la etapa elige máquina (impresión) */
  quien: string | null
}

/** El tono del chip de Estado. Cada uno tiene UN significado en toda la pantalla. */
export type TonoEstado = "planta" | "trabada" | "espera" | "fin"

export type FilaRecorrido = {
  id: number
  numero: string
  lote: string | null
  cliente: string | null
  producto: string | null
  cantidad: number | null
  /** En qué paso está AHORA (del tablero, que es la fuente autorizada) */
  paso: ClavePaso
  trabada: boolean
  /** Las cinco celdas, en el orden del recorrido */
  celdas: CeldaPaso[]
  estado: { texto: string; tono: TonoEstado }
  /** Desde cuándo está en el paso actual (ISO), para ordenar */
  desde: string | null
}

/**
 * «45 min», «3 h», «2 días»: una sola unidad.
 *
 * `desdeHaceCorto` devuelve «3 h 34 min», que es lo correcto en una lista a lo
 * ancho pero no entra en una celda de ~100 px sin partirse en dos renglones, y
 * un «3 h 34 / min» cortado al medio se lee como un error de la pantalla. Los
 * minutos sueltos tampoco aportan: el que mira el tablero decide con «hace
 * rato» o «recién», no con el minuto exacto.
 *
 * Se recorta la salida de `desdeHaceCorto` en vez de rehacer la cuenta: la
 * aritmética de tiempo vive en un solo lugar y no se puede desincronizar.
 */
function unaUnidad(iso: string | null): string {
  const t = desdeHaceCorto(iso)
  const m = /^(\d+ h) \d+ min$/.exec(t)
  return m ? m[1] : t
}

/** Un `""` que viene de la API no es un nombre: el escaneo guarda vacío, no nulo. */
function texto(v: string | null | undefined): string | null {
  const t = (v ?? "").trim()
  return t === "" ? null : t
}

/**
 * «IMP-002 (ReinaFlex)» → «ReinaFlex».
 *
 * El tablero manda la máquina como «código (nombre)» porque en una lista larga
 * el nombre solo es ambiguo (hay dos Venus). En una celda de tabla al lado de
 * una fecha no entra: nadie en la planta la llama «IMP-002», así que se muestra
 * el nombre, que es con lo que la señalan.
 */
export function nombreMaquina(v: string | null | undefined): string | null {
  const t = texto(v)
  if (!t) return null
  const m = /\(([^)]+)\)\s*$/.exec(t)
  return texto(m?.[1]) ?? t
}

/**
 * Qué dice una celda de un paso que la orden YA dejó atrás, según la ficha.
 *
 * El paso 1 no sale de un escaneo: la orden la emite la oficina, así que la
 * fecha es la de emisión y «quién» es quien la cargó.
 *
 * En impresión se muestra la MÁQUINA y no el operario: es la única etapa donde
 * importa cuál (Venus, ReinaFlex y la Autoadhesiva hacen cosas distintas); en
 * extrusión y troquelado son intercambiables y lo que se busca es quién firmó.
 */
function delPasado(clave: ClavePaso, ficha: OrdenTrabajo | undefined): CeldaPaso {
  const base = { estado: "hecho" as const }
  switch (clave) {
    case "orden_trabajo":
      return {
        ...base,
        cuando: diaCorto(ficha?.fecha ?? ficha?.created_at ?? null) || null,
        quien: texto(ficha?.creador_nombre) ?? "oficina",
      }
    case "extrusion":
      return {
        ...base,
        cuando: diaCorto(ficha?.fecha_extrusion ?? null) || null,
        quien: texto(ficha?.operador_extrusion),
      }
    case "impresion":
      return {
        ...base,
        cuando: diaCorto(ficha?.fecha_impresion ?? null) || null,
        quien: texto(ficha?.impresion_maquina) ?? texto(ficha?.operador_impresion),
      }
    case "troquelado":
      return {
        ...base,
        cuando: diaCorto(ficha?.fecha_troquelado ?? null) || null,
        quien: texto(ficha?.operador_troquelado),
      }
    case "finalizado":
      return {
        ...base,
        cuando: diaCorto(ficha?.fecha_cierre ?? null) || null,
        quien: texto(ficha?.operador_cierre),
      }
  }
}

/** El chip de Estado: una frase corta y el tono que le corresponde. */
function estadoDe(clave: ClavePaso, trabada: boolean): FilaRecorrido["estado"] {
  if (trabada) return { texto: "Trabada", tono: "trabada" }
  if (clave === "orden_trabajo") return { texto: "Sin arrancar", tono: "espera" }
  if (clave === "finalizado") return { texto: "Finalizada", tono: "fin" }
  return { texto: `En ${TITULO_PASO[clave].toLowerCase()}`, tono: "planta" }
}

/**
 * Arriba lo que lleva más tiempo sin moverse.
 *
 * El criterio de la pantalla: primero lo que hay que ir a destrabar, después lo
 * que está corriendo, después la cola de entrada, y al final lo que ya salió de
 * la planta. Dentro de los tres primeros grupos, lo más VIEJO arriba —una orden
 * trabada hace dos días es peor que una trabada hace veinte minutos—. Las
 * finalizadas van al revés, las últimas primero, porque ahí ya no hay nada que
 * hacer y se leen como un registro.
 */
const PRIORIDAD: Record<TonoEstado, number> = { trabada: 0, planta: 1, espera: 2, fin: 3 }

function tiempo(iso: string | null): number {
  if (!iso) return 0
  const t = new Date(iso).getTime()
  return Number.isNaN(t) ? 0 : t
}

/**
 * Una fila por orden, con sus cinco celdas.
 *
 * `pasos` viene del tablero (ya normalizado a los cinco pasos y en orden) y
 * `fichas` son las órdenes completas indexadas por id. Una ficha que falte NO
 * saca la fila: la posición actual se muestra igual y las celdas del pasado
 * quedan en «pasó, sin fecha», que es exactamente lo que se sabe.
 */
export function filasDeRecorrido(
  pasos: PasoTablero[],
  fichas: Map<number, OrdenTrabajo>,
): FilaRecorrido[] {
  const filas: FilaRecorrido[] = []

  for (const paso of pasos) {
    const actual = PASOS_ORDENADOS.indexOf(paso.clave)
    for (const orden of paso.ordenes) {
      filas.push(fila(paso.clave, actual, orden, fichas.get(orden.id)))
    }
  }

  return filas.sort((a, b) => {
    const pa = PRIORIDAD[a.estado.tono]
    const pb = PRIORIDAD[b.estado.tono]
    if (pa !== pb) return pa - pb
    const ta = tiempo(a.desde)
    const tb = tiempo(b.desde)
    if (ta !== tb) return pa === PRIORIDAD.fin ? tb - ta : ta - tb
    return a.numero.localeCompare(b.numero, "es-AR")
  })
}

function fila(
  clave: ClavePaso,
  actual: number,
  orden: OrdenEnPaso,
  ficha: OrdenTrabajo | undefined,
): FilaRecorrido {
  const trabada = estaTrabada(clave, orden.en_maquina)

  const celdas = PASOS_ORDENADOS.map((c, i): CeldaPaso => {
    if (i > actual) return { estado: "pendiente", cuando: null, quien: null }
    if (i < actual) return delPasado(c, ficha)

    // El paso actual. En `finalizado` se dibuja como cumplido y no como «acá
    // ahora»: el dorado de esta pantalla significa «el trabajo está en la
    // planta, en este punto», y una orden cerrada ya salió. Encenderlo ahí
    // haría que la columna 5 de todo el historial compita con el único trabajo
    // que de verdad está sobre una máquina.
    if (clave === "finalizado") {
      const cumplida = delPasado(c, ficha)
      return { ...cumplida, cuando: cumplida.cuando ?? (diaCorto(orden.desde) || null) }
    }

    return {
      estado: trabada ? "trabada" : clave === "orden_trabajo" ? "cola" : "ahora",
      cuando: unaUnidad(orden.desde) || null,
      // `maquina` primero: cuando el tablero la trae es la máquina donde está
      // el pase AHORA, que es más preciso que la impresora que eligió la
      // oficina al dar de alta la orden.
      quien: nombreMaquina(orden.maquina) ?? texto(orden.operario) ?? delPasado(c, ficha).quien,
    }
  })

  return {
    id: orden.id,
    numero: orden.numero,
    lote: orden.lote,
    cliente: texto(orden.cliente),
    // El nombre del producto viene con espacios de la carga a mano («Agua »).
    producto: texto(orden.producto),
    cantidad: orden.cantidad,
    paso: clave,
    trabada,
    celdas,
    estado: estadoDe(clave, trabada),
    desde: orden.desde,
  }
}

/**
 * Cuántas órdenes están paradas entre dos máquinas, en toda la planta.
 *
 * Sólo cuenta los pasos de planta: en el paso 1 la orden todavía no entró y en
 * el 5 ya salió, así que ahí «no está en máquina» es lo normal.
 */
export function trabadasDe(pasos: PasoTablero[]): number {
  return pasos.reduce(
    (n, p) => n + p.ordenes.filter((o) => estaTrabada(p.clave, o.en_maquina)).length,
    0,
  )
}

/** Cuántos trabajos hay AHORA sobre la planta: los pasos 2, 3 y 4. */
export function enPlantaDe(pasos: PasoTablero[]): number {
  return pasos
    .filter((p) => p.clave === "extrusion" || p.clave === "impresion" || p.clave === "troquelado")
    .reduce((n, p) => n + p.total, 0)
}
