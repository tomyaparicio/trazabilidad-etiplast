"use client"

/**
 * Los cinco pasos que recorre una orden, en el dashboard, en vivo y abribles.
 *
 * Reemplaza al bloque que se llamaba «Órdenes por etapa» y mostraba
 * borrador / pendientes / en producción / completadas. Eso son los ESTADOS de
 * la orden (`ordenes_trabajo.estado`), no el recorrido del trabajo: el título
 * mentía. El recorrido es el que contesta `GET /api/produccion/tablero`:
 *
 *   1  Orden de trabajo   emitida, sin arrancar   (`pendientes`)
 *   2  Extrusión                                  (`etapas`, etapa extrusion)
 *   3  Impresión                                  (`maquinas` con orden)
 *   4  Troquelado                                 (`etapas`, etapa troquelado)
 *   5  Finalizado         fuera de planta         (`finalizadas`)
 *
 * Estos números NO son los ①②③ de la ficha impresa, y está bien: el papel
 * numera las tres cosas que hace el operario en la máquina, esta pantalla
 * numera el recorrido completo de la orden. Son dos audiencias distintas —el
 * que está en la máquina y el que mira la planta de arriba— así que no tienen
 * por qué coincidir. La ficha impresa no se toca.
 *
 * Los pasos 2, 3 y 4 salen de los escaneos del QR. El 1 y el 5 no: el 1 es la
 * orden recién cargada en Órdenes de Trabajo, y al 5 llega cuando alguien le
 * pone estado «completada».
 *
 * Cada paso se abre y muestra qué tiene adentro, porque el número solo no
 * alcanza: «3 en impresión» no dice cuáles, en qué máquina ni desde cuándo.
 *
 * El dato lo trae `useTablero()`, compartido con `PlantaEnVivo`: los dos
 * bloques se dibujan juntos en esta pestaña y antes cada uno pedía el mismo
 * endpoint cada 15 s por su cuenta.
 */
import type { EtapaProduccion, OrdenEnMaquina, TableroProduccion } from "@/lib/api/types"
import { desdeHace, fechaCorta } from "@/lib/fechas"
import { useTablero } from "@/lib/use-tablero"
import { ArrowRight, ChevronDown } from "lucide-react"
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

/** Una orden dentro de un paso, ya aplanada: la lista se dibuja igual en los 5. */
type ItemPaso = {
  clave: string
  numero: string
  cliente: string | null
  producto: string | null
  /** Sólo impresión: en extrusión y troquelado las máquinas son intercambiables */
  maquina?: string | null
  operario?: string | null
  /** Hace cuánto que está acá: el escaneo (pasos 2 a 4) o la emisión (paso 1) */
  desde?: string | null
  /** Día de cierre — sólo el paso 5, que no sale de un escaneo */
  fecha?: string | null
}

type Paso = {
  clave: string
  /** El lugar en el recorrido de la orden (1 a 5). No es el número de la ficha impresa. */
  numero: number
  titulo: string
  /** Renglón corto arriba del número: dónde está el trabajo cuando está acá */
  donde: string
  cuenta: number
  items: ItemPaso[]
  /** Aviso de que la lista viene recortada: le pasa a los pasos 1 y 5 */
  nota: string | null
  /** Qué decir cuando el paso está vacío, que es casi siempre al estrenarlo */
  vacio: string
}

function aItem(o: OrdenEnMaquina, maquina?: string): ItemPaso {
  return {
    clave: `${maquina ?? o.etapa}-${o.id}`,
    numero: o.numero,
    cliente: o.cliente,
    producto: o.producto,
    maquina,
    operario: o.operario,
    desde: o.desde,
  }
}

