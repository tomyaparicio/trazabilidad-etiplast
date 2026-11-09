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
 * El dato lo trae `useTablero()`, compartido con `PlantaEnVivo` y con
 * `/planificacion`: antes cada uno pedía el mismo endpoint cada 15 s por su
 * cuenta.
 */
import {
  SIGUIENTE_DE, estaTrabada,
  type ClavePaso, type OrdenEnPaso, type PasoTablero, type TableroProduccion,
} from "@/lib/api/types"
import { desdeHace, fechaCorta } from "@/lib/fechas"
import { useTablero } from "@/lib/use-tablero"
import { AlertTriangle, ArrowRight, ChevronDown } from "lucide-react"
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
 * Los cinco paneles se dibujan siempre y a lo ancho, debajo de la fila de
 * pasos —no dentro del `<li>`—: en xl los pasos van en cinco columnas de
 * ~220 px y una lista de órdenes ahí adentro queda ilegible. Están siempre en
 * el DOM (ocultos con `hidden`) para que `aria-controls` apunte siempre a un
 * elemento que existe; el contenido se arma sólo para el que está abierto.
 */
const idPanel = (clave: string) => `paso-${clave}-panel`
const idBoton = (clave: string) => `paso-${clave}-boton`

/**
 * Renglón corto arriba del número: dónde está el trabajo cuando está acá.
 *
 * Los tres pasos de planta dicen «En planta» y no «En máquina»: en un paso de
 * planta puede haber órdenes que pasaron por la etapa y están esperando la
 * siguiente, o sea en la planta pero NO en una máquina. Ese detalle lo dice
 * cada tarjeta, que es donde se puede decir sin mentir sobre las demás.
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
 * La card se dibuja con «—» en vez de con cero: cero es un dato («no hay nada
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

  // El panel se abre debajo de la fila de pasos, así que en el celular —donde
  // las cinco cards van una abajo de la otra— puede quedar fuera de pantalla y
  // el toque parece no haber hecho nada. `block: "nearest"` no mueve nada si ya
  // se ve, que es el caso de la tablet y la PC.
  const panelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (abierta) panelRef.current?.scrollIntoView({ block: "nearest" })
  }, [abierta])

  // `normalizar()` en `use-tablero` garantiza los cinco pasos y en orden, así
  // que acá no hay nada que armar: sólo decidir si ya hay dato o no.
  const aDibujar = datos?.pasos ?? PASOS_VACIOS
  const hayDatos = datos !== null

  return (
    <section className="eti-in relative overflow-hidden rounded-3xl bg-brand p-5 text-white shadow-[0_30px_60px_-34px_rgba(41,45,150,.9)] sm:p-6">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">Producción</p>
          <h2 className="mt-1.5 font-display text-[25px] tracking-tight">Órdenes por etapa</h2>
          <p className="mt-1 text-sm font-medium text-white/70">
            Dónde está cada trabajo ahora · apretá un paso para ver qué tiene adentro
          </p>
        </div>
        {/* `hover:text-brand-yellow` y no `hover:text-gold`: sobre `bg-brand`
            (#292d96) `text-gold` usa `--gold-text`, que en tema claro es oliva
            (#8a7200) y da 2.35:1 — abajo del 4.5 de AA. `--etiplast-500`
            (#f5eb4a) es el mismo en los dos temas y da 8.83:1. */}
        <Link
          href="/ordenes"
          className="inline-flex shrink-0 items-center gap-1.5 border-b-2 border-gold pb-0.5 text-[13.5px] font-semibold text-white hover:text-brand-yellow"
        >
          Ver órdenes <ArrowRight className="size-3.5" />
        </Link>
      </div>

      {falló && !datos && (
        <p className="mb-5 rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-base font-bold">
          No se pudo leer el tablero de planta. Se reintenta solo.
        </p>
      )}

      <Canceladas datos={datos} />

      <div className="relative">
        {/* `bg-gold` usa `--gold`, que vale #f5eb4a en los dos temas: los fills
            dorados (bg/border/ring) no tienen el problema de `text-gold`. */}
        <div aria-hidden className="pointer-events-none absolute left-[10%] right-[10%] top-6 hidden h-[3px] rounded-full bg-gold xl:block" />

        {/* Siempre los cinco pasos, incluso vacíos: si un paso sin trabajo
            desapareciera, el 4 pasaría a estar en el lugar del 3 y el recorrido
            dejaría de leerse de corrido.

            Las ilustraciones del bloque viejo (`/dashboard/kpis/*.png`) no
            siguen: estaban dibujadas para los estados (el borrador con lápiz,
            la bobina con reloj) y no hay ninguna que represente extrusión —una
            ilustración que no es de su paso confunde más de lo que decora—, y
            además ocupaban la esquina superior derecha, justo donde ahora va el
            chevron de abrir. */}
        <ol className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-5">
          {aDibujar.map((p) => {
            const esta = abierta === p.clave
            const trabadas = p.ordenes.filter((o) => estaTrabada(p.clave, o.en_maquina)).length
            return (
              <li key={p.clave} className="relative">
                {/* `aria-hidden` en el número del paso: va FUERA del botón, así
                    que se leería suelto justo antes de la cuenta de órdenes y
                    los dos números se confunden. El botón ya lo dice en su
                    `aria-label`. */}
                <div aria-hidden className="relative z-20 flex justify-center">
                  <span className="grid size-12 place-items-center rounded-full bg-gold font-display text-lg font-semibold text-brand shadow-[0_0_0_4px_rgba(245,235,74,.15)]">
                    {p.numero}
                  </span>
                </div>
                {/* `aria-label` completo porque el nombre que armaba el
                    contenido era «En planta 3 Extrusión Ver»: ese 3 son
                    órdenes, pero se lee pegado a un bloque numerado 1-5 y se
                    confunde con el número de paso. Las trabadas también van en
                    el label: es el dato accionable y con el aviso sólo en color
                    un lector de pantalla no se entera. */}
                <button
                  type="button"
                  id={idBoton(p.clave)}
                  aria-expanded={esta}
                  aria-controls={idPanel(p.clave)}
                  // `DONDE` va DENTRO del label: el aria-label reemplaza al
                  // contenido del botón como nombre accesible, así que sin esto
                  // el renglón «Antes de planta» / «En planta» queda visible
                  // pero mudo — justo el dato que dice si el trabajo todavía
                  // está en la planta.
                  aria-label={
                    hayDatos
                      ? `Paso ${p.numero}, ${p.titulo}, ${DONDE[p.clave]}: ${trabajos(p.total)}${
                          trabadas > 0 ? `, ${trabadas} esperando la etapa siguiente` : ""
                        }`
                      : `Paso ${p.numero}, ${p.titulo}, ${DONDE[p.clave]}`
                  }
                  disabled={!hayDatos}
                  onClick={() => setAbierta(esta ? null : p.clave)}
                  className={`relative mt-4 block min-h-[172px] w-full rounded-2xl border bg-white/[0.06] p-5 text-left transition hover:bg-white/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:cursor-default disabled:hover:bg-white/[0.06] ${
                    esta ? "border-gold bg-white/[0.12]" : "border-white/10"
                  }`}
                >
                  {/* `text-sm` + `text-white/80` y no `text-[11px]` +
                      `text-white/55`: este renglón es el único que dice si el
                      trabajo está físicamente en la planta o ya salió, y lo lee
                      gente grande parada en la planta.
                      Los contrastes van medidos contra el fondo REAL del botón
                      —`bg-white/[0.06]` compuesto sobre el navy de marca, o sea
                      #363a9c—, no contra el navy pelado: 6,65:1 el que quedó,
                      4,01:1 el que había (AA pide 4,5:1). */}
                  <span className="text-sm font-bold uppercase tracking-[0.16em] text-white/80">
                    {DONDE[p.clave]}
                  </span>
                  <p className="mt-3 font-display text-[40px] font-semibold leading-none tabular-nums">
                    {hayDatos ? nf.format(p.total) : "—"}
                  </p>
                  <p className="mt-1.5 text-base font-bold">{p.titulo}</p>
                  {/* El aviso de trabadas viaja con el contador: es lo único de
                      la card sobre lo que hay que hacer algo, y esperar a que
                      alguien abra el paso para enterarse lo esconde. */}
                  {trabadas > 0 && (
                    <p className="mt-2 flex items-center gap-1.5 text-[13px] font-bold text-amber-200">
                      <AlertTriangle aria-hidden className="size-4 shrink-0" />
                      {trabadas === 1 ? "1 esperando" : `${trabadas} esperando`}
                    </p>
                  )}
                  <span className="mt-4 flex items-center gap-3">
                    <span className="h-px flex-1 bg-white/15" />
                    <span className="flex items-center gap-1 text-[13px] font-bold text-brand-yellow">
                      {esta ? "Cerrar" : "Ver"}
                      <ChevronDown
                        aria-hidden
                        className={`size-4 transition-transform duration-200 ${esta ? "rotate-180" : ""}`}
                      />
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      </div>

      {/* Un panel por paso, a lo ancho y debajo de la fila (ver `idPanel`).
          Abierto, el paso queda marcado con el borde dorado, así se ve de dónde
          salió el panel. */}
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
            className="mt-5 rounded-2xl border border-white/15 bg-white/[0.08] p-5"
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
  // recorte y tiene que decirse igual en todos lados.
  const nota =
    items.length < paso.total ? `se ven las ${nf.format(items.length)} más recientes` : null

  return (
    <>
      <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="font-display text-xl font-semibold">
          Paso {paso.numero} · {paso.titulo}
        </h3>
        <p className="text-sm font-bold uppercase tracking-wider text-white/70">
          {trabajos(paso.total)}
          {nota && <> · {nota}</>}
        </p>
      </div>

      {/* El aviso explica qué significa el color de las tarjetas de abajo. Va
          antes de la lista: si va después, el que ve la tarjeta amarilla
          primero no sabe qué le están diciendo. */}
      {trabadas > 0 && (
        <p className="mb-4 flex items-start gap-2 rounded-xl border border-amber-300/50 border-l-[6px] border-l-amber-300 bg-amber-300/10 px-4 py-3 text-base font-bold">
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
        <p className="max-w-[70ch] text-base font-semibold text-white/80">{VACIO[paso.clave]}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((o) => (
            <li key={o.id}>
              <Tarjeta clave={paso.clave} orden={o} />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

/**
 * Una orden dentro de un paso.
 *
 * Las dos situaciones de un paso de planta NO se pueden ver iguales:
 *
 *  - en la máquina ahora → tarjeta normal
 *  - trabada entre dos etapas → amarillo + barra gruesa a la izquierda + ícono
 *
 * Tres señales y no sólo el color: el que mira el tablero de la planta puede
 * ser daltónico, y la pantalla de la oficina se mira de lejos y de costado. La
 * barra gruesa es lo que se ve primero desde tres metros.
 *
 * Esta distinción es lo único accionable de toda la pantalla: dice entre qué
 * dos etapas se quedó una orden.
 */
function Tarjeta({ clave, orden }: { clave: ClavePaso; orden: OrdenEnPaso }) {
  const trabada = estaTrabada(clave, orden.en_maquina)
  const siguiente = SIGUIENTE_DE[clave]

  return (
    <Link
      href={`/ordenes?buscar=${orden.numero}`}
      className={`block h-full rounded-xl border p-4 transition ${
        trabada
          ? "border-amber-300/60 border-l-[6px] border-l-amber-300 bg-amber-300/[0.08] hover:border-amber-200"
          : "border-white/15 bg-brand/40 hover:border-gold"
      }`}
    >
      <p className="text-lg font-extrabold leading-tight">
        {orden.producto ?? "Sin producto cargado"}
      </p>
      {/* Mismo caso que el link del encabezado: el fondo de la tarjeta compone
          #33379b, donde `text-gold` en claro da 2.08:1 y `text-brand-yellow`
          da 7.81:1. */}
      <p className="mt-1 text-base font-bold text-brand-yellow">{orden.numero}</p>
      <p className="text-base font-semibold text-white/85">{orden.cliente ?? "Sin cliente"}</p>

      {trabada && siguiente && (
        <p className="mt-2 flex items-start gap-1.5 text-base font-bold text-amber-200">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
          Esperando {siguiente}
        </p>
      )}

      <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm font-semibold text-white/70">
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
      </p>
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
    <p className="mb-5 text-sm font-semibold text-white/70">
      {n === 1
        ? "Además hay 1 orden cancelada, que no entra en ningún paso."
        : `Además hay ${nf.format(n)} órdenes canceladas, que no entran en ningún paso.`}
    </p>
  )
}
