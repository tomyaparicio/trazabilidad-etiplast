"use client"

/**
 * Qué pedidos hay en la planta, uno por renglón, el más viejo arriba.
 *
 * Es la única parte del dashboard que dice QUÉ HACER. Los cinco números de
 * `OrdenesPorEtapa` contestan «cuánto hay en cada paso»; esto contesta «a cuál
 * voy a buscar», que es la pregunta del que mira el tablero parado en la
 * planta.
 *
 * Reemplaza a «En planta ahora» (`planta-en-vivo.tsx`), que mostraba lo mismo
 * pero leyendo `maquinas` + `etapas`. Esos dos campos se arman con los pases
 * ABIERTOS, así que se comen las órdenes cuyo último pase lo cerró el escaneo
 * de la orden siguiente al entrar a la misma máquina — justo las trabadas, que
 * son las únicas accionables. Esta lista sale de `pasos`, donde el backend
 * reparte cada orden no cancelada en exactamente un paso: no se pierde
 * ninguna.
 *
 * El orden es por antigüedad y no por número de orden ni por paso: el pedido
 * que hace tres días que no se mueve es el que hay que ir a buscar, y en una
 * lista ordenada por OT queda sexto.
 *
 * Entran los pasos 1 a 4. El 5 (finalizado) no: esas órdenes ya salieron de la
 * planta y no hay nada que hacer con ellas acá.
 */
import {
  PASOS_ORDENADOS, SIGUIENTE_DE, estaTrabada,
  type ClavePaso, type OrdenEnPaso, type PasoTablero,
} from "@/lib/api/types"
import { desdeHaceCorto } from "@/lib/fechas"
import { useTablero } from "@/lib/use-tablero"
import { AlertTriangle, ArrowRight, CircleSlash } from "lucide-react"
import Link from "next/link"

const nf = new Intl.NumberFormat("es-AR")

/** Los cuatro pasos que todavía están DENTRO del recorrido. */
const EN_RECORRIDO: ClavePaso[] = ["orden_trabajo", "extrusion", "impresion", "troquelado"]

/** Cuántos pedidos hay, con el singular bien, que es lo que se lee en voz alta. */
const pedidos = (n: number) => (n === 1 ? "1 pedido" : `${nf.format(n)} pedidos`)

type Fila = {
  orden: OrdenEnPaso
  paso: PasoTablero
  /** Pasó por la etapa y nadie la escaneó en la siguiente: está entre dos máquinas. */
  trabada: boolean
  /** Hace cuánto que está donde está, en ms. `-1` = sin fecha, van al final. */
  antiguedad: number
}

/** `-1` y no `NaN` ni `0`: `NaN` rompe el `sort` y `0` la mandaría al principio. */
function antiguedadMs(iso: string | null, ahora: number): number {
  if (!iso) return -1
  const t = new Date(iso).getTime()
  return Number.isNaN(t) ? -1 : ahora - t
}

/**
 * Aplana los pasos 1 a 4 en una sola lista, la más vieja primero.
 *
 * `total` es la suma de los `paso.total`, no el largo de la lista: cada paso
 * viene con tope de 20 órdenes, así que las dos cosas no son lo mismo y el
 * número que se muestra tiene que ser el de verdad.
 */
function aplanar(pasos: PasoTablero[]): { filas: Fila[]; total: number } {
  const ahora = Date.now()
  const enRecorrido = pasos.filter((p) => EN_RECORRIDO.includes(p.clave))
  const filas = enRecorrido.flatMap((paso) =>
    paso.ordenes.map((orden) => ({
      orden,
      paso,
      trabada: estaTrabada(paso.clave, orden.en_maquina),
      antiguedad: antiguedadMs(orden.desde, ahora),
    })),
  )
  filas.sort((a, b) => b.antiguedad - a.antiguedad)
  return { filas, total: enRecorrido.reduce((n, p) => n + p.total, 0) }
}

