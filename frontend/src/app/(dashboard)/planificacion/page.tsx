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
 * Los pasos 2 a 4 salen de los escaneos del QR. El paso 1 es la orden recién
 * cargada en Órdenes de Trabajo, que todavía no arrancó. Al paso 5 llega
 * cuando alguien le cambia el estado a «completada». El depósito tampoco sale
 * de un escaneo: se carga desde la pantalla de Stock. No hay carga manual acá,
 * sólo lectura.
 *
 * Se refresca sola cada 15 segundos. Polling y no websockets a propósito: el
 * backend duerme en Railway y una conexión abierta se cae igual; además una
 * planta no cambia de estado cinco veces por segundo. 15 segundos es «en vivo»
 * de sobra para esto, y no hay infraestructura nueva que mantener.
 */
import { PageContainer } from "@/components/ui/page-container"
import { PageHeader } from "@/components/ui/page-header"
import { api } from "@/lib/api"
import { desdeHace, fechaCorta } from "@/lib/fechas"
import type {
  EtapaProduccion, MaquinaTablero, OrdenEnMaquina, OrdenFinalizada, OrdenPendiente,
  StockTableroItem, TableroProduccion,
} from "@/lib/api/types"
import {
  AlertCircle, AlertTriangle, Boxes, CheckCircle2, CircleSlash, Factory, FileText, Loader2,
  PackageOpen, RefreshCw, Wrench,
} from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useState } from "react"

const REFRESCO_MS = 15_000

const nf = new Intl.NumberFormat("es-AR")

/**
 * Los tres pasos que sí salen de un escaneo, con su lugar en el recorrido.
 *
 * Arrancan en 2 porque el paso 1 es la orden emitida que todavía no entró a la
 * planta, y ésa no se escanea.
 */
const PASOS_ESCANEADOS: { numero: number; tipo: EtapaProduccion; titulo: string }[] = [
  { numero: 2, tipo: "extrusion",  titulo: "Extrusión"  },
  { numero: 3, tipo: "impresion",  titulo: "Impresión"  },
  { numero: 4, tipo: "troquelado", titulo: "Troquelado" },
]