function armarPasos(t: TableroProduccion): Paso[] {
  const ordenesDe = (etapa: EtapaProduccion) =>
    t.etapas.find((e) => e.etapa === etapa)?.ordenes ?? []

  const extrusion = ordenesDe("extrusion")
  const troquelado = ordenesDe("troquelado")

  // `maquinas` ya viene filtrada por el backend a las etapas que eligen máquina
  // —hoy sólo impresión, ver `ETAPAS_CON_MAQUINA`— así que una máquina ocupada
  // es una impresora trabajando. Las de extrusión y troquelado nunca llegan acá.
  const impresoras = t.maquinas.filter((m) => m.orden)

  // Los totales reales. `resumen.pendientes` y `resumen.finalizadas` son el
  // largo de cada lista, que el backend recorta: mostrar esos números dejaría
  // la card diciendo «20» para siempre. Los `??` cubren la ventana de deploy en
  // la que el front ya es nuevo y la API todavía no manda el campo (Vercel y
  // Railway van separados).
  const pendientes = t.pendientes ?? []
  const pendientesTotal = t.resumen?.pendientes_total ?? pendientes.length
  const finalizadasTotal = t.resumen?.finalizadas_total ?? t.finalizadas.length

  return [
    {
      clave: "orden",
      numero: 1,
      titulo: "Orden de trabajo",
      donde: "Antes de planta",
      cuenta: pendientesTotal,
      items: pendientes.map((o) => ({
        clave: `pend-${o.id}`,
        numero: o.numero,
        cliente: o.cliente,
        producto: o.producto,
        // `desde` y no `fecha`: de una orden que todavía no arrancó lo que
        // importa es hace cuánto que espera, no el día en que se emitió.
        desde: o.fecha,
      })),
      // Misma redacción que el paso Finalizado: es el mismo recorte y tiene que
      // decirse igual en los dos lados.
      nota:
        pendientes.length < pendientesTotal
          ? `se ven los primeros ${nf.format(pendientes.length)}`
          : null,
      vacio:
        "No hay ninguna orden esperando para arrancar. Una orden aparece acá en cuanto se carga en Órdenes de Trabajo, y se va cuando el operario escanea el QR en la primera máquina.",
    },
    {
      clave: "extrusion",
      numero: 2,
      titulo: "Extrusión",
      donde: "En planta",
      cuenta: extrusion.length,
      items: extrusion.map((o) => aItem(o)),
      nota: null,
      vacio: "Ninguna orden escaneada en extrusión. Aparecen acá cuando el operario escanea el QR de la orden en la máquina.",
    },
    {
      clave: "impresion",
      numero: 3,
      titulo: "Impresión",
      donde: "En máquina",
      cuenta: impresoras.length,
      items: impresoras.map((m) => aItem(m.orden!, m.nombre)),
      nota: null,
      vacio:
        t.maquinas.length === 0
          ? "No hay impresoras cargadas en el sistema."
          : `Las ${nf.format(t.maquinas.length)} impresoras están libres: ninguna orden escaneada en impresión.`,
    },
    {
      clave: "troquelado",
      numero: 4,
      titulo: "Troquelado",
      donde: "En planta",
      cuenta: troquelado.length,
      items: troquelado.map((o) => aItem(o)),
      nota: null,
      vacio: "Ninguna orden escaneada en troquelado. Aparecen acá cuando el operario escanea el QR de la orden en la máquina.",
    },
    {
      clave: "finalizado",
      numero: 5,
      titulo: "Finalizado",
      donde: "Fuera de planta",
      cuenta: finalizadasTotal,
      items: t.finalizadas.map((o) => ({
        clave: `fin-${o.id}`,
        numero: o.numero,
        cliente: o.cliente,
        producto: o.producto,
        fecha: o.fecha,
      })),
      // Misma redacción que el tablero de `/planificacion` y que el depósito:
      // es el mismo recorte y tiene que decirse igual en los tres lados.
      nota:
        t.finalizadas.length < finalizadasTotal
          ? `se ven los primeros ${nf.format(t.finalizadas.length)}`
          : null,
      vacio:
        "Todavía no se cerró ninguna orden. Una orden cae acá cuando le ponen estado «Completada» en Órdenes de Trabajo.",
    },
  ]
}

/**
 * Los cinco pasos sin datos, para el primer render y mientras carga.
 *
 * La card se dibuja con «—» en vez de con cero: cero es un dato («no hay nada
 * en impresión») y todavía no se sabe. Además deja la altura puesta desde el
 * principio, así el dashboard no salta cuando contesta Railway.
 */
