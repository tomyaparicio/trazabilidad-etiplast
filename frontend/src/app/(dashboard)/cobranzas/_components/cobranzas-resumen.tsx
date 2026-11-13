"use client"

/**
 * Los cuatro números de la cobranza, y el calendario de lo que se va a acreditar.
 *
 * ── TRES ESTADOS, TRES DIBUJOS DISTINTOS ────────────────────────────────────
 *
 * Esta pantalla es de PLATA, y en una pantalla de plata un cero inventado es
 * peor que un error: el error se nota, el cero falso no. Antes, si
 * `GET /cobranzas/resumen` fallaba, las cuatro fichas se dibujaban igual con
 * «$ 0 · Plata disponible» y la tira del calendario desaparecía entera, sin
 * aviso. El que entraba a ver cuánta plata tenía leía cero y se lo creía —con
 * el listado de abajo mostrando $ 16.361.001 en la misma pantalla—.
 *
 * Así que el estado del pedido se dibuja de tres maneras que no se pueden
 * confundir:
 *
 *   cargando  → esqueleto. No hay número que leer todavía.
 *   falló     → NINGÚN número. Un cartel que dice que el servidor no contestó.
 *   dato      → los números. Un «$ 0» acá es un cero de verdad.
 *
 * Y un cuarto caso, el que vale la pena: falló PERO hay un dato bueno de antes.
 * Ahí se conserva lo último que se pudo leer —igual que `lib/use-tablero.ts`
 * con el tablero de planta— y se dice arriba, en una banda, que eso es viejo.
 * Un número viejo marcado como viejo sirve; un número viejo disfrazado de
 * actual es la misma mentira de antes.
 *
 * ── POR QUÉ CUATRO COLORES DISTINTOS ────────────────────────────────────────
 *
 * Los cuatro son pesos, pero no son lo mismo. «Entró» es plata disponible,
 * «en cartera» es una promesa con fecha, «por acreditar» es una fecha y
 * «rechazado» es una pérdida. Si se pintaran todos igual, el día que el banco
 * rechace un cheque la pantalla mentiría. Se usan los mismos colores que el
 * resto del ERP ya tiene:
 *   verde  = plata que ya está (Facturas: «Cobrado · ya ingresado»)
 *   ámbar  = todavía falta     (Facturas: «Pendiente de cobro»)
 *   rojo   = el problema
 * «Por acreditar» queda NEUTRO a propósito: no es un estado, es una fecha, y
 * en dorado quedaría a un pelo del ámbar de «en cartera» en tema oscuro
 * (#f5eb4a contra #fcd34d) — dos fichas que se leen igual de un vistazo es
 * exactamente lo que hay que evitar acá.
 */

import { CalendarClock, CircleCheck, CircleX, Hourglass, RefreshCw, TriangleAlert } from "lucide-react"
import type { CobranzasResumen as Resumen } from "@/lib/api/types"
import { Button } from "@/components/ui/button"
import { cantidad, fmtMes, money } from "./cobranza-presentacion"

/**
 * El pedido del panel, con su estado a la vista.
 *
 * `datos` y `falló` son independientes a propósito: se puede tener las dos
 * cosas a la vez (dato bueno de antes + el último intento caído), y ése es
 * justo el caso que hay que poder dibujar.
 */
export type EstadoResumen = {
  /** `null` mientras no contestó nunca bien */
  datos: Resumen | null
  /** Hay un pedido en vuelo */
  cargando: boolean
  /** El último pedido falló. Puede ser `true` con `datos` cargados: dato viejo. */
  falló: boolean
  /** Lo que dijo la API, para no mostrar un genérico */
  mensaje: string | null
}

function Ficha({
  icono: Icono,
  titulo,
  figura,
  claseFigura,
  pie,
  destacado = false,
}: {
  icono: React.ComponentType<{ className?: string; strokeWidth?: number }>
  titulo: string
  figura: string
  claseFigura: string
  pie: string
  /** Tiñe la ficha entera: para que un rechazo no se pueda pasar por alto. */
  destacado?: boolean
}) {
  return (
    // La ficha destacada se marca con un ANILLO rojo, no tiñendo el fondo:
    // cualquier tinte rosado le baja el contraste al rótulo y al pie —que usan
    // `muted-foreground`, igual que las otras tres fichas— y en tema claro
    // caían a 4,29:1, por debajo del 4,5 que pide AA. El anillo se ve igual de
    // fuerte y deja el fondo donde estaba.
    <div
      className={`px-6 py-6 ${
        // El anillo va a color pleno: al 60% quedaba en 2,44:1 contra la ficha
        // blanca, y acá no es un adorno —es LO que distingue esta ficha—, así
        // que tiene que llegar al 3:1 de los elementos no textuales.
        destacado ? "bg-card ring-2 ring-inset ring-red-600 dark:ring-red-400" : "bg-card"
      }`}
    >
      <p className="ed-eyebrow flex items-center gap-2 text-[12px]">
        <Icono className="size-4 shrink-0" strokeWidth={2} />
        {titulo}
      </p>
      <p className={`ed-figure mt-3 text-[30px] sm:text-[34px] ${claseFigura}`}>{figura}</p>
      <p className="mt-2.5 text-[13.5px] font-medium text-muted-foreground">{pie}</p>
    </div>
  )
}