export default function PlanificacionPage() {
  const [datos, setDatos]       = useState<TableroProduccion | null>(null)
  const [error, setError]       = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)

  const traer = useCallback(async (silencioso = false) => {
    if (!silencioso) setCargando(true)
    try {
      const t = await api.produccion.tablero()
      // El backend promete que `finalizadas` y `stock` vienen siempre, pero
      // front y back se deployan por separado (Vercel y Railway): hay una
      // ventana en la que esta pantalla ya es nueva y la API todavía no. Sin
      // estos defaults, en esa ventana el tablero entero queda en blanco por
      // una clave que falta.
      setDatos({
        ...t,
        pendientes: t.pendientes ?? [],
        finalizadas: t.finalizadas ?? [],
        stock: t.stock ?? { terminado: [], total_items: 0, bajo_minimo: 0 },
      })
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer el tablero")
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    traer()
    const t = setInterval(() => traer(true), REFRESCO_MS)
    return () => clearInterval(t)
  }, [traer])

  // Cuántas órdenes finalizadas hay DE VERDAD. `resumen.finalizadas` es el
  // largo de la lista, que el backend recorta: mostrar ese número al lado de
  // «Impresoras trabajando» y «Sin ubicar» —que sí son totales— dejaba el
  // tablero diciendo «20 finalizadas» para siempre. El `??` cubre la ventana
  // de deploy en la que el front ya es nuevo y la API todavía no manda el
  // campo (Vercel y Railway se deployan por separado).
  const finalizadasTotal = datos?.resumen.finalizadas_total ?? datos?.finalizadas.length ?? 0

  // Mismo caso que `finalizadasTotal`: la lista de pendientes viene con tope de
  // 20, así que su largo no es el total. Los `??` cubren la ventana de deploy
  // en la que el front ya es nuevo y la API todavía no manda el campo.
  const pendientesTotal = datos?.resumen.pendientes_total ?? datos?.pendientes?.length ?? 0

  return (
    <PageContainer>
      <PageHeader
        icon={Factory}
        title="Tablero de planta"
        subtitle="Los cinco pasos del trabajo, en orden, y lo que hay en el depósito"
      />

      {datos && (
        <div className="mb-6 flex flex-wrap gap-3">
          <Chip label="Sin arrancar" valor={pendientesTotal} />
          <Chip label="Impresoras trabajando" valor={datos.resumen.ocupadas} />
          <Chip label="Impresoras libres" valor={datos.resumen.libres} />
          <Chip label="En extrusión o troquelado" valor={datos.resumen.en_etapas} />
          <Chip label="Finalizadas" valor={finalizadasTotal} />
          <Chip
            label="Bajo mínimo"
            valor={datos.resumen.bajo_minimo ?? 0}
            alerta={(datos.resumen.bajo_minimo ?? 0) > 0}
          />
          {/* El único chip que lleva a algún lado: avisa de algo sobre lo que
              hay que actuar, así que tiene que poder llevar ahí. Si no hay
              ninguna sin ubicar la sección no se dibuja, y el chip vuelve a
              ser un número suelto. */}
          <Chip
            label="Sin ubicar"
            valor={datos.resumen.sin_ubicar}
            alerta={datos.resumen.sin_ubicar > 0}
            href={datos.sin_ubicar.length > 0 ? "#sin-ubicar" : undefined}
          />
          <button
            type="button"
            onClick={() => traer()}
            className="ml-auto flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`h-4 w-4 ${cargando ? "animate-spin" : ""}`} />
            Actualizar
          </button>
        </div>
      )}

      {error && (
        <p className="mb-6 flex items-center gap-2 rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-3 text-base font-semibold text-red-700 dark:text-red-400">
          <AlertCircle className="h-5 w-5 shrink-0" />
          {error}
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
                En producción, sin escanear
              </h2>
              <p className="mb-3 text-base font-semibold text-foreground">
                Arrancaron pero nadie las escaneó, así que el sistema no sabe en qué
                máquina están.
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
            {/* Paso 1: la orden ya emitida que todavía no entró a la planta.
                No sale de un escaneo —es `estado` en borrador o pendiente— y es
                el paso que faltaba: antes el tablero arrancaba en extrusión,
                así que una orden cargada y sin arrancar no aparecía en ningún
                lado. La cuenta es el total real y el aviso del recorte va
                redactado igual que el del paso 5 y el del depósito. */}
            <Paso
              numero={1}
              titulo="Orden de trabajo"
              cuenta={pendientesTotal}
              nota={
                datos.pendientes.length < pendientesTotal
                  ? `· se ven los primeros ${nf.format(datos.pendientes.length)}`
                  : null
              }
            >
              {datos.pendientes.length === 0 ? (
                <Vacio
                  icon={FileText}
                  titulo="No hay órdenes esperando para arrancar"
                  detalle="Una orden aparece acá en cuanto se carga en Órdenes de Trabajo, y se va de este paso cuando el operario escanea el QR en la primera máquina."
                  href="/ordenes/nueva"
                  cta="Cargar una orden"
                />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {datos.pendientes.map((o) => <TarjetaPendiente key={o.id} orden={o} />)}
                </div>
              )}
            </Paso>

            {PASOS_ESCANEADOS.map(({ numero, tipo, titulo }) => {
              const impresoras = datos.maquinas.filter(
                (m) => (m.tipo ?? "").toLowerCase() === tipo,
              )
              const ordenes = datos.etapas.find((e) => e.etapa === tipo)?.ordenes ?? []

              return (
                <Paso
                  key={tipo}
                  numero={numero}
                  titulo={titulo}
                  cuenta={
                    impresoras.length > 0
                      ? impresoras.filter((m) => m.orden).length
                      : ordenes.length
                  }
                >
                  {/* Impresión se abre en una tarjeta por máquina (Venus y las
                      otras hacen cosas distintas); extrusión y troquelado van
                      en tarjetas de orden, porque ahí las máquinas son
                      intercambiables y no se elige ninguna. */}
                  {impresoras.length > 0 ? (
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      {impresoras.map((m) => <TarjetaMaquina key={m.id} maquina={m} />)}
                    </div>
                  ) : (
                    <TarjetaEtapa ordenes={ordenes} />
                  )}
                </Paso>
              )
            })}

            {/* La cuenta es el total real, y el aviso del recorte va redactado
                igual que el del depósito: es el mismo recorte y la pantalla
                tiene que decirlo de la misma forma en los dos lados. */}
            <Paso
              numero={5}
              titulo="Finalizado"
              cuenta={finalizadasTotal}
              nota={
                datos.finalizadas.length < finalizadasTotal
                  ? `· se ven los primeros ${nf.format(datos.finalizadas.length)}`
                  : null
              }
              ultimo
            >
              {datos.finalizadas.length === 0 ? (
                <Vacio
                  icon={CheckCircle2}
                  titulo="Todavía no se cerró ninguna orden"
                  detalle="Una orden cae acá cuando le ponen estado «Completada» en Órdenes de Trabajo. Mientras siga en producción, se ve en los pasos de arriba."
                  href="/ordenes"
                  cta="Ir a Órdenes de Trabajo"
                />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {datos.finalizadas.map((o) => <TarjetaFinalizada key={o.id} orden={o} />)}
                </div>
              )}
            </Paso>
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
 * Una etapa que no elige máquina: lo único que importa es qué hay adentro.
 *
 * No se dibuja una tarjeta por máquina porque no las distingue nadie: en
 * extrusión y troquelado las máquinas son intercambiables.
 */
function TarjetaEtapa({ ordenes }: { ordenes: OrdenEnMaquina[] }) {
  if (ordenes.length === 0) {
    return (
      <p className="rounded-2xl border-2 border-dashed border-border bg-muted/30 px-5 py-6 text-xl font-bold text-muted-foreground">
        Sin trabajos en esta etapa
      </p>
    )
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {ordenes.map((o) => (
        <Link
          key={o.id}
          href={`/ordenes?buscar=${o.numero}`}
          className="rounded-2xl border-2 border-brand bg-card p-5 transition hover:border-brand-strong"
        >
          <p className="text-2xl font-extrabold leading-tight text-foreground">
            {o.producto ?? "Sin producto cargado"}
          </p>
          <p className="mt-1 text-lg font-bold text-brand">{o.numero}</p>
          <p className="text-base font-semibold text-foreground">{o.cliente}</p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold text-muted-foreground">
            {o.operario && <span>{o.operario}</span>}
            <span>{desdeHace(o.desde)}</span>
          </div>
        </Link>
      ))}
    </div>
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
 * Una orden emitida que todavía no arrancó.
 *
 * Con «hace tanto» y no con el día de emisión: de una orden que no arrancó lo
 * que hay que ver de un vistazo es cuánto tiempo lleva esperando. «hace 3 h»
 * es una cola que avanza; «hace 6 días» es un problema. El día suelto no dice
 * ninguna de las dos cosas sin hacer la cuenta mentalmente.
 */
function TarjetaPendiente({ orden }: { orden: OrdenPendiente }) {
  return (
    <Link
      href={`/ordenes?buscar=${orden.numero}`}
      className="rounded-2xl border-2 border-dashed border-border bg-card p-5 transition hover:border-brand"
    >
      <p className="text-2xl font-extrabold leading-tight text-foreground">
        {orden.producto ?? "Sin producto cargado"}
      </p>
      <p className="mt-1 text-lg font-bold text-brand">{orden.numero}</p>
      <p className="text-base font-semibold text-foreground">{orden.cliente ?? "Sin cliente"}</p>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold text-muted-foreground">
        {orden.cantidad != null && <span>{nf.format(orden.cantidad)} u</span>}
        {orden.fecha && <span>Emitida {desdeHace(orden.fecha)}</span>}
        {orden.lote && <span className="font-mono">{orden.lote}</span>}
      </div>
    </Link>
  )
}

/** Una orden que ya salió de la planta. Sin «hace tanto»: acá importa el día. */
function TarjetaFinalizada({ orden }: { orden: OrdenFinalizada }) {
  return (
    <Link
      href={`/ordenes?buscar=${orden.numero}`}
      className="rounded-2xl border-2 border-border bg-card p-5 transition hover:border-brand"
    >
      <p className="text-2xl font-extrabold leading-tight text-foreground">
        {orden.producto ?? "Sin producto cargado"}
      </p>
      <p className="mt-1 text-lg font-bold text-brand">{orden.numero}</p>
      <p className="text-base font-semibold text-foreground">{orden.cliente ?? "Sin cliente"}</p>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold text-muted-foreground">
        {orden.cantidad != null && <span>{nf.format(orden.cantidad)} u</span>}
        {orden.fecha && <span>{fechaCorta(orden.fecha)}</span>}
        {orden.lote && <span className="font-mono">{orden.lote}</span>}
      </div>
    </Link>
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
