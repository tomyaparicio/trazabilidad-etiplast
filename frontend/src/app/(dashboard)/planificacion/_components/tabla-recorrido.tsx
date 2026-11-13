"use client"

/**
 * La planilla de planta: una fila por orden, una columna por paso.
 *
 * Es la traducción de la «Planilla de Registro de Extrusión» que la empresa
 * usa en papel —`Fecha | Cliente | Producto/Cantidad | Ext. | Imp. | Troq.`—
 * con lo que al papel le falta: cuándo pasó cada etapa, quién la hizo y en qué
 * máquina. El papel sólo tiene casilleros binarios, así que se sabe EN QUÉ
 * etapa está un trabajo pero no DESDE CUÁNDO.
 *
 * ── Las dos señales de color, y por qué no compiten ──────────────────────────
 *
 * Toda esta pantalla usa exactamente dos acentos, con un significado fijo cada
 * uno, el mismo que ya usa el dashboard:
 *
 *   dorado (relleno)  → el trabajo está ACÁ, ahora, sobre una máquina
 *   ámbar  (contorno) → el trabajo pasó por acá y nadie lo escaneó en la
 *                       etapa siguiente: hay que ir a destrabarlo
 *
 * Están dibujados distinto a propósito y no sólo pintados distinto: el dorado
 * es un bloque relleno, el ámbar es un contorno más una barra gruesa en el
 * borde izquierdo de la fila entera. El tablero se mira de lejos y de costado,
 * y quien lo mira puede ser daltónico: la FORMA tiene que distinguirlos sola.
 *
 * La maqueta aprobada usaba dorado para las dos cosas. No se copió: la señal
 * accionable (ir a destrabar) no puede verse igual que la señal informativa
 * (dónde está el trabajo), porque entonces ninguna de las dos avisa nada.
 *
 * ── Por qué no `DataTable` ───────────────────────────────────────────────────
 *
 * `components/ui/data-table.tsx` es la tabla del repo y la convención dice
 * usarla. Se evaluó y no da, por dos cosas que esta pantalla necesita:
 *
 *  - `ColumnDef.header` es `string`. La cabecera de acá es el número del paso
 *    arriba y el nombre debajo, en dos renglones — hace falta `ReactNode`.
 *  - No hay forma de marcar UNA fila. El `className` del `<tr>` está fijo
 *    adentro del componente, y marcar la fila entera de una orden trabada es el
 *    requisito principal de la pantalla.
 *
 * Además su estado vacío son 160 px de ilustración centrada, que es justo el
 * defecto que este rediseño vino a sacar. Las celdas de varias líneas sí las
 * soporta (`cell` devuelve `ReactNode`): no es eso lo que falta.
 *
 * El depósito, que no necesita ninguna de las dos cosas, podría usarla; va con
 * la misma cáscara que esta tabla para que las dos se lean igual.
 *
 * ── El celular ───────────────────────────────────────────────────────────────
 *
 * Ocho columnas no entran en 390 px, y achicar la letra está prohibido: los
 * usuarios son gente grande, de parado, en una planta. Tampoco scroll
 * horizontal: buscar una etapa deslizando con el celular en una mano no se
 * hace. Debajo de `lg` la misma fila se dibuja como un bloque: la posición
 * actual grande y el recorrido ya cumplido en un renglón de texto corrido. Se
 * pierde la lectura en columnas —que es el valor de la tabla— pero no se pierde
 * ningún dato, y las dos vistas salen del MISMO `FilaRecorrido`: no hay dos
 * lógicas que se puedan desincronizar.
 */
import { PASOS_ORDENADOS, TITULO_PASO, type ClavePaso } from "@/lib/api/types"
import type { CeldaPaso, FilaRecorrido, TonoEstado } from "@/lib/recorrido-ordenes"
import { AlertTriangle, FileText } from "lucide-react"
import Link from "next/link"

const nf = new Intl.NumberFormat("es-AR")