export function PedidosEnPlanta() {
  const { datos } = useTablero()

  // Mientras no hay dato la tarjeta se dibuja igual, con un renglón neutro: si
  // desapareciera, el dashboard saltaría cuando contesta Railway. El error de
  // la API lo canta `OrdenesPorEtapa` arriba — repetirlo acá es ruido.
  if (!datos) {
    return (
      <Marco total={null} truncada={null} cabecera={false}>
        <p className="px-5 py-8 text-base font-semibold text-muted-foreground sm:px-6">
          Leyendo el tablero de planta…
        </p>
      </Marco>
    )
  }

  const { filas, total } = aplanar(datos.pasos)
  // Misma redacción que los otros bloques, pero diciendo la verdad entera: la
  // lista llega ordenada por antigüedad y el recorte del backend se queda con
  // las 20 MÁS RECIENTES de cada paso, así que lo que puede faltar es
  // justamente lo más viejo — que es lo que esta pantalla ordena primero.
  const truncada = filas.length < total ? filas.length : null
  // `?.` aunque el tipo diga que `resumen` viene siempre: `normalizar()` en
  // `use-tablero` le pone default a `maquinas`, `etapas`, `pendientes`… pero
  // NO a `resumen`. Vercel y Railway se deployan por separado, así que hay una
  // ventana en la que esta pantalla ya es nueva y la API todavía no manda la
  // clave; sin esto el bloque entero se cae. Misma defensa que `Canceladas` en
  // `OrdenesPorEtapa`.
  const sinUbicar = datos.resumen?.sin_ubicar ?? 0

  return (
    <Marco total={total} truncada={truncada} cabecera={filas.length > 0}>
      {filas.length === 0 ? (
        <div className="px-5 py-8 sm:px-6">
          <p className="text-lg font-bold text-foreground">No hay ningún pedido en la planta.</p>
          <p className="mt-2 max-w-[70ch] text-base font-semibold text-muted-foreground">
            Acá aparece cada pedido desde que se carga la orden hasta que se cierra. En cuanto
            alguien escanee un QR en una máquina, el pedido entra a esta lista.
          </p>
        </div>
      ) : (
        <ul>
          {filas.map((f) => (
            <li key={`${f.paso.clave}-${f.orden.id}`} className="border-b border-border last:border-b-0">
              <Renglon fila={f} />
            </li>
          ))}
        </ul>
      )}

      {/* Las que están en producción y nadie escaneó nunca. Caen en el paso 1 y
          salen en la lista de arriba, pero mezcladas con las recién cargadas:
          una orden sin arrancar es normal, una EN PRODUCCIÓN sin un solo
          escaneo es un agujero en el seguimiento y hay que decirlo aparte.
          Este aviso venía de «En planta ahora» y se conserva tal cual. */}
      {sinUbicar > 0 && (
        <p className="m-5 flex items-center gap-2 rounded-xl border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-base font-bold text-amber-700 sm:mx-6 dark:text-amber-300">
          <CircleSlash aria-hidden className="size-5 shrink-0" />
          {sinUbicar === 1
            ? "1 orden en producción sin escanear: no se sabe dónde está."
            : `${nf.format(sinUbicar)} órdenes en producción sin escanear: no se sabe dónde están.`}
        </p>
      )}
    </Marco>
  )
}

