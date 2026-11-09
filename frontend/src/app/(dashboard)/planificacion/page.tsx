"use client"

/**
 * Tablero de planta — dónde está cada pedido, en vivo.
 *
 * La pantalla está dibujada como el recorrido que es: cinco pasos numerados,
 * en orden (orden de trabajo → extrusión → impresión → troquelado →
 * finalizado) y abajo el depósito.
 *
 * Estos números NO son los ①②③ de la ficha impresa, y está bien: el papel
 * numera las tres cosas que hace el operario en la máquina, esta pantalla
 * numera el recorrido completo de la orden. Son dos audiencias distintas —el
 * que está en la máquina y el que mira la planta de arriba—, así que no tienen
 * por qué coincidir. La ficha impresa (`print/ordenes/[id]`) no se toca.
 *
 * Los pasos 2 a 4 salen de los escaneos del QR. El paso 1 son las órdenes que
 * todavía no entraron a la planta: las recién cargadas en Órdenes de Trabajo y
 * también las que ya están en producción pero que nadie escaneó nunca. Al paso
 * 5 llega cuando alguien le cambia el estado a «completada». El depósito
 * tampoco sale de un escaneo: se carga desde la pantalla de Stock. No hay carga
 * manual acá, sólo lectura.
 *
 * Los contadores salen de `pasos[].total` y no se calculan acá: cada orden no
 * cancelada cae en EXACTAMENTE un paso. Antes esta pantalla contaba los pases
 * ABIERTOS (`maquinas` y `etapas`), así que una orden cuyo pase lo cerró el
 * escaneo de la orden siguiente al entrar a la misma impresora no salía en
 * ningún paso. Medido contra producción: de 3 órdenes en proceso se veía 1.
 *
 * Reacciona al escaneo. El dato lo trae `useTablero()`, que pregunta cada 3 s
 * por `GET /api/produccion/version` —una consulta barata— y pide el tablero
 * entero sólo cuando ese valor cambió; el refresco ciego de 15 s quedó
 * únicamente como red de seguridad. Polling y no SSE a propósito: el front pasa
 * por el proxy de Next, que buferea la respuesta entera y colgaría un stream, y
 * Vercel cortaría la función igual sin `maxDuration`.
 *
 * Antes esta pantalla tenía su propio `setInterval` contra el mismo endpoint
 * que los dos bloques del dashboard: tres relojes pidiendo lo mismo. Ahora es
 * uno.
 */
import { PageContainer } from "@/components/ui/page-container"
import { PageHeader } from "@/components/ui/page-header"
import { desdeHace, fechaCorta } from "@/lib/fechas"
import {
  SIGUIENTE_DE, estaTrabada,
  type ClavePaso, type MaquinaTablero, type OrdenEnPaso, type PasoTablero,
  type StockTableroItem,
} from "@/lib/api/types"
import { refrescarTablero, useTablero } from "@/lib/use-tablero"
import {
  AlertCircle, AlertTriangle, Boxes, CheckCircle2, CircleSlash, Factory, FileText, Loader2,
  PackageOpen, RefreshCw, Wrench,
} from "lucide-react"
import Link from "next/link"

const nf = new Intl.NumberFormat("es-AR")

/** Qué decir cuando un paso de planta está vacío, con el link a mano. */
const VACIO_PLANTA: Record<string, string> = {
  extrusion:
    "Una orden aparece acá cuando el operario escanea el QR en la máquina, y se va cuando alguien la escanea en impresión.",
  impresion:
    "Una orden aparece acá cuando el operario escanea el QR en la impresora, y se va cuando alguien la escanea en troquelado.",
  troquelado:
    "Una orden aparece acá cuando el operario escanea el QR en la máquina, y se va cuando le ponen estado «Completada».",
}