/** Nombres cortos para el renglón de recorrido del celular, donde van en fila. */
const ABREV: Record<ClavePaso, string> = {
  orden_trabajo: "Orden",
  extrusion: "Extrusión",
  impresion: "Impresión",
  troquelado: "Troquelado",
  finalizado: "Cierre",
}

/**
 * El chip de Estado. Un tono por significado, los mismos cuatro en toda la app.
 *
 * `espera` va sin relleno: «sin arrancar» no es una novedad ni un problema, es
 * el estado por defecto de la cola de entrada, y pintarlo lo pondría a competir
 * con las dos señales que sí importan.
 */
const TONO: Record<TonoEstado, string> = {
  planta: "bg-brand/10 text-brand dark:bg-primary-200/15 dark:text-primary-200",
  trabada: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  espera: "border border-border text-muted-foreground",
  fin: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
}

export function TablaRecorrido({ filas, nota }: { filas: FilaRecorrido[]; nota?: string | null }) {
  if (filas.length === 0) return <SinOrdenes />

  return (
    <>
      <div className="hidden overflow-hidden rounded-2xl border border-border bg-card lg:block">
        {/* `overflow-x-auto` como red de seguridad: en la tablet de planta
            (1024 px) las ocho columnas entran justas, y si el nombre de un
            producto las empuja, la tabla se desliza en vez de apretar el texto
            hasta que no se lea. */}
        {/* Ocho columnas con datos de verdad piden ~950 px. En un escritorio de
            1280 entran justas; en la tablet de planta (1024, con el menú
            abierto quedan ~690) no, y achicar la letra está prohibido. Ahí la
            tabla se desliza —y la columna de la orden queda clavada a la
            izquierda, así que nunca se pierde de vista de qué fila se está
            leyendo el recorrido—. */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse">
            <caption className="sr-only">
              Una fila por orden y una columna por paso del recorrido. En cada celda, la
              fecha en que pasó por esa etapa y quién la hizo.
            </caption>
            <thead>
              {/* Anchos declarados: con ocho columnas en ~960 px el reparto
                  automático le da al nombre del paso el espacio que necesita el
                  PRODUCTO, y «Sin producto cargado» terminaba en tres renglones
                  mientras «ORDEN DE TRABAJO» iba en uno. Fijados a mano, lo que
                  envuelve es la cabecera —que se lee una vez— y no el dato. */}
              <tr className="border-b border-border bg-muted/40">
                {/* Clavada: fondo OPACO (`bg-card`) para tapar lo que pasa por
                    debajo al deslizar, más el mismo velo `bg-muted/40` que la
                    fila pintado encima. Poner `bg-muted` sólido y listo dejaba
                    esta celda de un gris más oscuro que el resto de la
                    cabecera, porque `/40` sobre la card no da `bg-muted`. */}
                <th scope="col" className="sticky left-0 z-20 w-[132px] bg-card px-3 py-3 text-left text-sm font-bold uppercase tracking-wider text-muted-foreground">
                  <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-muted/40" />
                  <span className="relative">Orden</span>
                </th>
                <th scope="col" className="w-[160px] px-3 py-3 text-left text-sm font-bold uppercase tracking-wider text-muted-foreground">
                  Producto
                </th>
                {PASOS_ORDENADOS.map((clave, i) => (
                  <th
                    key={clave}
                    scope="col"
                    className="w-[104px] border-l border-border px-2 py-3 text-center"
                  >
                    {/* El número del paso: el mismo recorrido de 5 que numera la
                        tira del dashboard. No son los ①②③ de la ficha impresa,
                        que numera las tres cosas que hace el operario. */}
                    <span className="block text-base font-extrabold leading-none text-brand dark:text-primary-200">
                      {i + 1}
                    </span>
                    <span className="mt-1 block text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">
                      {TITULO_PASO[clave]}
                    </span>
                  </th>
                ))}
                <th scope="col" className="w-[144px] border-l border-border px-3 py-3 text-right text-sm font-bold uppercase tracking-wider text-muted-foreground">
                  Estado
                </th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr
                  key={f.id}
                  // Sin tinte de hover en la fila: la celda de la orden va
                  // clavada y con fondo opaco, así que un fondo de fila no le
                  // llegaría y la fila quedaría pintada con un agujero
                  // justo en la primera columna. El link del número de orden ya
                  // tiene su propio hover.
                  className={`border-b border-border/60 last:border-b-0 ${
                    f.trabada ? "bg-amber-500/[0.07]" : ""
                  }`}
                >
                  {/* La barra ámbar marca la fila ENTERA de una orden trabada.
                      Va transparente en las demás para que el texto no se corra
                      4 px entre una fila y la otra. */}
                  <td
                    className={`sticky left-0 z-10 border-l-4 bg-card px-3 py-3 align-middle ${
                      f.trabada ? "border-l-amber-500" : "border-l-transparent"
                    }`}
                  >
                    {/* El tinte ámbar de la fila se repinta acá encima: la celda
                        clavada va con fondo opaco (si no, el resto de la fila le
                        pasa por debajo al deslizar) y ese opaco tapaba el tinte
                        justo en la celda que lleva la barra. */}
                    {f.trabada && (
                      <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-amber-500/[0.07]" />
                    )}
                    <Link href={`/ordenes?buscar=${f.numero}`} className="group relative block">
                      {/* Sin cortar: «OT-0003» partido en «OT-» y «0003» es el
                          identificador de la fila roto al medio. */}
                      <span className="block whitespace-nowrap text-lg font-extrabold leading-tight text-foreground group-hover:text-brand dark:group-hover:text-primary-200">
                        {f.numero}
                      </span>
                      <span className="block text-sm font-semibold text-muted-foreground">
                        {f.cliente ?? "Sin cliente"}
                      </span>
                    </Link>
                  </td>

                  <td className="px-3 py-3 align-middle">
                    {/* `break-words`: un nombre de producto de una sola palabra
                        larga no puede ensanchar la columna, o empuja a la de
                        Estado fuera del ancho disponible. */}
                    <span className="block break-words text-base font-bold leading-tight text-foreground">
                      {f.producto ?? "Sin producto cargado"}
                    </span>
                    {/* Cada dato envuelve ENTERO o no envuelve: el lote partido
                        por sus guiones salía en tres renglones («L-» /
                        «20261106-» / «0011») y dejaba de leerse como un código.
                        Lo que se parte es la línea, no el dato. */}
                    <span className="flex flex-wrap gap-x-1.5 text-sm font-semibold text-muted-foreground">
                      {f.cantidad != null && (
                        <span className="whitespace-nowrap">{nf.format(f.cantidad)} u</span>
                      )}
                      {f.lote && <span className="whitespace-nowrap font-mono">{f.lote}</span>}
                    </span>
                  </td>

                  {f.celdas.map((c, i) => (
                    <td
                      key={PASOS_ORDENADOS[i]}
                      className="border-l border-border px-2 py-3 text-center align-middle"
                    >
                      <Celda celda={c} paso={PASOS_ORDENADOS[i]} />
                    </td>
                  ))}

                  <td className="border-l border-border px-3 py-3 text-right align-middle">
                    <ChipEstado estado={f.estado} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* El celular: la misma fila, leída en vertical */}
      <ul className="flex flex-col gap-3 lg:hidden">
        {filas.map((f) => (
          <FilaChica key={f.id} fila={f} />
        ))}
      </ul>

      {nota && <p className="mt-3 text-sm font-semibold text-muted-foreground">{nota}</p>}
    </>
  )
}