/** Cargando: cuatro huecos con la forma de las fichas, ningún número. */
function Esqueleto() {
  return (
    <section
      className="ed-island grid grid-cols-1 gap-px overflow-hidden bg-border sm:grid-cols-2 xl:grid-cols-4"
      aria-busy="true"
      aria-label="Cargando los números de la cobranza"
    >
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-card px-6 py-6">
          <div className="h-3 w-28 animate-pulse rounded-full bg-muted" />
          <div className="mt-4 h-8 w-36 animate-pulse rounded-lg bg-muted" />
          <div className="mt-3 h-3 w-24 animate-pulse rounded-full bg-muted" />
        </div>
      ))}
    </section>
  )
}

/**
 * Falló y no hay NADA que mostrar.
 *
 * Acá no va ninguna cifra, ni siquiera un guión en el lugar de la cifra: el
 * hueco con forma de número invita a leerlo como «no hay plata». Lo que se
 * dibuja es un cartel que dice qué pasó y un botón para volver a pedirlo.
 */
function PanelCaido({
  mensaje,
  cargando,
  onReintentar,
}: {
  mensaje: string | null
  cargando: boolean
  onReintentar: () => void
}) {
  return (
    <section
      // Sin `ed-island` a propósito: esa clase trae su propio `box-shadow` y
      // los `ring-*` de Tailwind TAMBIÉN se dibujan como `box-shadow`, así que
      // la isla se comía el anillo rojo y el panel quedaba igual de gris que
      // cualquier otro bloque. Acá el borde rojo va declarado a mano y se ve.
      //
      // Borde y no fondo teñido: el texto de abajo usa `muted-foreground` y
      // cualquier tinte lo deja por debajo del 4,5:1 de AA (ya pasó con la
      // ficha de rechazados). A color pleno, para llegar al 3:1 que piden los
      // elementos no textuales.
      className="flex flex-col items-center gap-3 rounded-2xl border-2 border-red-600 bg-card px-6 py-10 text-center dark:border-red-400"
      role="alert"
    >
      <div className="rounded-2xl border border-destructive/20 bg-destructive/10 p-4 text-destructive">
        <TriangleAlert className="size-6" strokeWidth={1.5} />
      </div>
      <p className="text-[18px] font-extrabold text-foreground">
        No se pudieron leer los números de la cobranza
      </p>
      <p className="max-w-lg text-[15px] font-medium leading-snug text-muted-foreground">
        Esto <span className="font-bold text-foreground">no quiere decir que no haya plata</span>:
        quiere decir que el servidor no contestó. Hasta que conteste, esta pantalla no muestra
        ningún total, para no hacerte creer que hay cero.
      </p>
      {mensaje && (
        <p className="max-w-lg text-[13.5px] font-medium text-muted-foreground">
          El servidor dijo: «{mensaje}».
        </p>
      )}
      <Button
        onClick={onReintentar}
        disabled={cargando}
        variant="outline"
        className="mt-1 h-12 gap-2 text-[15px] font-bold"
      >
        <RefreshCw className={`size-4 ${cargando ? "animate-spin" : ""}`} />
        {cargando ? "Pidiendo…" : "Reintentar"}
      </Button>
    </section>
  )
}

/** Hay dato, pero es el de antes: el último intento se cayó. */
function BandaDatoViejo({
  mensaje,
  cargando,
  onReintentar,
}: {
  mensaje: string | null
  cargando: boolean
  onReintentar: () => void
}) {
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-amber-500/35 bg-amber-500/10 px-6 py-3.5"
      role="status"
    >
      <p className="flex items-start gap-2 text-[14.5px] font-bold leading-snug text-amber-900 dark:text-amber-200">
        <TriangleAlert className="mt-px size-[18px] shrink-0" strokeWidth={2.2} />
        <span>
          Estos números son los últimos que se pudieron leer. El intento de ahora falló
          {mensaje ? `: ${mensaje}` : ""}.
        </span>
      </p>
      <Button
        onClick={onReintentar}
        disabled={cargando}
        variant="outline"
        className="h-10 gap-2 text-[14px] font-bold"
      >
        <RefreshCw className={`size-4 ${cargando ? "animate-spin" : ""}`} />
        {cargando ? "Pidiendo…" : "Reintentar"}
      </Button>
    </div>
  )
}

