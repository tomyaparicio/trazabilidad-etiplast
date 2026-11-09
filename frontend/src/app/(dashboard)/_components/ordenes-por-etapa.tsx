"use client"

/**
 * Los cinco pasos que recorre una orden, en el dashboard, en vivo y abribles.
 *
 * Reemplaza al bloque que se llamaba «Órdenes por etapa» y mostraba
 * borrador / pendientes / en producción / completadas. Eso son los ESTADOS de
 * la orden (`ordenes_trabajo.estado`), no el recorrido del trabajo: el título
 * mentía. El recorrido es el que contesta `GET /api/produccion/tablero` en
 * `pasos`:
 *
 *   1  Orden de trabajo   emitida o en producción sin ningún escaneo
 *   2  Extrusión                                  ← último pase escaneado
 *   3  Impresión                                  ← último pase escaneado
 *   4  Troquelado                                 ← último pase escaneado
 *   5  Finalizado         fuera de planta
 *
 * Estos números NO son los ①②③ de la ficha impresa, y está bien: el papel
 * numera las tres cosas que hace el operario en la máquina, esta pantalla
 * numera el recorrido completo de la orden. Son dos audiencias distintas —el
 * que está en la máquina y el que mira la planta de arriba— así que no tienen
 * por qué coincidir. La ficha impresa no se toca.
 *
 * Los contadores salen de `paso.total` y no se calculan acá. Antes se armaban
 * mirando `maquinas` y `etapas`, que sólo traen pases ABIERTOS: una orden cuyo
 * pase lo cerró el escaneo de la orden siguiente al entrar a la misma impresora
 * no caía en NINGÚN paso. Medido contra producción: de 3 órdenes en proceso se
 * veía 1. El backend reparte ahora cada orden en exactamente un paso.
 *
 * Cada paso se abre y muestra qué tiene adentro, porque el número solo no
 * alcanza: «3 en impresión» no dice cuáles, en qué máquina ni desde cuándo.
 *
 * ── Por qué es una TIRA y ya no cinco tarjetas ────────────────────────────
 *
 * La versión anterior eran cinco tarjetas de 172 px de alto con la línea
 * dorada pasando POR DETRÁS, sin tocar nada: 447 px de dashboard para mostrar
 * cinco números. Ahora los círculos se apoyan SOBRE la línea —que es lo que
 * hace que el recorrido se lea como un recorrido— y el bloque mide la mitad.
 * El azul de marca y el `rounded-3xl` se quedan: es lo que se lee como
 * Etiplast, y la identidad está en la proporción del bloque azul, no sólo en
 * los hex.
 *
 * El detalle de un paso abierto va DENTRO de esta misma tarjeta, sobre
 * `bg-primary-700`. Antes caía en un panel suelto 200 px más abajo y no se
 * entendía de dónde había salido.
 *
 * El dato lo trae `useTablero()`, compartido con `PedidosEnPlanta` y con
 * `/planificacion`: antes cada uno pedía el mismo endpoint cada 15 s por su
 * cuenta.
 */
import {
  SIGUIENTE_DE, estaTrabada,
  type ClavePaso, type OrdenEnPaso, type PasoTablero, type TableroProduccion,
} from "@/lib/api/types"
import { desdeHace, fechaCorta } from "@/lib/fechas"
import { useTablero } from "@/lib/use-tablero"
import { AlertTriangle, ArrowRight } from "lucide-react"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"

const nf = new Intl.NumberFormat("es-AR")

/**
 * Un panel por paso, con id propio, y el botón de cada paso apunta al suyo.
 *
 * Antes los cinco botones compartían un solo `aria-controls`: con el paso 2
 * abierto, los botones 1, 3, 4 y 5 anunciaban `aria-expanded="false"` apuntando
 * a una región que estaba VISIBLE mostrando el contenido del paso 2. Eso es
 * falso, y un lector de pantalla no tiene forma de darse cuenta.
 *
 * Elegí acordeón de verdad (un panel por paso) y no `role="tablist"` porque el
 * paso abierto se puede CERRAR: en un tablist siempre hay una pestaña
 * seleccionada, así que para ser honesto con la semántica de tabs habría que
 * dejar un paso abierto siempre y la card ya no arrancaría compacta.
 *
 * Los cinco paneles se dibujan siempre y a lo ancho, debajo de la tira —no
 * dentro del `<li>`—: los pasos van en cinco columnas angostas y una lista de
 * órdenes ahí adentro queda ilegible. Están siempre en el DOM (ocultos con
 * `hidden`) para que `aria-controls` apunte siempre a un elemento que existe;
 * el contenido se arma sólo para el que está abierto.
 */
