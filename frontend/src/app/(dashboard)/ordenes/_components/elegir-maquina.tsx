"use client"

import { useEffect, useState } from "react"
import { ChevronLeft, Printer, Sticker, TriangleAlert, type LucideIcon } from "lucide-react"
import { api } from "@/lib/api"
import type { Maquina } from "@/lib/api/types"

/**
 * Paso 0 del alta de una orden de trabajo: en qué máquina se imprime.
 *
 * Va primero porque el formulario cambia según la marca de impresora, así que
 * hasta que no se elige no tiene sentido mostrar el resto.
 */

export type MaquinaElegida = {
  /** Id estable para ramificar el formulario por marca (no se guarda). */
  id: string
  /** Lo que ve la gente de planta. */
  label: string
  /**
   * Lo que viaja al backend en `impresion_maquina`. Tiene que ser el nombre (o
   * el código) de una máquina activa del catálogo: el backend rechaza con 400
   * cualquier otra cosa.
   */
  valor: string
}

type Opcion = MaquinaElegida & {
  icon: LucideIcon
  /** Otros nombres con los que la misma máquina figura en el catálogo. */
  alias: string[]
}

/** Sin acentos, sin espacios y en minúscula: «Reina Flex» y «ReinaFlex» son la misma. */
function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "")
}

/**
 * Las tres impresoras que la empresa reconoce. El catálogo manda (de ahí sale
 * el nombre real que se guarda), pero estas tres se ofrecen siempre: si la API
 * no responde, el alta no se puede frenar por eso.
 *
 * «Taurus» y «Impresora Autoadhesiva» son la MISMA máquina — el dueño la llama
 * autoadhesiva — así que las dos filas del catálogo caen en la misma tarjeta.
 */
const CANONICAS: {
  id: string
  label: string
  icon: LucideIcon
  /** Nombres y códigos EXACTOS (normalizados) de esta misma máquina.
   *  Exactos y no "contiene": si mañana cargan «Autoadhesiva 2», es otra
   *  máquina y tiene que aparecer como tarjeta propia, no quedar absorbida
   *  acá adentro y sin poder elegirse. */
  claves: string[]
  /** Entre varias filas de la misma máquina, cuál es la preferida para guardar. */
  preferida?: string
  /** Qué mandar si el catálogo no se pudo leer. */
  valorPorDefecto: string
}[] = [
  {
    id: "venus",
    label: "Venus",
    icon: Printer,
    claves: ["venus"],
    valorPorDefecto: "Venus",
  },
  {
    id: "reinaflex",
    label: "ReinaFlex",
    icon: Printer,
    claves: ["reinaflex", "reina flex"],
    valorPorDefecto: "ReinaFlex",
  },
  {
    // La misma máquina está cargada dos veces en el catálogo: «Impresora
    // Autoadhesiva» (IMP-AUTO) y «Taurus». El dueño confirmó que Taurus ES la
    // autoadhesiva, así que se muestran como una sola tarjeta.
    id: "autoadhesiva",
    label: "Autoadhesiva",
    icon: Sticker,
    claves: ["autoadhesiva", "impresora autoadhesiva", "imp-auto", "taurus"],
    preferida: "impresora autoadhesiva",
    valorPorDefecto: "Impresora Autoadhesiva",
  },
]

/** Cruza el catálogo con las tres de siempre y suma las impresoras que no encajen en ninguna.
 *
 *  `conFallback` sólo se usa cuando NO se pudo leer el catálogo: ahí se muestran
 *  las tres de siempre para no dejar el alta trabada. Con el catálogo en mano se
 *  ofrece únicamente lo que existe y está activo — si no, el operario elige una
 *  máquina que el backend después rechaza, y recién se entera al final del
 *  formulario, con todo cargado. */
export function armarOpciones(maquinas: Maquina[], conFallback = false): Opcion[] {
  const impresoras = maquinas.filter((m) => m.activa && normalizar(m.tipo) === "impresion")
  const usadas = new Set<number>()

  const tres: Opcion[] = CANONICAS.flatMap((c) => {
    // Las claves se normalizan ACÁ, igual que los nombres del catálogo. Si se
    // comparan tal cual se escribieron, «impresora autoadhesiva» nunca iguala a
    // normalizar("Impresora Autoadhesiva") = "impresoraautoadhesiva", la fila
    // queda sin dueño y la misma máquina aparece dos veces en pantalla.
    const claves = c.claves.map(normalizar)
    const filas = impresoras.filter(
      (m) => claves.includes(normalizar(m.nombre)) || claves.includes(normalizar(m.codigo ?? "")),
    )
    filas.forEach((m) => usadas.add(m.id))
    if (filas.length === 0 && !conFallback) return []
    const preferida = c.preferida ? normalizar(c.preferida) : null
    const elegida = (preferida && filas.find((m) => normalizar(m.nombre) === preferida)) || filas[0]
    return [{
      id: c.id,
      label: c.label,
      icon: c.icon,
      valor: elegida?.nombre ?? c.valorPorDefecto,
      alias: filas.map((m) => m.nombre).filter((n) => normalizar(n) !== normalizar(c.label)),
    }]
  })

  // Si mañana cargan otra impresora en el catálogo, aparece sola.
  const extras: Opcion[] = impresoras
    .filter((m) => !usadas.has(m.id))
    .map((m) => ({ id: `maquina-${m.id}`, label: m.nombre, icon: Printer, valor: m.nombre, alias: [] }))

  return [...tres, ...extras]
}