const PASOS_VACIOS: Paso[] = [
  { clave: "orden",      numero: 1, titulo: "Orden de trabajo", donde: "Antes de planta", cuenta: 0, items: [], nota: null, vacio: "" },
  { clave: "extrusion",  numero: 2, titulo: "Extrusión",        donde: "En planta",       cuenta: 0, items: [], nota: null, vacio: "" },
  { clave: "impresion",  numero: 3, titulo: "Impresión",        donde: "En máquina",      cuenta: 0, items: [], nota: null, vacio: "" },
  { clave: "troquelado", numero: 4, titulo: "Troquelado",       donde: "En planta",       cuenta: 0, items: [], nota: null, vacio: "" },
  { clave: "finalizado", numero: 5, titulo: "Finalizado",       donde: "Fuera de planta", cuenta: 0, items: [], nota: null, vacio: "" },
]

/** «3 trabajos», con el singular bien, que es lo que se lee en voz alta. */
const trabajos = (n: number) => (n === 1 ? "1 trabajo" : `${nf.format(n)} trabajos`)

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

  const pasos = datos ? armarPasos(datos) : null
  const aDibujar = pasos ?? PASOS_VACIOS

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
                    confunde con el número de paso. */}
                <button
                  type="button"
                  id={idBoton(p.clave)}
                  aria-expanded={esta}
                  aria-controls={idPanel(p.clave)}
                  // `p.donde` va DENTRO del label: el aria-label reemplaza al
                  // contenido del botón como nombre accesible, así que sin esto
                  // el renglón «Antes de planta» / «En máquina» queda visible
                  // pero mudo — justo el dato que dice si el trabajo todavía
                  // está en la planta.
                  aria-label={
                    pasos
                      ? `Paso ${p.numero}, ${p.titulo}, ${p.donde}: ${trabajos(p.cuenta)}`
                      : `Paso ${p.numero}, ${p.titulo}, ${p.donde}`
                  }
                  disabled={!pasos}
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
                    {p.donde}
                  </span>
                  <p className="mt-3 font-display text-[40px] font-semibold leading-none tabular-nums">
                    {pasos ? nf.format(p.cuenta) : "—"}
                  </p>
                  <p className="mt-1.5 text-base font-bold">{p.titulo}</p>
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
            {esta && (
              <>
                <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h3 className="font-display text-xl font-semibold">
                    Paso {p.numero} · {p.titulo}
                  </h3>
                  <p className="text-sm font-bold uppercase tracking-wider text-white/70">
                    {trabajos(p.cuenta)}
                    {p.nota && <> · {p.nota}</>}
                  </p>
                </div>

                {p.items.length === 0 ? (
                  <p className="max-w-[70ch] text-base font-semibold text-white/80">{p.vacio}</p>
                ) : (
                  <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {p.items.map((o) => (
                      <li key={o.clave}>
                        <Link
                          href={`/ordenes?buscar=${o.numero}`}
                          className="block h-full rounded-xl border border-white/15 bg-brand/40 p-4 transition hover:border-gold"
                        >
                          <p className="text-lg font-extrabold leading-tight">
                            {o.producto ?? "Sin producto cargado"}
                          </p>
                          {/* Mismo caso que el link del encabezado: el fondo de
                              la tarjeta compone #33379b, donde `text-gold` en
                              claro da 2.08:1 y `text-brand-yellow` da 7.81:1. */}
                          <p className="mt-1 text-base font-bold text-brand-yellow">{o.numero}</p>
                          <p className="text-base font-semibold text-white/85">
                            {o.cliente ?? "Sin cliente"}
                          </p>
                          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm font-semibold text-white/70">
                            {o.maquina && <span>{o.maquina}</span>}
                            {o.operario && <span>{o.operario}</span>}
                            {o.desde && <span>{desdeHace(o.desde)}</span>}
                            {o.fecha && <span>{fechaCorta(o.fecha)}</span>}
                          </p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        )
      })}
    </section>
  )
}