const idPanel = (clave: string) => `paso-${clave}-panel`
const idBoton = (clave: string) => `paso-${clave}-boton`

/**
 * Renglón corto abajo del número: dónde está el trabajo cuando está acá.
 *
 * Los tres pasos de planta dicen «En planta» y no «En máquina»: en un paso de
 * planta puede haber órdenes que pasaron por la etapa y están esperando la
 * siguiente, o sea en la planta pero NO en una máquina. Cuando las hay, este
 * mismo renglón pasa a decir «N esperando», que es el dato que importa.
 */
const DONDE: Record<ClavePaso, string> = {
  orden_trabajo: "Antes de planta",
  extrusion:     "En planta",
  impresion:     "En planta",
  troquelado:    "En planta",
  finalizado:    "Fuera de planta",
}

/** Qué decir cuando el paso está vacío, que es casi siempre al estrenarlo. */
const VACIO: Record<ClavePaso, string> = {
  orden_trabajo:
    "No hay ninguna orden esperando para arrancar. Acá caen las órdenes recién cargadas en Órdenes de Trabajo y también las que ya están en producción pero que todavía nadie escaneó en ninguna máquina.",
  extrusion:
    "Ninguna orden quedó en extrusión. Una orden aparece acá cuando el operario escanea el QR en la máquina, y se va cuando alguien la escanea en impresión.",
  impresion:
    "Ninguna orden quedó en impresión. Una orden aparece acá cuando el operario escanea el QR en la impresora, y se va cuando alguien la escanea en troquelado.",
  troquelado:
    "Ninguna orden quedó en troquelado. Una orden aparece acá cuando el operario escanea el QR en la máquina, y se va cuando le ponen estado «Completada».",
  finalizado:
    "Todavía no se cerró ninguna orden. Una orden cae acá cuando le ponen estado «Completada» en Órdenes de Trabajo.",
}

/** «3 trabajos», con el singular bien, que es lo que se lee en voz alta. */
const trabajos = (n: number) => (n === 1 ? "1 trabajo" : `${nf.format(n)} trabajos`)

/**
 * Las trabadas primero.
 *
 * El backend manda las más recientes primero, que es lo correcto para una
 * lista. Pero dentro de un paso la única cosa accionable es la orden que quedó
 * esperando la etapa siguiente: si está novena en la lista, no se ve. El resto
 * mantiene el orden que mandó el backend.
 */
function trabadasPrimero(paso: PasoTablero): OrdenEnPaso[] {
  const trabadas = paso.ordenes.filter((o) => estaTrabada(paso.clave, o.en_maquina))
  if (trabadas.length === 0 || trabadas.length === paso.ordenes.length) return paso.ordenes
  return [...trabadas, ...paso.ordenes.filter((o) => !estaTrabada(paso.clave, o.en_maquina))]
}

/**
 * Los cinco pasos sin datos, para el primer render y mientras carga.
 *
 * La tira se dibuja con «—» en vez de con cero: cero es un dato («no hay nada
 * en impresión») y todavía no se sabe. Además deja la altura puesta desde el
 * principio, así el dashboard no salta cuando contesta Railway.
 */
const PASOS_VACIOS: PasoTablero[] = [
  { clave: "orden_trabajo", numero: 1, titulo: "Orden de trabajo", total: 0, ordenes: [] },
  { clave: "extrusion",     numero: 2, titulo: "Extrusión",        total: 0, ordenes: [] },
  { clave: "impresion",     numero: 3, titulo: "Impresión",        total: 0, ordenes: [] },
  { clave: "troquelado",    numero: 4, titulo: "Troquelado",       total: 0, ordenes: [] },
  { clave: "finalizado",    numero: 5, titulo: "Finalizado",       total: 0, ordenes: [] },
]