/** La tarjeta, con el encabezado y la cabecera de columnas. */
function Marco({
  total, truncada, cabecera, children,
}: {
  total: number | null
  truncada: number | null
  /** La cabecera de columnas sólo tiene sentido si abajo hay renglones. */
  cabecera: boolean
  children: React.ReactNode
}) {
  return (
    <section className="eti-in overflow-hidden rounded-3xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 pb-3 pt-5 sm:px-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="font-display text-[21px] tracking-tight text-foreground">
            Qué hay en la planta
          </h2>
          {total !== null && (
            <span className="rounded-full bg-primary/15 px-3 py-1 text-[13px] font-bold text-primary-700 dark:text-primary-300">
              {pedidos(total)}
            </span>
          )}
        </div>
        <Link
          href="/planificacion"
          className="inline-flex shrink-0 items-center gap-1.5 border-b-2 border-gold pb-0.5 text-[13.5px] font-semibold text-foreground hover:text-brand dark:hover:text-primary-300"
        >
          Ver tablero <ArrowRight aria-hidden className="size-3.5" />
        </Link>
      </div>

      {truncada !== null && (
        <p className="px-5 pb-3 text-[13px] font-semibold text-muted-foreground sm:px-6">
          Se ven {nf.format(truncada)}: de cada paso llegan como mucho las 20 más recientes, así
          que puede faltar alguna todavía más vieja.
        </p>
      )}

      {/* La cabecera sólo en pantalla ancha: abajo de md el renglón se apila y
          una cabecera de tres columnas no tendría a qué apuntar. Y sólo si hay
          renglones: rotular columnas vacías arriba de «no hay ningún pedido»
          es decorado que confunde. */}
      {cabecera && (
        <div className="hidden grid-cols-[minmax(0,1fr)_248px_148px] gap-4 border-y border-border px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground sm:px-6 md:grid">
          <span>Pedido</span>
          <span>Dónde está</span>
          <span className="text-right">Hace</span>
        </div>
      )}

      {children}
    </section>
  )
}

/**
 * Un pedido.
 *
 * La trabada se marca con TRES señales y no sólo con color: barra gruesa a la
 * izquierda, ícono y texto. El que mira el tablero puede ser daltónico y la
 * pantalla de la oficina se mira de lejos y de costado — la barra es lo que se
 * ve primero desde tres metros.
 *
 * El ámbar es el mismo que usa `OrdenesPorEtapa` para lo trabado: en esta
 * pantalla ámbar significa una sola cosa. El dorado queda reservado a «acá
 * está ahora» (la marca del carril), que es otra cosa distinta.
 */