/** Una celda de paso: una sola de las cinco cosas, nunca dos. */
function Celda({ celda, paso }: { celda: CeldaPaso; paso: ClavePaso }) {
  if (celda.estado === "pendiente") {
    return (
      <>
        <span aria-hidden="true" className="text-xl font-bold leading-none text-muted-foreground">
          ·
        </span>
        <span className="sr-only">Todavía no llegó a {TITULO_PASO[paso].toLowerCase()}</span>
      </>
    )
  }

  if (celda.estado === "ahora") {
    return (
      <span className="inline-flex flex-col items-center rounded-lg bg-gold px-2 py-1.5 text-gold-foreground">
        <span className="sr-only">Está acá ahora, hace </span>
        <span className="text-base font-extrabold leading-none">{celda.cuando ?? "recién"}</span>
        {celda.quien && (
          <span className="mt-1 text-sm font-bold leading-none">{celda.quien}</span>
        )}
      </span>
    )
  }

  if (celda.estado === "trabada") {
    // El triángulo en vez de la palabra «esperando»: escrita, la palabra es la
    // celda más ancha de la tabla y empujaba la columna de Estado fuera del
    // ancho disponible. Lo que la celda tiene que gritar —«acá hay algo
    // parado»— ya lo dicen la forma (contorno ámbar), la barra de la fila y el
    // chip «Trabada» del final. El texto completo va para el lector de
    // pantalla, que no tiene ni forma ni color.
    return (
      <span className="inline-flex flex-col items-center rounded-lg border-2 border-amber-500 px-2 py-1.5 text-amber-700 dark:text-amber-300">
        <AlertTriangle aria-hidden="true" className="size-4 shrink-0" />
        <span className="sr-only">Esperando la etapa siguiente hace </span>
        <span className="mt-1 text-base font-extrabold leading-none">
          {celda.cuando ?? "recién"}
        </span>
      </span>
    )
  }

  // `cola` y `hecho` se dibujan igual —dato arriba, quién abajo, sin relleno—
  // y es a propósito: los dos dicen «esto ya está resuelto, no hay nada que
  // mirar acá». Lo que diferencia a `cola` es QUÉ dice arriba: «1 día» en vez
  // de un día del calendario, o sea hace cuánto espera para arrancar.
  //
  // Ya pasó. Sin fecha registrada igual se dice que pasó: la orden está más
  // adelante en el recorrido, eso es un hecho. Lo que no hay es el dato del
  // papel, y poner un «·» ahí sería decir que todavía no llegó, que es falso.
  if (!celda.cuando) {
    return (
      <>
        <span aria-hidden="true" className="text-base font-bold leading-none text-muted-foreground">
          ✓
        </span>
        <span className="sr-only">Pasó por acá, sin fecha registrada</span>
      </>
    )
  }

  return (
    <>
      <span className="sr-only">
        {celda.estado === "cola" ? "Esperando para arrancar hace " : "Pasó por acá el "}
      </span>
      <span className="block text-base font-bold leading-none tabular-nums text-foreground">
        {celda.cuando}
      </span>
      {celda.quien && (
        <span className="mt-1 block text-sm font-semibold leading-tight text-muted-foreground">
          {celda.quien}
        </span>
      )}
    </>
  )
}