export function OrdenesPorEtapa() {
  const { datos, falló } = useTablero()
  const [abierta, setAbierta] = useState<string | null>(null)

  // El panel se abre debajo de la tira, así que en el celular puede quedar
  // fuera de pantalla y el toque parece no haber hecho nada. `block: "nearest"`
  // no mueve nada si ya se ve, que es el caso de la tablet y la PC.
  const panelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (abierta) panelRef.current?.scrollIntoView({ block: "nearest" })
  }, [abierta])

  // `normalizar()` en `use-tablero` garantiza los cinco pasos y en orden, así
  // que acá no hay nada que armar: sólo decidir si ya hay dato o no.
  const aDibujar = datos?.pasos ?? PASOS_VACIOS
  const hayDatos = datos !== null

  return (
    <section className="eti-in relative overflow-hidden rounded-3xl bg-brand px-5 py-5 text-white shadow-[0_30px_60px_-34px_rgba(41,45,150,.9)] sm:px-6">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          {/* `text-primary-200` (#b3b5ff) y no un blanco apagado: sobre
              `bg-brand` da 5,74:1 y es un color de la marca, no un gris. */}
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary-200">
            Producción
          </p>
          {/* La pista va en la línea del TÍTULO, alineada por baseline con el
              `h2`, y no como hermana del bloque entero: la baseline de un
              bloque es la de su PRIMERA línea —acá, la de «PRODUCCIÓN»—, así
              que colgada de afuera quedaba flotando al lado del rótulo y
              despegada de lo que explica.

              Sigue sin ocupar renglón propio, que costaba 20 px de los 220
              que mide toda la tira. En el celular envuelve, que ahí sobra alto. */}
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="font-display text-[25px] leading-none tracking-tight">
              Órdenes por etapa
            </h2>
            <p className="text-sm font-semibold text-primary-200">
              apretá un paso para ver qué tiene adentro
            </p>
          </div>
        </div>
        {/* `hover:text-brand-yellow` y no `hover:text-gold`: sobre `bg-brand`
            (#292d96) `text-gold` usa `--gold-text`, que en tema claro es oliva
            (#8a7200) y da 2.35:1 — abajo del 4.5 de AA. `--etiplast-500`
            (#f5eb4a) es el mismo en los dos temas y da 8.83:1. */}
        <Link
          href="/ordenes"
          className="inline-flex shrink-0 items-center gap-1.5 border-b-2 border-gold pb-0.5 text-[13.5px] font-semibold text-white hover:text-brand-yellow"
        >
          Ver órdenes <ArrowRight aria-hidden className="size-3.5" />
        </Link>
      </div>

      {falló && !datos && (
        <p className="mb-4 rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-base font-bold">
          No se pudo leer el tablero de planta. Se reintenta solo.
        </p>
      )}

      {/* Siempre los cinco pasos, incluso vacíos: si un paso sin trabajo
          desapareciera, el 4 pasaría a estar en el lugar del 3 y el recorrido
          dejaría de leerse de corrido.

          En el celular la tira se para: los círculos van en una columna con la
          línea dorada vertical y el texto al lado. Sigue siendo el mismo
          recorrido —se lee de arriba abajo— pero cada paso tiene el ancho
          entero para su nombre. Medido a 390 px: en cinco columnas cada paso
          tiene 62 px y «Troquelado» en 15 px ocupa 72, así que los nombres se
          pisaban entre sí. Achicar la letra hasta que entre sería ilegible
          para alguien parado en la planta, que es quien mira esto. */}
      <ol className="grid grid-cols-1 sm:grid-cols-5">
        {aDibujar.map((p, i) => {
          const esta = abierta === p.clave
          const trabadas = p.ordenes.filter((o) => estaTrabada(p.clave, o.en_maquina)).length
          const cero = hayDatos && p.total === 0
          return (
            <li key={p.clave}>
              {/* `aria-label` completo porque el nombre que armaba el contenido
                  era «3 Extrusión En planta»: ese 3 son órdenes, pero se lee
                  pegado a un bloque numerado 1-5 y se confunde con el número de
                  paso. `DONDE` va DENTRO del label —el aria-label reemplaza al
                  contenido como nombre accesible— o el renglón de abajo queda
                  visible pero mudo, justo el dato que dice si el trabajo
                  todavía está en la planta. Las trabadas también: es el dato
                  accionable y con el aviso sólo en color un lector de pantalla
                  no se entera. */}
              <button
                type="button"
                id={idBoton(p.clave)}
                aria-expanded={esta}
                aria-controls={idPanel(p.clave)}
                aria-label={
                  hayDatos
                    ? `Paso ${p.numero}, ${p.titulo}, ${DONDE[p.clave]}: ${trabajos(p.total)}${
                        trabadas > 0 ? `, ${trabadas} esperando la etapa siguiente` : ""
                      }`
                    : `Paso ${p.numero}, ${p.titulo}, ${DONDE[p.clave]}`
                }
                disabled={!hayDatos}
                onClick={() => setAbierta(esta ? null : p.clave)}
                className="group flex w-full items-stretch gap-3 rounded-2xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:cursor-default sm:block sm:gap-0 sm:text-center"
              >
                {/* El círculo SOBRE la línea, no la línea por detrás de todo.
                    Los dos medios tramos se dibujan acá adentro y se ubican
                    solos contra el centro del círculo: sin esto habría que
                    adivinar un `top:` en píxeles para una línea suelta y se
                    desalinea con cualquier cambio de tipografía. El primer
                    paso no dibuja el tramo de antes y el último no dibuja el
                    de después, así la línea arranca y termina en un círculo.

                    Vertical en el celular y horizontal de `sm` para arriba.
                    `items-stretch` en el botón le da a esta columna el alto
                    entero del renglón, así los tramos de dos pasos seguidos se
                    tocan y la línea queda continua. */}
                <span
                  aria-hidden
                  className="relative flex w-10 shrink-0 items-center justify-center sm:h-[34px] sm:w-full"
                >
                  {i > 0 && (
                    <span className="absolute left-1/2 top-0 h-1/2 w-[3px] -translate-x-1/2 bg-gold sm:left-0 sm:top-1/2 sm:h-[3px] sm:w-1/2 sm:translate-x-0 sm:-translate-y-1/2" />
                  )}
                  {i < aDibujar.length - 1 && (
                    <span className="absolute left-1/2 top-1/2 h-1/2 w-[3px] -translate-x-1/2 bg-gold sm:left-1/2 sm:h-[3px] sm:w-1/2 sm:translate-x-0 sm:-translate-y-1/2" />
                  )}
                  <span
                    className={`relative z-10 grid size-[34px] place-items-center rounded-full border-[2.5px] border-gold font-display text-[15px] font-bold transition group-hover:shadow-[0_0_0_5px_rgba(245,235,74,.22)] ${
                      esta
                        ? "bg-gold text-brand shadow-[0_0_0_4px_rgba(245,235,74,.18)]"
                        : "bg-brand text-brand-yellow"
                    }`}
                  >
                    {p.numero}
                  </span>
                </span>

                {/* El fondo del hover y del abierto va en el bloque de texto y
                    no en el botón entero: sobre el botón taparía la línea
                    dorada justo en el paso que se está señalando. */}
                <span
                  className={`flex flex-1 flex-col justify-center rounded-xl px-2 py-2.5 transition group-hover:bg-white/10 sm:mt-1.5 sm:block sm:px-1 sm:py-1 ${
                    esta ? "bg-white/10" : ""
                  }`}
                >
                  {/* En el celular el número y el nombre del paso van en el
                      MISMO renglón: apilados, cinco pasos se comen media
                      pantalla. */}
                  <span className="flex items-baseline gap-2.5 sm:block">
                    {/* El paso en cero se atenúa cambiando de color, NO con
                        `opacity`: `primary-200` al 55 % sobre `bg-brand`
                        compone #7578d0 y da 2,75:1, abajo del 4,5 de AA. A
                        full da 5,74:1 y se sigue leyendo como «acá no hay
                        nada». */}
                    <span
                      className={`font-display text-[30px] font-semibold leading-none tabular-nums sm:block sm:text-[32px] ${
                        cero ? "text-primary-200" : "text-white"
                      }`}
                    >
                      {hayDatos ? nf.format(p.total) : "—"}
                    </span>
                    <span className="text-[15px] font-bold leading-tight text-white sm:mt-1 sm:block">
                      {p.titulo}
                    </span>
                  </span>
                  {/* El aviso de trabadas reemplaza al rótulo de ubicación: es
                      lo único de la tira sobre lo que hay que hacer algo, y
                      esperar a que alguien abra el paso para enterarse lo
                      esconde. Cuando no hay ninguna, todas las órdenes del paso
                      están en una máquina y el rótulo no miente. */}
                  {trabadas > 0 ? (
                    <span className="mt-1 flex items-center gap-1 text-[13px] font-bold leading-tight text-brand-yellow sm:mt-0.5 sm:justify-center">
                      <AlertTriangle aria-hidden className="size-3.5 shrink-0" />
                      {trabadas === 1 ? "1 esperando" : `${trabadas} esperando`}
                    </span>
                  ) : (
                    <span className="mt-1 block text-[13px] font-semibold leading-tight text-primary-200 sm:mt-0.5">
                      {DONDE[p.clave]}
                    </span>
                  )}
                </span>
              </button>
            </li>
          )
        })}
      </ol>

      <Canceladas datos={datos} />

      {/* Un panel por paso (ver `idPanel`), dentro de la MISMA tarjeta y sobre
          `bg-primary-700`: antes caía en un panel suelto 200 px más abajo y no
          se veía de dónde había salido. Abierto, el círculo del paso queda
          pintado de dorado, que es la otra mitad de esa pista. */}
      {aDibujar.map((p) => {
        const esta = abierta === p.clave
        return (
          <div
            key={p.clave}
            ref={esta ? panelRef : null}
            id={idPanel(p.clave)}
            role="region"
            aria-labelledby={idBoton(p.clave)}
            hidden={!esta}
            className="mt-4 rounded-2xl bg-primary-700 p-4 sm:p-5"
          >
            {esta && <Panel paso={p} />}
          </div>
        )
      })}
    </section>
  )
}