function Renglon({ fila }: { fila: Fila }) {
  const { orden, paso, trabada } = fila
  const siguiente = SIGUIENTE_DE[paso.clave]
  const hace = desdeHaceCorto(orden.desde)
  // Debajo del tiempo: quién o qué máquina lo tiene. En el paso 1 no hay ni
  // uno ni otro porque la orden todavía no entró a ninguna máquina.
  const quien = trabada
    ? siguiente
      ? `esperando ${siguiente}`
      : "esperando"
    : (orden.operario ?? orden.maquina ?? (paso.clave === "orden_trabajo" ? "sin arrancar" : ""))

  // El `pl` compensa los 5 px de la barra para que el renglón trabado no
  // quede corrido respecto de los demás.
  //
  // `amber-600` en claro y `amber-300` en oscuro, no un ámbar único: contra la
  // tarjeta blanca, `amber-500` da 2,13:1 y WCAG 1.4.11 pide 3:1 para un
  // elemento gráfico. `amber-600` da 3,22:1 y `amber-300` sobre la tarjeta
  // oscura, 12,16:1.
  return (
    <Link
      href={`/ordenes?buscar=${orden.numero}`}
      className={`flex flex-wrap items-start justify-between gap-x-4 gap-y-3 py-4 pr-5 transition hover:bg-accent sm:pr-6 md:grid md:grid-cols-[minmax(0,1fr)_248px_148px] md:items-center ${
        trabada
          ? "border-l-[5px] border-l-amber-600 bg-amber-400/[0.07] pl-[15px] sm:pl-[19px] dark:border-l-amber-300"
          : "pl-5 sm:pl-6"
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-[17px] font-extrabold leading-tight text-foreground">
          {orden.producto ?? "Sin producto cargado"}
        </p>
        {/* El número de orden resalta por PESO y no por color. Dos razones,
            las dos medidas:
             - Adentro de esta tarjeta el dorado significa una sola cosa, «acá
               está ahora» (la marca del carril). Pintar también el OT de
               dorado rompe esa lectura.
             - `text-gold` no sirve igual: `globals.css` declara
               `@utility text-gold { color: var(--gold-text) }` justamente para
               esto, pero Tailwind emite DESPUÉS su propia
               `.text-gold { color: var(--gold) }` (sale de `--color-gold` en
               el `@theme`) con la misma especificidad, así que gana la última
               y el override no hace nada. Verificado en el CSS servido: las
               dos reglas están, la de `--gold` segunda. En tema claro eso deja
               el OT en #f5eb4a sobre blanco = 1,25:1.
            Así queda 17,5:1 en claro y 16,05:1 en oscuro. */}
        <p className="mt-1 truncate text-sm font-semibold text-muted-foreground">
          <span className="font-bold text-foreground">{orden.numero}</span>
          {" · "}
          {orden.cliente ?? "Sin cliente"}
          {orden.cantidad !== null && <> · {nf.format(orden.cantidad)} u</>}
        </p>
      </div>

      {/* En el celular el carril se va al renglón de abajo (`order-last` +
          `w-full`): arriba quedan el pedido y el tiempo, que es lo que se lee
          de un barrido. En md manda el grid y estas clases no aplican. */}
      <div className="order-last flex w-full items-center gap-2 md:order-none md:w-auto">
        <Carril paso={paso.numero} />
        <span className="text-[13px] font-bold text-primary-700 dark:text-primary-300">
          <span className="sr-only">Paso {paso.numero} de 5: </span>
          {paso.titulo}
        </span>
      </div>

      <div className="shrink-0 md:text-right">
        <p
          className={`flex items-center gap-1.5 text-[15px] font-bold tabular-nums md:justify-end ${
            trabada ? "text-amber-700 dark:text-amber-300" : "text-foreground"
          }`}
        >
          {trabada && <AlertTriangle aria-hidden className="size-4 shrink-0" />}
          {hace || "sin fecha"}
        </p>
        {/* Sin `truncate`: acá dice QUÉ falta («esperando troquelado»), y
            cortado a «esperando troquel…» deja de servir. Si no entra,
            envuelve. */}
        {quien && (
          <p
            className={`mt-0.5 text-[13px] font-semibold ${
              trabada ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground"
            }`}
          >
            {quien}
          </p>
        )}
      </div>
    </Link>
  )
}

/**
 * Las cinco marcas del recorrido: dónde está este pedido.
 *
 * Decorativo: `aria-hidden` y el dato en texto al lado («Paso 3 de 5:
 * Impresión»). Un carril de colores no se lee en voz alta.
 *
 * Los colores no salen de la paleta del mockup tal cual porque esa maqueta es
 * sólo tema oscuro:
 *
 *  - recorrido → `bg-primary`, no `primary-300`: #8a8dff sobre la tarjeta
 *    blanca del tema claro da 2,86:1 y WCAG 1.4.11 pide 3:1 para un elemento
 *    gráfico. `--primary` es el mismo azul de marca por tema (#5b61e6 oscuro /
 *    #292d96 claro) y da 3,67:1 y 10,91:1.
 *  - acá está ahora → `--gold-text`, no `--gold`: #f5eb4a sobre blanco da
 *    1,25:1, o sea invisible en tema claro. `--gold-text` vale #f5eb4a en
 *    oscuro (14,25:1) y #8a7200 en claro (4,73:1).
 *  - lo que falta → `bg-foreground/15`, que se apaga solo en los dos temas.
 *
 * Y la marca del paso actual además es MÁS ALTA que las otras: así se
 * distingue por forma y no sólo por color.
 */
function Carril({ paso }: { paso: number }) {
  return (
    <span aria-hidden className="flex shrink-0 items-center gap-[5px]">
      {PASOS_ORDENADOS.map((clave, i) => {
        const n = i + 1
        if (n === paso) {
          return (
            <span
              key={clave}
              className="h-3 w-5 rounded-full bg-gold-text ring-[3px] ring-gold-text/20"
            />
          )
        }
        return (
          <span
            key={clave}
            className={`h-[7px] w-5 rounded-full ${n < paso ? "bg-primary" : "bg-foreground/15"}`}
          />
        )
      })}
    </span>
  )
}