function ChipEstado({ estado }: { estado: FilaRecorrido["estado"] }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-sm font-bold ${TONO[estado.tono]}`}
    >
      {estado.tono === "trabada" && <AlertTriangle aria-hidden="true" className="size-4 shrink-0" />}
      {estado.texto}
    </span>
  )
}

/**
 * La fila en un celular.
 *
 * El orden en que se lee: qué orden es → qué producto → DÓNDE ESTÁ (lo grande)
 * → por dónde ya pasó. La posición actual va destacada con el mismo dorado o
 * el mismo ámbar que la celda de la tabla, para que las dos vistas se
 * aprendan una sola vez.
 */
function FilaChica({ fila }: { fila: FilaRecorrido }) {
  const paso = PASOS_ORDENADOS.indexOf(fila.paso)
  const actual = fila.celdas[paso]
  // El paso actual queda FUERA del recorrido cumplido aunque esté dibujado
  // como cumplido (es lo que pasa con una orden finalizada): ya lo dice el
  // bloque de posición de arriba, y repetirlo abajo se lee como dos cosas.
  const cumplidos = fila.celdas
    .map((c, i) => ({ c, clave: PASOS_ORDENADOS[i], i }))
    .filter(({ c, i }) => i !== paso && c.estado === "hecho" && c.cuando)

  return (
    <li
      className={`rounded-2xl border bg-card ${
        fila.trabada ? "border-amber-500/50 border-l-4 border-l-amber-500" : "border-border"
      }`}
    >
      <Link href={`/ordenes?buscar=${fila.numero}`} className="block px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="block text-lg font-extrabold leading-tight text-foreground">
              {fila.numero}
            </span>
            <span className="block text-sm font-semibold text-muted-foreground">
              {fila.cliente ?? "Sin cliente"}
            </span>
          </div>
          <ChipEstado estado={fila.estado} />
        </div>

        <p className="mt-2 text-base font-bold leading-tight text-foreground">
          {fila.producto ?? "Sin producto cargado"}
        </p>
        <p className="flex flex-wrap gap-x-1.5 text-sm font-semibold text-muted-foreground">
          {fila.cantidad != null && (
            <span className="whitespace-nowrap">{nf.format(fila.cantidad)} u</span>
          )}
          {fila.lote && <span className="whitespace-nowrap font-mono">{fila.lote}</span>}
        </p>

        {/* La tira de cinco: lo mismo que dicen las columnas de la tabla, en el
            único lugar donde cabe. Decorativa — todo lo que informa está
            escrito abajo en palabras. */}
        <div aria-hidden="true" className="mt-3 flex gap-1">
          {fila.celdas.map((c, i) => (
            <span
              key={PASOS_ORDENADOS[i]}
              className={`h-1.5 flex-1 rounded-full ${
                c.estado === "ahora"
                  ? "bg-gold"
                  : c.estado === "trabada"
                    ? "bg-amber-500"
                    : c.estado === "hecho" || c.estado === "cola"
                      ? "bg-muted-foreground"
                      : "bg-border"
              }`}
            />
          ))}
        </div>

        {actual && (
          <p
            className={`mt-2.5 inline-flex flex-wrap items-baseline gap-x-2 rounded-lg px-2.5 py-1.5 text-base font-extrabold ${
              actual.estado === "ahora"
                ? "bg-gold text-gold-foreground"
                : actual.estado === "trabada"
                  ? "border-2 border-amber-500 text-amber-700 dark:text-amber-300"
                  : "border border-border text-foreground"
            }`}
          >
            <span>
              Paso {paso + 1} de 5 · {TITULO_PASO[fila.paso]}
            </span>
            {/* «hace» sólo cuando el dato ES un lapso. En el paso 5 la celda
                trae el DÍA del cierre, y «hace 08/11» no quiere decir nada. */}
            {actual.cuando && (
              <span className="text-sm font-bold">
                {actual.estado === "trabada"
                  ? `esperando hace ${actual.cuando}`
                  : actual.estado === "hecho"
                    ? actual.cuando
                    : `hace ${actual.cuando}`}
                {actual.quien && actual.estado !== "trabada" ? ` · ${actual.quien}` : ""}
              </span>
            )}
          </p>
        )}

        {cumplidos.length > 0 && (
          <p className="mt-2 text-sm font-semibold leading-relaxed text-muted-foreground">
            {cumplidos.map(({ c, clave }, i) => (
              <span key={clave}>
                {i > 0 && " · "}
                {ABREV[clave]} {c.cuando}
                {c.quien && ` ${c.quien}`}
              </span>
            ))}
          </p>
        )}
      </Link>
    </li>
  )
}

/**
 * Cuando no hay NINGUNA orden cargada.
 *
 * Un renglón y el link, no un cartel. El estado vacío no puede ocupar más que
 * el contenido real: el bloque que había antes en esta pantalla eran ~140 px de
 * caja punteada para informar que no había nada.
 */
function SinOrdenes() {
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl border border-border bg-card px-5 py-4 text-base font-semibold text-muted-foreground">
      <FileText aria-hidden="true" className="size-5 shrink-0" />
      <span className="font-bold text-foreground">No hay ninguna orden en la planta.</span>
      Las órdenes aparecen acá en cuanto se cargan.
      <Link href="/ordenes/nueva" className="font-bold text-brand underline dark:text-primary-200">
        Cargar una orden
      </Link>
    </p>
  )
}