/**
 * El contenido de un paso abierto.
 *
 * Separado del acordeón porque sólo se arma para el paso abierto: adentro del
 * `.map` el `esta &&` ya lo evitaba, pero con el filtro de trabadas y la
 * cabecera el bloque pasó a ser más largo que el acordeón que lo contiene.
 */
function Panel({ paso }: { paso: PasoTablero }) {
  const items = trabadasPrimero(paso)
  const trabadas = items.filter((o) => estaTrabada(paso.clave, o.en_maquina)).length
  // Misma redacción en los cinco pasos y en `/planificacion`: es el mismo
  // recorte y tiene que decirse igual en todos lados. Importa sobre todo en el
  // paso 5, que es el que junta órdenes para siempre.
  const nota =
    items.length < paso.total ? `se ven las ${nf.format(items.length)} más recientes` : null

  return (
    <>
      {/* `text-primary-300` sobre `bg-primary-700` da 4,99:1. Sobre el azul de
          marca pelado daría 3,84:1 y no alcanzaría — por eso el panel tiene su
          propio fondo y no es simplemente un bloque más de la tarjeta. */}
      <h3 className="mb-3 text-[12px] font-bold uppercase tracking-[0.16em] text-primary-300">
        Paso {paso.numero} · {paso.titulo} · {trabajos(paso.total)}
        {nota && <> · {nota}</>}
      </h3>

      {/* El aviso explica qué significa el ámbar de los renglones de abajo. Va
          antes de la lista: si va después, el que ve el renglón ámbar primero
          no sabe qué le están diciendo. */}
      {trabadas > 0 && (
        <p className="mb-3 flex items-start gap-2 rounded-xl border border-amber-300/50 border-l-[6px] border-l-amber-300 bg-amber-300/10 px-4 py-3 text-base font-bold">
          <AlertTriangle aria-hidden className="mt-0.5 size-5 shrink-0 text-amber-200" />
          <span>
            {trabadas === 1
              ? "Hay 1 orden que terminó este paso y nadie la escaneó en el siguiente."
              : `Hay ${nf.format(trabadas)} órdenes que terminaron este paso y nadie las escaneó en el siguiente.`}{" "}
            Están en la planta, pero en ninguna máquina.
          </span>
        </p>
      )}

      {items.length === 0 ? (
        <p className="max-w-[70ch] text-base font-semibold text-white">{VACIO[paso.clave]}</p>
      ) : (
        <ul className="divide-y divide-white/10">
          {items.map((o) => (
            <li key={o.id}>
              <Renglon clave={paso.clave} orden={o} />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

/**
 * Una orden dentro de un paso abierto.
 *
 * Las dos situaciones de un paso de planta NO se pueden ver iguales:
 *
 *  - en la máquina ahora → renglón normal
 *  - trabada entre dos etapas → ámbar + barra gruesa a la izquierda + ícono
 *
 * Tres señales y no sólo el color: el que mira el tablero de la planta puede
 * ser daltónico, y la pantalla de la oficina se mira de lejos y de costado. La
 * barra gruesa es lo que se ve primero desde tres metros.
 *
 * Esta distinción es lo único accionable del bloque: dice entre qué dos etapas
 * se quedó una orden.
 */
function Renglon({ clave, orden }: { clave: ClavePaso; orden: OrdenEnPaso }) {
  const trabada = estaTrabada(clave, orden.en_maquina)
  const siguiente = SIGUIENTE_DE[clave]

  return (
    <Link
      href={`/ordenes?buscar=${orden.numero}`}
      className={`flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-lg py-2.5 pr-3 transition hover:bg-white/10 ${
        trabada ? "border-l-[5px] border-l-amber-300 bg-amber-300/10 pl-3" : "pl-1"
      }`}
    >
      {/* Sobre `bg-primary-700` el amarillo de marca da 11,46:1.
          `text-brand-yellow` y no `text-gold`: en tema claro `text-gold` es
          oliva y este fondo azul no cambia con el tema. */}
      <span className="min-w-[88px] text-[15px] font-bold text-brand-yellow">{orden.numero}</span>
      <span className="min-w-0 flex-1 text-[15px] font-bold text-white">
        {orden.producto ?? "Sin producto cargado"}
      </span>
      <span className="text-sm font-semibold text-primary-200">{orden.cliente ?? "Sin cliente"}</span>

      {trabada && siguiente && (
        <span className="flex items-center gap-1.5 text-sm font-bold text-amber-200">
          <AlertTriangle aria-hidden className="size-4 shrink-0" />
          Esperando {siguiente}
        </span>
      )}

      <span className="flex flex-wrap gap-x-3 text-sm font-semibold text-primary-200">
        {orden.maquina && <span>{orden.maquina}</span>}
        {orden.operario && <span>{orden.operario}</span>}
        {/* En el paso 5 el día y no el «hace tanto»: de una orden cerrada lo
            que se busca es la fecha de cierre. En los otros cuatro es al
            revés —«hace 6 días» es un problema y «06/11» no dice nada sin
            hacer la cuenta—, y en una trabada es EL dato. */}
        {orden.desde && (
          <span>
            {clave === "finalizado"
              ? fechaCorta(orden.desde)
              : trabada
                ? `trabada ${desdeHace(orden.desde)}`
                : desdeHace(orden.desde)}
          </span>
        )}
      </span>
    </Link>
  )
}

/**
 * Las canceladas, que no caen en ningún paso.
 *
 * Tienen que estar escritas en algún lado: el tablero reparte cada orden en uno
 * de los cinco pasos menos éstas, y si el número no aparece, la suma de los
 * cinco pasos no cierra contra el total de órdenes y parece que el tablero
 * perdió trabajo otra vez.
 */
function Canceladas({ datos }: { datos: TableroProduccion | null }) {
  const n = datos?.resumen?.canceladas ?? 0
  if (n === 0) return null
  return (
    <p className="mt-3 text-[13px] font-semibold text-primary-200">
      {n === 1
        ? "Además hay 1 orden cancelada, que no entra en ningún paso."
        : `Además hay ${nf.format(n)} órdenes canceladas, que no entran en ningún paso.`}
    </p>
  )
}