interface Props {
  /** La que ya venía elegida, cuando se entra acá desde «Cambiar máquina». */
  actual?: MaquinaElegida | null
  onElegir: (m: MaquinaElegida) => void
  /** Salir sin elegir: vuelve al listado, o al formulario si ya había una elegida. */
  onCancelar: () => void
}

export function ElegirMaquina({ actual = null, onElegir, onCancelar }: Props) {
  // Vacío hasta que llega el catálogo: se ofrece sólo lo que de verdad existe.
  const [opciones, setOpciones] = useState<Opcion[]>([])
  const [cargando, setCargando] = useState(true)
  const [sinCatalogo, setSinCatalogo] = useState(false)

  useEffect(() => {
    let vigente = true
    // Catálogo público (/api/maquinas): a este alta entra producción, y
    // /api/admin/maquinas exige rol admin — se quedarían sin opciones reales.
    api.maquinas
      .list()
      .then((ms) => {
        if (!vigente) return
        setOpciones(armarOpciones(ms))
        setSinCatalogo(false)
        setCargando(false)
      })
      .catch(() => {
        if (!vigente) return
        // Sin catálogo no dejamos el alta trabada: van las tres de siempre.
        setOpciones(armarOpciones([], true))
        setSinCatalogo(true)
        setCargando(false)
      })
    return () => {
      vigente = false
    }
  }, [])

  return (
    <div className="min-h-full w-full bg-background">
      {/* Header azul de marca, igual que el del formulario */}
      <div className="bg-brand relative overflow-hidden px-5 pt-5 pb-8 text-white sm:px-8 lg:px-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logoSOLO.png"
          alt=""
          aria-hidden
          className="pointer-events-none absolute -right-10 -top-6 h-52 w-52 select-none object-contain opacity-[0.12] brightness-0 invert"
        />
        <button
          type="button"
          onClick={onCancelar}
          className="relative -ml-1 mb-3 inline-flex items-center gap-1.5 rounded-lg px-1 py-1 text-[14px] font-semibold text-white/75 transition-colors hover:text-white"
        >
          <ChevronLeft className="h-4 w-4" />
          {actual ? "Volver al formulario" : "Volver a órdenes"}
        </button>
        <p className="relative text-center text-[11px] font-extrabold uppercase tracking-[0.22em] text-white/65">
          Nueva orden de trabajo
        </p>
        <h1 className="font-brand relative mt-2 text-center text-[32px] leading-tight tracking-tight text-white sm:text-[38px]">
          ¿En qué máquina se imprime?
        </h1>
      </div>

      <div className="px-5 py-8 sm:px-8 lg:px-10">
        {sinCatalogo && (
          <p className="mx-auto mb-6 flex max-w-4xl items-start gap-2.5 rounded-xl border-[1.5px] border-gold/40 bg-gold/10 px-4 py-3 text-[15px] font-bold text-foreground">
            <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-gold" strokeWidth={2.4} />
            No pudimos leer el listado de máquinas. Igual podés elegir una de las tres de siempre y seguir.
          </p>
        )}

        {cargando && (
          <p className="mx-auto max-w-4xl text-center text-[17px] font-semibold text-muted-foreground">
            Buscando las máquinas…
          </p>
        )}

        {!cargando && opciones.length === 0 && (
          <p className="mx-auto flex max-w-4xl items-start gap-2.5 rounded-xl border-[1.5px] border-gold/40 bg-gold/10 px-4 py-3 text-[15px] font-bold text-foreground">
            <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-gold" strokeWidth={2.4} />
            No hay impresoras cargadas. Pedile a un administrador que las agregue en Administración → Máquinas.
          </p>
        )}

        <div className="mx-auto grid max-w-4xl grid-cols-1 gap-5 sm:grid-cols-3">
          {opciones.map((o) => {
            const elegida = actual?.id === o.id
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => onElegir({ id: o.id, label: o.label, valor: o.valor })}
                className={`group flex min-h-[210px] flex-col items-center gap-4 rounded-2xl border-[3px] p-6 text-center transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gold/60 ${
                  elegida
                    ? "border-gold bg-gold/10"
                    : "border-border bg-secondary/30 hover:border-gold hover:bg-secondary/60"
                }`}
              >
                <span
                  className={`grid h-16 w-16 shrink-0 place-items-center rounded-full border-[2.5px] transition ${
                    elegida ? "border-gold bg-gold text-gold-foreground" : "border-gold/50 bg-gold/15 text-gold"
                  }`}
                >
                  <o.icon className="h-8 w-8" strokeWidth={2.2} />
                </span>
                <span className="text-[26px] font-extrabold leading-tight text-foreground">{o.label}</span>
                {o.alias.length > 0 && (
                  <span className="text-[13.5px] font-semibold text-muted-foreground">
                    También figura como {o.alias.join(" · ")}
                  </span>
                )}
                {elegida && (
                  <span className="rounded-full bg-gold px-3 py-1 text-[12px] font-extrabold uppercase tracking-wider text-gold-foreground">
                    Elegida
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <p className="mx-auto mt-7 max-w-4xl text-center text-[15px] font-semibold text-muted-foreground">
          Tocá la máquina y seguimos con el resto de la orden.
        </p>
      </div>
    </div>
  )
}