export default function PlanificacionPage() {
  const { datos, falló, mensaje, cargando } = useTablero()

  // `normalizar()` en `use-tablero` garantiza los cinco pasos y en orden.
  const pasos = datos?.pasos ?? []
  const paso = (clave: ClavePaso) => pasos.find((p) => p.clave === clave)

  return (
    <PageContainer>
      <PageHeader
        icon={Factory}
        title="Tablero de planta"
        subtitle="Los cinco pasos del trabajo, en orden, y lo que hay en el depósito"
      />

      {datos && (
        <div className="mb-6 flex flex-wrap gap-3">
          <Chip label="Sin arrancar" valor={paso("orden_trabajo")?.total ?? 0} />
          <Chip label="Impresoras trabajando" valor={datos.resumen.ocupadas} />
          <Chip label="Impresoras libres" valor={datos.resumen.libres} />
          {/* De los pasos y no de `resumen.en_etapas`: ese cuenta pases
              abiertos, así que dejaba afuera a las que terminaron la etapa y
              están esperando la siguiente. */}
          <Chip
            label="En extrusión o troquelado"
            valor={(paso("extrusion")?.total ?? 0) + (paso("troquelado")?.total ?? 0)}
          />
          <Chip label="Finalizadas" valor={paso("finalizado")?.total ?? 0} />
          <Chip
            label="Bajo mínimo"
            valor={datos.resumen.bajo_minimo ?? 0}
            alerta={(datos.resumen.bajo_minimo ?? 0) > 0}
          />
          {/* El número accionable de la pantalla: órdenes paradas entre dos
              máquinas. Va acá arriba y no solamente adentro de cada paso
              porque es lo que hay que ver sin abrir nada. */}
          <Chip
            label="Esperando la etapa siguiente"
            valor={trabadasDe(pasos)}
            alerta={trabadasDe(pasos) > 0}
          />
          {/* `alerta` apagada a propósito: este número es la suma de las
              órdenes que nadie escaneó nunca (paso 1) más las que están
              esperando la etapa siguiente (chip de al lado), y las dos ya
              salen marcadas en su paso. Dos alarmas para el mismo problema en
              la misma fila se leen como dos problemas. */}
          <Chip
            label="Sin ubicar"
            valor={datos.resumen.sin_ubicar}
            href={datos.sin_ubicar.length > 0 ? "#sin-ubicar" : undefined}
          />
          {/* Las canceladas no entran en ningún paso. Si el número no estuviera
              escrito, la suma de los cinco pasos no cerraría contra el total de
              órdenes y parecería que el tablero perdió trabajo otra vez. */}
          {(datos.resumen.canceladas ?? 0) > 0 && (
            <Chip label="Canceladas" valor={datos.resumen.canceladas} />
          )}
          <button
            type="button"
            onClick={refrescarTablero}
            className="ml-auto flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`h-4 w-4 ${cargando ? "animate-spin" : ""}`} />
            Actualizar
          </button>
        </div>
      )}

      {falló && mensaje && (
        <p className="mb-6 flex items-center gap-2 rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-3 text-base font-semibold text-red-700 dark:text-red-400">
          <AlertCircle className="h-5 w-5 shrink-0" />
          {mensaje}
        </p>
      )}

      {cargando && !datos ? (
        <div className="flex items-center gap-3 py-16 text-lg font-semibold text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          Leyendo la planta…
        </div>
      ) : datos ? (
        <>
          {/* Lo único de esta pantalla sobre lo que se puede ACTUAR va arriba
              de los pasos, no al final.

              Antes salía última, detrás del último paso y del depósito, y los
              dos arrancan vacíos en la planta: dos bloques punteados de ~200px
              que en la tablet de 1024x768 obligaban a scrollear más de una
              pantalla y media de placeholders para enterarse de que hay órdenes
              perdidas. Arriba del recorrido y no metida entre dos pasos porque
              la numeración tiene que leerse de corrido: una sección en el medio
              corta esa lectura, y acá la alerta entra en la primera pantalla
              igual.

              Los cinco pasos siguen saliendo completos y en orden abajo. */}
          {datos.sin_ubicar.length > 0 && (
            <section id="sin-ubicar" className="mb-8 scroll-mt-6 rounded-2xl border-2 border-amber-500 bg-amber-500/10 px-5 py-4">
              <h2 className="mb-1 flex items-center gap-2 text-xl font-extrabold uppercase tracking-[0.12em] text-amber-700 dark:text-amber-400">
                <CircleSlash className="h-6 w-6 shrink-0" />
                Ninguna máquina las tiene tomadas
              </h2>
              {/* El texto que había —«nadie las escaneó»— era FALSO para la
                  mitad de esta lista: una orden entra acá también cuando la
                  escanearon y después el escaneo de otra orden en la misma
                  impresora le cerró el pase. OT-0001 en producción la
                  escanearon dos veces y salía acá abajo de ese cartel.
                  Lo que sí es cierto de las dos mitades es que ahora mismo no
                  hay ninguna máquina trabajándolas; en qué paso quedó cada una
                  lo dice el recorrido de abajo. */}
              <p className="mb-3 text-base font-semibold text-foreground">
                Están en producción pero ahora mismo no hay ninguna máquina
                trabajándolas. Abajo, en los pasos, se ve por dónde pasó cada una.
              </p>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {datos.sin_ubicar.map((o) => (
                  <Link
                    key={o.id}
                    href={`/ordenes?buscar=${o.numero}`}
                    className="rounded-xl border-2 border-amber-500/60 bg-card px-4 py-3 transition hover:border-amber-600"
                  >
                    <p className="text-lg font-extrabold text-foreground">{o.numero}</p>
                    <p className="text-base font-semibold text-muted-foreground">{o.cliente}</p>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Los cinco pasos salen siempre, incluso vacíos: si un paso sin
              trabajo desapareciera, el 4 pasaría a estar en el lugar del 3 y el
              recorrido dejaría de leerse de corrido. */}
          <ol className="flex flex-col">
            {pasos.map((p, i) => {
              const trabadas = p.ordenes.filter((o) => estaTrabada(p.clave, o.en_maquina))
              const impresoras = datos.maquinas.filter(
                (m) => (m.tipo ?? "").toLowerCase() === p.clave,
              )
              // Se saca de la lista lo que YA se está dibujando en una tarjeta
              // de máquina, y nada más. Filtrar por `en_maquina` sería más
              // corto pero esconde una orden si `maquinas` y `pasos` llegaran a
              // no coincidir: una con `en_maquina: true` que ninguna máquina
              // muestra desaparecería de la pantalla, que es exactamente el bug
              // que este cambio vino a arreglar. Preferible repetirla a
              // perderla.
              const yaEnMaquina = new Set(
                impresoras.map((m) => m.orden?.id).filter((id) => id != null),
              )
              const enTarjetas = ordenar(p).filter((o) => !yaEnMaquina.has(o.id))

              return (
                <Paso
                  key={p.clave}
                  numero={p.numero}
                  titulo={p.titulo}
                  cuenta={p.total}
                  // Mismo recorte y misma redacción que el depósito y que la
                  // card del dashboard: tiene que decirse igual en los tres.
                  nota={
                    p.ordenes.length < p.total
                      ? `· se ven las ${nf.format(p.ordenes.length)} más recientes`
                      : null
                  }
                  ultimo={i === pasos.length - 1}
                >
                  {/* El aviso va ANTES de las tarjetas: si va después, el que
                      ve la tarjeta amarilla primero no sabe qué le dicen. */}
                  <AvisoTrabadas clave={p.clave} cuantas={trabadas.length} />

                  {/* Impresión se abre en una tarjeta por máquina (Venus y las
                      otras hacen cosas distintas); extrusión y troquelado van
                      en tarjetas de orden, porque ahí las máquinas son
                      intercambiables y no se elige ninguna. */}
                  {impresoras.length > 0 && (
                    <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      {impresoras.map((m) => <TarjetaMaquina key={m.id} maquina={m} />)}
                    </div>
                  )}

                  {enTarjetas.length > 0 ? (
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      {enTarjetas.map((o) => (
                        <TarjetaOrden key={o.id} clave={p.clave} orden={o} />
                      ))}
                    </div>
                  ) : (
                    impresoras.length === 0 && <VacioDe paso={p} />
                  )}
                </Paso>
              )
            })}
          </ol>

          {/* El depósito no es un paso del flujo —no se escanea, no tiene
              número— pero es dónde termina lo que salió del paso 5, así que
              cierra la pantalla. */}
          <div className="mt-2">
            <section>
              <h2 className="mb-1 flex items-center gap-2 text-lg font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
                <Boxes className="h-5 w-5" />
                Depósito
              </h2>
              <p className="mb-3 text-base font-semibold text-muted-foreground">
                {datos.stock.total_items > 0 ? (
                  <>
                    Producto terminado: {nf.format(datos.stock.total_items)}{" "}
                    {datos.stock.total_items === 1 ? "item" : "items"} en el depósito
                    {datos.stock.terminado.length < datos.stock.total_items && (
                      <> · se ven los primeros {datos.stock.terminado.length}</>
                    )}
                  </>
                ) : (
                  "Lo que quedó en depósito de producto terminado"
                )}
              </p>

              {datos.stock.terminado.length === 0 ? (
                <Vacio
                  icon={PackageOpen}
                  titulo="No hay producto terminado cargado"
                  detalle="El depósito muestra los items de stock de tipo producto terminado. Todavía no hay ninguno dado de alta: se cargan en la pantalla de Stock y desde ahí aparecen acá."
                  href="/stock"
                  cta="Ir a Stock"
                />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {datos.stock.terminado.map((i) => <TarjetaStock key={i.id} item={i} />)}
                </div>
              )}
            </section>
          </div>
        </>
      ) : null}
    </PageContainer>
  )
}

/**
 * Un paso del flujo: el número en un círculo y, debajo, la línea que lo une al
 * paso siguiente.
 *
 * El círculo está dibujado como el `ot-paso-num` del papel pero relleno en vez
 * de contorneado: en el papel el contorno negro sobre blanco se ve de lejos, y
 * en pantalla —con tema claro y oscuro— lo que se ve de lejos es blanco sobre
 * el azul de marca. Es la misma FORMA, no el mismo número: la numeración de
 * esta pantalla es el recorrido de la orden (cinco pasos) y la del papel son
 * las tres cosas que hace el operario en la máquina.
 *
 * La línea es lo que hace que los cinco pasos se lean como una progresión y no
 * como cinco listas sueltas.
 */
function Paso({
  numero, titulo, cuenta, nota, ultimo, children,
}: {
  numero: number
  titulo: string
  cuenta: number
  /** Letra chica al lado de la cuenta: hoy, el aviso de que la lista viene recortada */
  nota?: string | null
  ultimo?: boolean
  children: React.ReactNode
}) {
  return (
    <li className="grid grid-cols-[2.75rem_1fr] gap-x-3 sm:grid-cols-[3.5rem_1fr] sm:gap-x-5">
      <div className="flex flex-col items-center">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand text-2xl font-extrabold tabular-nums leading-none text-white">
          {numero}
        </span>
        {!ultimo && (
          <span className="mt-2 w-[3px] flex-1 rounded-full bg-brand/30" aria-hidden="true" />
        )}
      </div>

      <div className={ultimo ? "" : "pb-9"}>
        <h2 className="mb-3 flex flex-wrap items-baseline gap-x-3 pt-1">
          <span className="text-xl font-extrabold uppercase tracking-[0.12em] text-foreground sm:text-2xl">
            {titulo}
          </span>
          <span className="text-base font-bold uppercase tracking-wider text-muted-foreground">
            {cuenta === 1 ? "1 trabajo" : `${nf.format(cuenta)} trabajos`}
            {nota && <> {nota}</>}
          </span>
        </h2>
        {children}
      </div>
    </li>
  )
}

/**
 * Un número grande con su etiqueta.
 *
 * Con `href` se vuelve un link a la sección que explica ese número: un contador
 * que avisa de un problema y no lleva a ningún lado obliga a buscarlo a mano.
 */
function Chip({
  label, valor, alerta, href,
}: {
  label: string
  valor: number
  alerta?: boolean
  href?: string
}) {
  const clases = `rounded-xl border-2 px-4 py-2 ${
    alerta ? "border-amber-500 bg-amber-500/10" : "border-border bg-card"
  }`

  const contenido = (
    <>
      <span className="text-2xl font-extrabold tabular-nums text-foreground">{valor}</span>
      <span className="ml-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
    </>
  )

  if (!href) return <div className={clases}>{contenido}</div>

  return (
    <Link
      href={href}
      className={`${clases} transition ${alerta ? "hover:border-amber-600" : "hover:border-brand"}`}
    >
      {contenido}
    </Link>
  )
}

/**
 * Un bloque vacío que enseña qué falta hacer para llenarlo.
 *
 * «Sin datos» a secas en una pantalla recién estrenada se lee como «está roto»:
 * el depósito y el paso 5 arrancan vacíos en todas las instalaciones, así que el
 * estado vacío tiene que decir de dónde salen los datos y dejar el link a mano.
 */
function Vacio({
  icon: Icon, titulo, detalle, href, cta,
}: {
  icon: React.ComponentType<{ className?: string }>
  titulo: string
  detalle: string
  href: string
  cta: string
}) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-border bg-muted/30 px-5 py-6">
      <p className="flex items-center gap-2 text-xl font-extrabold text-foreground">
        <Icon className="h-6 w-6 shrink-0 text-muted-foreground" />
        {titulo}
      </p>
      <p className="mt-2 max-w-[60ch] text-base font-semibold text-muted-foreground">{detalle}</p>
      <Link
        href={href}
        className="mt-4 inline-flex rounded-lg bg-brand px-4 py-2 text-base font-bold text-white transition hover:bg-brand-strong"
      >
        {cta}
      </Link>
    </div>
  )
}

/**
 * Cuántas órdenes están paradas entre dos máquinas, en toda la planta.
 *
 * Sólo cuenta los pasos de planta: en el paso 1 la orden todavía no entró y en
 * el 5 ya salió, así que ahí «no está en máquina» es lo normal.
 */
function trabadasDe(pasos: PasoTablero[]): number {
  return pasos.reduce(
    (n, p) => n + p.ordenes.filter((o) => estaTrabada(p.clave, o.en_maquina)).length,
    0,
  )
}

/**
 * Las trabadas primero.
 *
 * El backend manda las más recientes primero, que es lo correcto para una
 * lista. Pero dentro de un paso la única cosa accionable es la orden que quedó
 * esperando la etapa siguiente: si está novena, no se ve. El resto mantiene el
 * orden del backend.
 */
function ordenar(paso: PasoTablero): OrdenEnPaso[] {
  const trabada = (o: OrdenEnPaso) => estaTrabada(paso.clave, o.en_maquina)
  const trabadas = paso.ordenes.filter(trabada)
  if (trabadas.length === 0 || trabadas.length === paso.ordenes.length) return paso.ordenes
  return [...trabadas, ...paso.ordenes.filter((o) => !trabada(o))]
}

/**
 * El aviso de que hay órdenes paradas entre dos máquinas.
 *
 * Es lo único de esta pantalla sobre lo que se puede ACTUAR, y dice entre qué
 * dos etapas se quedó el trabajo. Escrito para alguien parado en la planta: la
 * acción concreta es ir a esa máquina y escanear el QR.
 */
function AvisoTrabadas({ clave, cuantas }: { clave: ClavePaso; cuantas: number }) {
  const siguiente = SIGUIENTE_DE[clave]
  if (cuantas === 0 || !siguiente) return null

  // Singular y plural escritos enteros: armar la frase pegando una «s» deja
  // «Hay 1 orden… están… cuando arranquen», que es como escribe un sistema y
  // no una persona. Esto lo lee alguien parado en la planta.
  const una = cuantas === 1
  const queHacer =
    clave === "troquelado"
      ? una
        ? "Está terminada en la planta: hay que cerrarla en Órdenes de Trabajo."
        : "Están terminadas en la planta: hay que cerrarlas en Órdenes de Trabajo."
      : una
        ? `Está en la planta pero en ninguna máquina. Cuando arranque, hay que escanear el QR en ${siguiente}.`
        : `Están en la planta pero en ninguna máquina. Cuando arranquen, hay que escanear el QR en ${siguiente}.`

  return (
    <p className="mb-4 flex items-start gap-3 rounded-2xl border-2 border-amber-500 border-l-[10px] bg-amber-500/10 px-5 py-4 text-lg font-bold text-foreground">
      <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-amber-700 dark:text-amber-400" />
      <span>
        {una
          ? `Hay 1 orden que ya pasó por acá y está esperando ${siguiente}. `
          : `Hay ${nf.format(cuantas)} órdenes que ya pasaron por acá y están esperando ${siguiente}. `}
        {queHacer}
      </span>
    </p>
  )
}

/**
 * Una orden dentro de un paso, en cualquiera de los cinco.
 *
 * Reemplaza a las tres tarjetas casi idénticas que había (`TarjetaEtapa`,
 * `TarjetaPendiente`, `TarjetaFinalizada`): el contrato manda la misma forma
 * para los cinco pasos, así que mantener tres copias era dejar que se
 * desincronicen.
 *
 * Las dos situaciones de un paso de planta NO se pueden ver iguales:
 *
 *  - en la máquina ahora → borde de marca, sólido
 *  - trabada entre dos etapas → amarillo + barra gruesa a la izquierda + ícono
 *
 * Tres señales y no sólo el color: el que mira el tablero puede ser daltónico,
 * y la pantalla de la planta se mira de lejos y de costado. La barra gruesa de
 * la izquierda es lo que se ve primero desde tres metros.
 *
 * El punteado queda reservado para el paso 1, que es su significado en toda
 * esta pantalla: todavía no empezó (lo mismo que una impresora libre).
 */
function TarjetaOrden({ clave, orden }: { clave: ClavePaso; orden: OrdenEnPaso }) {
  const trabada = estaTrabada(clave, orden.en_maquina)
  const siguiente = SIGUIENTE_DE[clave]

  const borde = trabada
    ? "border-amber-500 border-l-[10px] bg-amber-500/10 hover:border-amber-600"
    : clave === "orden_trabajo"
      ? "border-dashed border-border bg-card hover:border-brand"
      : clave === "finalizado"
        ? "border-border bg-card hover:border-brand"
        : "border-brand bg-card hover:border-brand-strong"

  return (
    <Link
      href={`/ordenes?buscar=${orden.numero}`}
      className={`rounded-2xl border-2 p-5 transition ${borde}`}
    >
      <p className="text-2xl font-extrabold leading-tight text-foreground">
        {orden.producto ?? "Sin producto cargado"}
      </p>
      <p className="mt-1 text-lg font-bold text-brand">{orden.numero}</p>
      <p className="text-base font-semibold text-foreground">{orden.cliente ?? "Sin cliente"}</p>

      {trabada && siguiente && (
        <p className="mt-3 flex items-center gap-2 text-lg font-extrabold text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          Esperando {siguiente}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold text-muted-foreground">
        {orden.cantidad != null && <span>{nf.format(orden.cantidad)} u</span>}
        {orden.maquina && <span>{orden.maquina}</span>}
        {orden.operario && <span>{orden.operario}</span>}
        {orden.desde && <span>{cuando(clave, trabada, orden.desde)}</span>}
        {orden.lote && <span className="font-mono">{orden.lote}</span>}
      </div>
    </Link>
  )
}

/**
 * El renglón de tiempo de una tarjeta.
 *
 * En el paso 5 el día y no el «hace tanto»: de una orden cerrada lo que se
 * busca es la fecha de cierre. En los otros cuatro es al revés —«hace 3 h» es
 * una cola que avanza, «hace 6 días» es un problema, y el día suelto no dice
 * ninguna de las dos cosas sin hacer la cuenta mentalmente—. En una trabada es
 * EL dato de la tarjeta, así que lleva la palabra puesta.
 */
function cuando(clave: ClavePaso, trabada: boolean, desde: string): string {
  if (clave === "finalizado") return fechaCorta(desde)
  if (trabada) return `trabada ${desdeHace(desde)}`
  if (clave === "orden_trabajo") return `Emitida ${desdeHace(desde)}`
  return desdeHace(desde)
}

/** El estado vacío de cada paso, con el link a lo que hay que hacer. */
function VacioDe({ paso }: { paso: PasoTablero }) {
  if (paso.clave === "orden_trabajo") {
    return (
      <Vacio
        icon={FileText}
        titulo="No hay órdenes esperando para arrancar"
        detalle="Acá caen las órdenes recién cargadas en Órdenes de Trabajo y también las que ya están en producción pero que nadie escaneó nunca. Una orden se va de este paso cuando el operario escanea el QR en la primera máquina."
        href="/ordenes/nueva"
        cta="Cargar una orden"
      />
    )
  }
  if (paso.clave === "finalizado") {
    return (
      <Vacio
        icon={CheckCircle2}
        titulo="Todavía no se cerró ninguna orden"
        detalle="Una orden cae acá cuando le ponen estado «Completada» en Órdenes de Trabajo. Mientras siga en producción, se ve en los pasos de arriba."
        href="/ordenes"
        cta="Ir a Órdenes de Trabajo"
      />
    )
  }
  return (
    <p className="rounded-2xl border-2 border-dashed border-border bg-muted/30 px-5 py-6 text-xl font-bold text-muted-foreground">
      Ninguna orden quedó en {paso.titulo.toLowerCase()}.{" "}
      <span className="font-semibold">{VACIO_PLANTA[paso.clave]}</span>
    </p>
  )
}

function TarjetaMaquina({ maquina }: { maquina: MaquinaTablero }) {
  const ocupada = maquina.orden

  return (
    <div
      className={`rounded-2xl border-2 p-5 ${
        ocupada ? "border-brand bg-card" : "border-dashed border-border bg-muted/30"
      }`}
    >
      <div className="mb-3 flex items-center gap-2">
        <Wrench className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-extrabold uppercase tracking-[0.16em] text-muted-foreground">
          {maquina.nombre}
        </span>
      </div>

      {!ocupada ? (
        <p className="py-3 text-xl font-bold text-muted-foreground">Libre</p>
      ) : (
        <Link href={`/ordenes?buscar=${ocupada.numero}`} className="block">
          <p className="text-2xl font-extrabold leading-tight text-foreground">
            {ocupada.producto ?? "Sin producto cargado"}
          </p>
          <p className="mt-1 text-lg font-bold text-brand">{ocupada.numero}</p>
          <p className="text-base font-semibold text-foreground">{ocupada.cliente}</p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold text-muted-foreground">
            {ocupada.operario && <span>{ocupada.operario}</span>}
            <span>{desdeHace(ocupada.desde)}</span>
            {ocupada.lote && <span className="font-mono">{ocupada.lote}</span>}
          </div>
        </Link>
      )}
    </div>
  )
}

/**
 * Una fila del depósito.
 *
 * Tarjeta y no `DataTable` a propósito: esto es una vista de planta que se mira
 * de parado y de lejos, donde el número tiene que entrar de un vistazo. Una
 * tabla con el dato en `text-sm` es lo correcto en la pantalla de Stock —ahí se
 * compara y se filtra, sentado— pero acá no se lee.
 */
function TarjetaStock({ item }: { item: StockTableroItem }) {
  return (
    <div
      className={`rounded-2xl border-2 p-5 ${
        item.bajo_minimo ? "border-red-500/60 bg-red-500/5" : "border-border bg-card"
      }`}
    >
      <p className="text-xl font-extrabold leading-tight text-foreground">{item.nombre}</p>
      <div className="flex flex-wrap gap-x-3 text-base font-semibold text-muted-foreground">
        {item.codigo && <span className="font-mono">{item.codigo}</span>}
        {item.cliente_nombre && <span>{item.cliente_nombre}</span>}
      </div>

      <p
        className={`mt-3 flex items-center gap-2 text-3xl font-extrabold tabular-nums leading-none ${
          item.bajo_minimo ? "text-red-600 dark:text-red-400" : "text-foreground"
        }`}
      >
        {item.bajo_minimo && <AlertTriangle className="h-6 w-6 shrink-0" />}
        {nf.format(item.stock_actual ?? 0)}
        {item.unidad && <span className="text-lg font-bold">{item.unidad}</span>}
      </p>

      <p className="mt-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {item.stock_minimo != null
          ? `Mínimo ${nf.format(item.stock_minimo)}${item.bajo_minimo ? " · bajo mínimo" : ""}`
          : "Sin mínimo definido"}
      </p>
    </div>
  )
}