export function CobranzasResumen({
  estado,
  onReintentar,
}: {
  estado: EstadoResumen
  onReintentar: () => void
}) {
  const { datos, cargando, falló, mensaje } = estado

  // Sin dato bueno todavía: o se está pidiendo, o se cayó. Nunca un cero.
  if (!datos) {
    return falló ? (
      <PanelCaido mensaje={mensaje} cargando={cargando} onReintentar={onReintentar} />
    ) : (
      <Esqueleto />
    )
  }

  const entrado = datos.entrado ?? { mes: 0, anio: 0 }
  const enCartera = datos.en_cartera ?? { total: 0, cantidad: 0 }
  const rechazados = datos.rechazados ?? { total: 0, cantidad: 0 }
  const meses = datos.por_acreditar ?? []

  // El próximo mes del calendario: ése es el número útil acá. El TOTAL por
  // acreditar sería el mismo que «en cartera» (es la misma plata, agrupada por
  // mes), y repetirlo en dos fichas las haría leerse como dos cosas.
  const proximo = meses[0] ?? null
  const maxMes = meses.reduce((m, x) => Math.max(m, x.total ?? 0), 0)

  return (
    <>
      <section className="ed-island overflow-hidden">
        {falló && (
          <BandaDatoViejo mensaje={mensaje} cargando={cargando} onReintentar={onReintentar} />
        )}
        <div className="grid grid-cols-1 gap-px bg-border sm:grid-cols-2 xl:grid-cols-4">
          <Ficha
            icono={CircleCheck}
            titulo="Entró este mes"
            figura={money(entrado.mes)}
            claseFigura="text-emerald-700 dark:text-emerald-300"
            pie={`Plata disponible · ${money(entrado.anio)} en el año`}
          />
          <Ficha
            icono={Hourglass}
            titulo="En cartera"
            figura={money(enCartera.total)}
            claseFigura="text-amber-800 dark:text-amber-300"
            pie={
              enCartera.cantidad === 1
                ? "1 cheque sin acreditar"
                : `${cantidad(enCartera.cantidad)} cheques sin acreditar`
            }
          />
          <Ficha
            icono={CalendarClock}
            titulo="Próxima acreditación"
            figura={proximo ? money(proximo.total) : "—"}
            claseFigura="text-foreground"
            pie={
              proximo
                ? `${fmtMes(proximo.mes)} · ${cantidad(proximo.cantidad)} ${proximo.cantidad === 1 ? "cheque" : "cheques"}`
                : "No hay cheques agendados"
            }
          />
          <Ficha
            icono={CircleX}
            titulo="Rechazados"
            figura={money(rechazados.total)}
            claseFigura="text-red-700 dark:text-red-300"
            pie={
              rechazados.cantidad === 0
                ? "Ningún cheque rechazado"
                : `${cantidad(rechazados.cantidad)} ${rechazados.cantidad === 1 ? "cheque" : "cheques"} a reclamar`
            }
            destacado={rechazados.cantidad > 0}
          />
        </div>
      </section>

      {/* La tira se dibuja SIEMPRE que haya dato, aunque venga vacía. Antes se
          escondía con `meses.length > 0`, y eso hacía que la tira ausente
          significara dos cosas distintas —«no hay cheques agendados» y «el
          pedido se cayó»— sin forma de saber cuál. Ahora la ausencia de
          cheques se dice con palabras. */}
      <section className="ed-island overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-6 py-4">
          <p className="ed-eyebrow text-[12px]">Cuándo se hace efectivo</p>
          <p className="text-[13.5px] font-medium text-muted-foreground">
            Fecha de pago de cada cheque, mes por mes
          </p>
        </div>
        {meses.length === 0 ? (
          <p className="bg-card px-6 py-5 text-[15px] font-semibold text-muted-foreground">
            No hay ningún cheque con fecha de pago agendada.
          </p>
        ) : (
          <ul className="flex gap-px overflow-x-auto bg-border">
            {meses.map((m) => (
              <li key={m.mes} className="min-w-[160px] flex-1 bg-card px-5 py-4">
                <p className="text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
                  {fmtMes(m.mes)}
                </p>
                <p className="ed-figure mt-2 text-[22px] text-foreground">{money(m.total)}</p>
                {/* La barra repite el número de al lado: es sólo para ver de un
                    golpe qué mes pesa más. */}
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
                  <div
                    // `amber-700` y no `amber-600`: sobre el riel (`bg-muted`,
                    // #f0f1f8) el 600 se queda en 2,84:1 y no llega al 3:1 que
                    // piden los elementos no textuales.
                    className="h-full rounded-full bg-amber-700 dark:bg-amber-400"
                    style={{ width: `${maxMes > 0 ? Math.max(6, Math.round(((m.total ?? 0) / maxMes) * 100)) : 0}%` }}
                  />
                </div>
                <p className="mt-2 text-[13px] font-medium text-muted-foreground">
                  {cantidad(m.cantidad)} {m.cantidad === 1 ? "cheque" : "cheques"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
