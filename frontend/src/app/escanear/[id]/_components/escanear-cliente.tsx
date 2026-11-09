"use client"

/**
 * El escaneo, paso a paso: qué orden es → qué paso → listo.
 *
 * Sólo IMPRESIÓN pregunta en qué máquina: Venus, ReinaFlex, Taurus y la
 * Autoadhesiva hacen cosas distintas. En extrusión y troquelado las máquinas
 * son intercambiables, así que se confirma y listo — un toque menos.
 *
 * Abajo de las tres etapas está el CIERRE, que no es un paso más: las tres
 * primeras dicen «arranco esto» y se pueden volver a escanear sin consecuencia,
 * el cierre termina el pedido y lo saca de la planta. Por eso va separado, con
 * un rótulo propio y con una confirmación de por medio: la tablet vive apoyada
 * en una máquina y un roce no puede cerrar un pedido.
 *
 * Pensada para un celular en la planta, con las manos ocupadas: texto grande,
 * negrita, mucho contraste y botones que se aciertan sin apuntar.
 *
 * ── Contraste ──────────────────────────────────────────────────────────────
 * La app sirve TEMA OSCURO por defecto (`:root` ya trae las variables dark en
 * globals.css), así que el oscuro es el caso normal y el claro el alternativo:
 * todo color de esta pantalla tiene que dar los números en LOS DOS. Por eso el
 * texto de los carteles de color (ámbar, rojo) es `text-foreground` y no el
 * `text-amber-700` de turno: el color queda en el borde y en el ícono —que son
 * señales no textuales y les alcanza 3:1— y las PALABRAS van al máximo
 * contraste que da el tema (15,4:1 oscuro, 15,1:1 claro sobre el ámbar
 * compuesto). Los números de cada decisión están en el comentario de su bloque,
 * medidos sobre el fondo REAL —componiendo los alpha de toda la cadena— y no
 * contra el token pelado.
 *
 * Lo único que queda por debajo de 3:1 es `border-border` (1,19:1 oscuro /
 * 1,14:1 claro) y el relleno `bg-brand/5` (1,01:1 / 1,10:1), y es a propósito:
 * son decorativos. Todas las tarjetas llevan el mismo hilo y el mismo tinte, no
 * distinguen una de otra ni dicen nada que no esté escrito adentro.
 */
import { api } from "@/lib/api/client"
import {
  ETAPAS_CON_MAQUINA,
  type EtapaEscaneable, type EtapaProduccion, type Maquina, type OrdenTrabajo,
} from "@/lib/api/types"
import { fechaCorta } from "@/lib/fechas"
import { refrescarTablero } from "@/lib/use-tablero"
import { AlertTriangle, Check, Loader2, PackageCheck } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"

const ETAPAS: { valor: EtapaProduccion; label: string }[] = [
  { valor: "extrusion",  label: "Extrusión"  },
  { valor: "impresion",  label: "Impresión"  },
  { valor: "troquelado", label: "Troquelado" },
]

/**
 * El cuarto escaneo: el que cierra la orden.
 *
 * No está en `ETAPAS` porque no es una etapa de producción — no ocupa máquina y
 * no tiene columna `fecha_finalizado`; el cierre escribe `fecha_cierre` y
 * `operador_cierre`. Ver `EtapaEscaneable` en `lib/api/types.ts`.
 */
const CIERRE = "finalizado" as const

const etiqueta = (e: EtapaEscaneable) =>
  e === CIERRE ? "Finalizado" : ETAPAS.find((x) => x.valor === e)?.label ?? e

/** El cierre nunca elige máquina: la orden sale de la planta, no entra a una. */
const eligeMaquina = (e: EtapaEscaneable) =>
  e !== CIERRE && ETAPAS_CON_MAQUINA.includes(e)

/**
 * Si esa etapa ya se escaneó, devuelve quién y cuándo. Si no, null.
 *
 * Sale de los campos que el escaneo llena en la orden (`fecha_*`, `operador_*`),
 * los mismos que salen impresos en la ficha.
 *
 * Toma `EtapaProduccion` y NO `EtapaEscaneable` a propósito: para el cierre no
 * hay `fecha_finalizado` que leer, así que `orden["fecha_finalizado"]` daría
 * `undefined` y el cierre se vería siempre como no hecho. Ese caso lo resuelve
 * `textoCierre`.
 */
function yaEscaneada(orden: OrdenTrabajo, etapa: EtapaProduccion): string | null {
  const fecha = orden[`fecha_${etapa}` as keyof OrdenTrabajo] as string | null
  if (!fecha) return null
  const quien = orden[`operador_${etapa}` as keyof OrdenTrabajo] as string | null
  // `fechaCorta` y no `new Date(fecha + "T00:00:00")`: las `fecha_*` son días
  // sueltos, pero `fecha_cierre` es un momento con offset y queremos una sola
  // forma de mostrar fechas en esta pantalla. Ya resuelve los dos formatos.
  const cuando = fechaCorta(fecha)
  return quien ? `${quien}, ${cuando}` : cuando
}

/**
 * Si la orden ya está cerrada, devuelve una línea lista para mostrar. Si no, null.
 *
 * Manda el ESTADO, no la fecha: una orden que se completó a mano desde Órdenes
 * de Trabajo está cerrada igual y no tiene `fecha_cierre` ni `operador_cierre`
 * — lo mismo que las que se cerraron antes de que existieran esas columnas. Por
 * eso cada combinación tiene su texto en vez de armar una frase con huecos.
 */
function textoCierre(orden: OrdenTrabajo): string | null {
  if (orden.estado !== "completada") return null
  const quien = orden.operador_cierre
  const cuando = orden.fecha_cierre ? fechaCorta(orden.fecha_cierre) : ""
  if (quien && cuando) return `Cerrada por ${quien} el ${cuando}`
  if (quien) return `Cerrada por ${quien}`
  if (cuando) return `Cerrada el ${cuando}`
  return "Cerrada desde Órdenes de Trabajo, sin registro de quién ni cuándo"
}

/** Lo que quedó registrado, para la pantalla de «listo». */
interface Registrado {
  maquina: string | null
  etapa: string
  cierre: boolean
  /** Ver `EscaneoEtapaResponse.advertencia`: se cerró sin ningún pase de planta. */
  advertencia: string | null
}

interface Props {
  ordenId: number
  etapaInicial: EtapaProduccion | null
}

export function EscanearCliente({ ordenId, etapaInicial }: Props) {
  const [orden, setOrden]         = useState<OrdenTrabajo | null>(null)
  const [maquinas, setMaquinas]   = useState<Maquina[]>([])
  const [etapa, setEtapa]         = useState<EtapaEscaneable | null>(etapaInicial)
  const [cargando, setCargando]   = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [listo, setListo]         = useState<Registrado | null>(null)
  // Sobre una orden YA CERRADA las etapas no se ofrecen solas: hay que pedirlas.
  // Ver el bloque «Orden cerrada» más abajo.
  const [reproceso, setReproceso] = useState(false)

  useEffect(() => {
    let vivo = true
    Promise.all([api.ordenes.get(ordenId), api.maquinas.list()])
      .then(([o, m]) => {
        if (!vivo) return
        setOrden(o)
        setMaquinas(m)
      })
      .catch((e) => vivo && setError(e instanceof Error ? e.message : "No se pudo abrir la orden"))
      .finally(() => vivo && setCargando(false))
    return () => { vivo = false }
  }, [ordenId])

  const registrar = useCallback(async (maquina: Maquina | null) => {
    if (!etapa) return
    setGuardando(true)
    setError(null)
    try {
      const r = await api.ordenes.escanearEtapa(ordenId, {
        etapa,
        ...(maquina ? { maquina_id: maquina.id } : {}),
      })
      // El tablero tiene que mostrar este movimiento sin esperar un tick.
      //
      // Ojo con lo que esto hace y lo que NO: el store es del navegador, así
      // que esto no despierta al tablero de la OFICINA —ése es otro navegador y
      // lo despierta el sondeo de `/produccion/version` cada 3 s—. Lo que
      // arregla es este navegador: esta pantalla no monta el tablero, pero deja
      // el store al día para cuando el operario vuelva al dashboard o a
      // `/planificacion`, que si no mostrarían la foto de antes del escaneo.
      refrescarTablero()
      setListo({
        maquina: r.maquina?.nombre ?? null,
        etapa: etiqueta(r.etapa),
        cierre: r.etapa === CIERRE,
        // La advertencia del backend vive UNA sola vez, acá. Si se tira, nadie
        // se entera nunca de que ese pedido se cerró sin pasar por planta.
        advertencia: r.advertencia ?? null,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar el escaneo")
    } finally {
      setGuardando(false)
    }
  }, [etapa, ordenId])

  /**
   * Volver al listado de pasos.
   *
   * Limpia el error a propósito: el cartel de un intento que ya no está en
   * pantalla no le sirve a nadie, y si no se limpia reaparece en la próxima
   * etapa que elija, como si hubiera fallado ésa.
   */
  const volver = useCallback(() => {
    setEtapa(null)
    setError(null)
  }, [])

  /**
   * Las etapas que se pueden escanear ahora.
   *
   * Las que no eligen máquina están siempre: no dependen del catálogo. La que
   * sí (impresión) aparece solamente si hay alguna impresora cargada. El cierre
   * no entra en esta lista: va aparte, debajo de las tres.
   */
  const etapasDisponibles = useMemo(
    () => ETAPAS.filter((e) =>
      !eligeMaquina(e.valor) ||
      maquinas.some((m) => (m.tipo ?? "").toLowerCase() === e.valor),
    ),
    [maquinas],
  )

  /* ── Pantallas completas ─────────────────────────────────────────────── */

  if (cargando) {
    return (
      <Pantalla>
        <Loader2 className="h-14 w-14 animate-spin text-brand" />
        <p className="text-xl font-bold text-foreground">Abriendo la orden…</p>
      </Pantalla>
    )
  }

  if (!orden) {
    return (
      <Pantalla>
        <AlertTriangle className="h-16 w-16 text-red-600" />
        <p className="text-2xl font-extrabold text-foreground">No se encontró la orden</p>
        <p className="max-w-sm text-center text-lg font-semibold text-muted-foreground">
          {error ?? "Revisá que el QR sea de una orden que todavía existe."}
        </p>
      </Pantalla>
    )
  }

  if (listo) {
    return (
      <Pantalla>
        {/* El verde va un tono más oscuro en claro y uno más vivo en oscuro: el
            `emerald-500` parejo daba 2,31:1 (anillo) y 2,98:1 (ícono) sobre el
            fondo claro, debajo del 3:1 de WCAG 1.4.11. Así da 5,01:1 / 4,37:1
            en claro y 7,78:1 / 8,09:1 en oscuro. */}
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-emerald-500/15 ring-4 ring-emerald-700 dark:ring-emerald-500">
          {listo.cierre
            ? <PackageCheck className="h-14 w-14 text-emerald-700 dark:text-emerald-400" strokeWidth={2.5} />
            : <Check className="h-14 w-14 text-emerald-700 dark:text-emerald-400" strokeWidth={3} />}
        </div>
        <p className="text-3xl font-extrabold text-foreground">
          {listo.cierre ? "Orden cerrada" : "Registrado"}
        </p>
        <p className="text-center text-xl font-bold text-foreground">
          {orden.numero} · {listo.etapa}
          {/* El azul de marca sobre el fondo oscuro da 1,75:1 y es texto: sobre
              fondos oscuros la marca va en amarillo (15,46:1). En claro el azul
              da 10,27:1 y se queda. */}
          {listo.maquina && <><br /><span className="text-brand dark:text-brand-yellow">{listo.maquina}</span></>}
        </p>
        <p className="text-center text-lg font-semibold text-muted-foreground">
          {listo.cierre
            ? "Salió de la planta. No hace falta escanear nada más."
            : "Ya podés arrancar."}
        </p>

        {/* La advertencia del backend, acá y en ningún otro lado.
            Ocupa media pantalla porque lo que dice es grave: o nadie escaneó en
            todo el pedido —y entonces el tablero vino mintiendo— o la orden
            nunca se produjo. Y éste es el único momento en que el que está
            parado al lado de la máquina puede averiguar cuál de las dos es. */}
        {listo.advertencia && (
          <div className="w-full max-w-md rounded-2xl border-2 border-amber-700 bg-amber-500/10 px-5 py-5 dark:border-amber-500">
            <p className="flex items-center gap-3 text-xl font-extrabold text-foreground">
              <AlertTriangle className="h-8 w-8 shrink-0 text-amber-700 dark:text-amber-400" strokeWidth={2.5} />
              Se cerró sin paso por planta
            </p>
            <p className="mt-3 text-lg font-bold text-foreground">{listo.advertencia}</p>
            <p className="mt-3 text-lg font-semibold text-foreground">
              Avisá en la oficina antes de irte: dentro de dos días esta orden no
              se va a distinguir de una que recorrió la planta entera.
            </p>
          </div>
        )}
      </Pantalla>
    )
  }

  const impresoras = etapa
    ? maquinas.filter((m) => (m.tipo ?? "").toLowerCase() === etapa)
    : []

  // Cómo está la orden para el cierre: ya cerrada, cancelada, o se puede cerrar.
  const cerrada = textoCierre(orden)
  const cancelada = orden.estado === "cancelada"
  // Para avisar en la confirmación: cerrar algo que nunca pasó por una máquina
  // es válido —la oficina cierra pedidos que no pasaron por planta— pero el que
  // escanea tiene que saber que eso es lo que está haciendo.
  const sinNingunaEtapa = !ETAPAS.some((e) => yaEscaneada(orden, e.valor))

  // Las tres tarjetas de etapa. Se arman una sola vez porque se usan en los dos
  // caminos del selector: el normal y el de reproceso de una orden cerrada.
  const tarjetasEtapa = etapasDisponibles.map((e) => {
    // Un solo QR para toda la orden, así que la pantalla tiene que decir qué
    // pasos ya pasaron: si no, el que llega al final no sabe si lo suyo ya lo
    // hizo otro.
    const hecha = yaEscaneada(orden, e.valor)
    return (
      <button
        key={e.valor}
        type="button"
        onClick={() => setEtapa(e.valor)}
        className="rounded-2xl border-2 border-border bg-card px-6 py-6 text-left transition active:scale-[0.98] hover:border-brand"
      >
        <span className="flex items-center justify-between gap-3">
          <span className="text-2xl font-extrabold text-foreground">{e.label}</span>
          {hecha && <Check className="h-7 w-7 shrink-0 text-emerald-600 dark:text-emerald-400" strokeWidth={3} />}
        </span>
        {hecha && (
          <span className="mt-1 block text-base font-semibold text-muted-foreground">
            Ya escaneada · {hecha}
          </span>
        )}
      </button>
    )
  })

  return (
    <div className="min-h-dvh bg-background px-5 py-7">
      <div className="mx-auto flex max-w-xl flex-col gap-7">

        {/* Qué trabajo es. Primero el producto: es lo que mira el operario. */}
        <header className="rounded-2xl border-2 border-border bg-card p-5">
          <p className="text-sm font-extrabold uppercase tracking-[0.2em] text-muted-foreground">
            Orden {orden.numero}
          </p>
          <p className="mt-1 text-3xl font-extrabold leading-tight text-foreground">
            {orden.producto_nombre ?? "Sin producto cargado"}
          </p>
          <p className="mt-1 text-xl font-bold text-foreground">{orden.cliente_nombre}</p>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-base font-semibold text-muted-foreground">
            {orden.cantidad != null && <span>{orden.cantidad.toLocaleString("es-AR")} etiquetas</span>}
            {orden.lote && <span className="font-mono">{orden.lote}</span>}
          </div>
        </header>

        {!etapa ? (
          <section className="flex flex-col gap-4">
            {cerrada ? (
              /* ── Orden YA CERRADA ────────────────────────────────────────
                 Antes las tres etapas se ofrecían igual que en una orden
                 abierta, con el panel verde abajo de todo: el operario podía
                 escanear extrusión sobre un pedido terminado sin enterarse de
                 que estaba terminado.

                 No se bloquea del todo —un reproceso REAL existe: un pedido
                 vuelve a la extrusora y el backend lo acepta, y con razón—,
                 pero deja de ofrecerse solo. Primero el hecho (está cerrada,
                 quién y cuándo) y después, si el que escanea igual quiere pasar
                 una etapa, lo pide él. El toque de más es la diferencia entre
                 «me equivoqué de QR» y «sé lo que estoy haciendo». */
              <>
                {/* Verde más oscuro en claro y más vivo en oscuro, por lo mismo
                    que el disco de «listo»: borde 5,01:1 (claro) / 7,78:1
                    (oscuro), ícono 4,57:1 / 8,75:1. El texto va en
                    `text-foreground`: 14,9:1 (claro) / 15,47:1 (oscuro). */}
                <div className="rounded-2xl border-2 border-emerald-700 bg-emerald-500/10 px-6 py-6 dark:border-emerald-500">
                  <span className="flex items-center justify-between gap-3">
                    <span className="text-2xl font-extrabold text-foreground">
                      Orden finalizada
                    </span>
                    <PackageCheck className="h-7 w-7 shrink-0 text-emerald-700 dark:text-emerald-400" strokeWidth={2.5} />
                  </span>
                  <span className="mt-1 block text-base font-semibold text-foreground">
                    {cerrada}
                  </span>
                </div>

                {reproceso ? (
                  <>
                    <Aviso>
                      Esta orden ya está cerrada. Lo que escanees ahora queda
                      registrado como reproceso y la orden sigue finalizada.
                    </Aviso>
                    <h2 className="text-2xl font-extrabold text-foreground">
                      ¿Qué vas a reprocesar?
                    </h2>
                    {tarjetasEtapa}
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setReproceso(true)}
                    className="rounded-2xl border-2 border-dashed border-border bg-card px-6 py-6 text-left transition active:scale-[0.98] hover:border-brand"
                  >
                    <span className="block text-2xl font-extrabold text-foreground">
                      Volver a pasar una etapa
                    </span>
                    <span className="mt-1 block text-base font-semibold text-muted-foreground">
                      Este pedido ya salió de la planta. Si hay que reprocesarlo,
                      tocá acá y elegí qué etapa.
                    </span>
                  </button>
                )}
              </>
            ) : (
              <>
                {/* En una orden CANCELADA no se ofrece ninguna etapa, y la
                    diferencia con una orden cerrada es de fondo: el backend
                    rechaza el escaneo de una cancelada con 409 SIN EXCEPCIÓN
                    (routers/ordenes.py), mientras que sobre una cerrada lo
                    acepta porque un reproceso real existe. Ofrecer acá las tres
                    tarjetas sería ofrecer un error garantizado: el operario
                    toca, viaja, y le vuelve un rechazo. El panel de abajo dice
                    qué pasa y qué hacer, y es lo único que se muestra. */}
                {!cancelada && (
                  <>
                    <h2 className="text-2xl font-extrabold text-foreground">¿Qué vas a hacer?</h2>
                    {tarjetasEtapa}

                    {/* El cierre, separado de las tres etapas, con rótulo propio
                        para que no se lea como «un paso más». */}
                    <div className="mt-2 flex items-center gap-3" aria-hidden>
                      <span className="h-px flex-1 bg-border" />
                      <span className="text-sm font-extrabold uppercase tracking-[0.2em] text-muted-foreground">
                        Cierre
                      </span>
                      <span className="h-px flex-1 bg-border" />
                    </div>
                  </>
                )}

                {cancelada ? (
                  /* El backend rechaza escanear una orden cancelada. Decirlo acá
                     es un viaje menos y un error menos en la cara del operario. */
                  <div className="rounded-2xl border-2 border-dashed border-border bg-card px-6 py-6">
                    <span className="block text-2xl font-extrabold text-foreground">
                      Orden cancelada
                    </span>
                    <span className="mt-1 block text-base font-semibold text-muted-foreground">
                      Una orden cancelada no se finaliza. Si es un error, hay que
                      reactivarla desde Órdenes de Trabajo.
                    </span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEtapa(CIERRE)}
                    className="rounded-2xl border-2 border-border bg-brand/5 px-6 py-6 text-left transition active:scale-[0.98] hover:border-brand hover:bg-brand/10"
                  >
                    {/* La señal de que este botón CIERRA el pedido es el rótulo
                        invertido, no el borde.
                        Antes era un `border-brand/60` punteado: #292d96 al 60%
                        da 1,33:1 contra el fondo de la tarjeta en tema oscuro
                        —que es el tema por defecto—, o sea que la única marca de
                        que este botón no era «un paso más» no se veía. Y el azul
                        de marca no tiene arreglo acá: macizo da 1,75:1 contra el
                        navy del fondo oscuro, así que ninguna variante del azul
                        llega al 3:1 de WCAG 1.4.11.
                        El rótulo macizo sí: `bg-foreground` da 17,35:1 (oscuro)
                        y 14,88:1 (claro) contra el fondo compuesto de la
                        tarjeta, y su texto `text-background` 17,57:1 / 16,35:1
                        contra el rótulo. Se ve en los dos temas y no depende
                        del color. */}
                    <span className="flex items-center justify-between gap-3">
                      <span className="rounded-lg bg-foreground px-3 py-1 text-sm font-extrabold uppercase tracking-[0.18em] text-background">
                        Cierra el pedido
                      </span>
                      <PackageCheck className="h-7 w-7 shrink-0 text-foreground" strokeWidth={2.5} />
                    </span>
                    <span className="mt-3 block text-2xl font-extrabold text-foreground">
                      Finalizar la orden
                    </span>
                    {/* `text-foreground` y no `text-muted-foreground`: sobre el
                        `bg-brand/5` compuesto (rgb(235,236,246)) el apagado daba
                        4,18:1 en tema claro, debajo del 4,5:1 de texto. Acá da
                        14,88:1 en claro y 17,35:1 en oscuro. */}
                    <span className="mt-1 block text-base font-semibold text-foreground">
                      El trabajo está terminado y sale de la planta
                    </span>
                  </button>
                )}
              </>
            )}
          </section>
        ) : etapa === CIERRE ? (
          /* ── Confirmación del cierre ──────────────────────────────────────
             Las otras tres etapas confirman con un botón y listo porque se
             pueden volver a escanear. Ésta termina el pedido, así que primero
             se dice en palabras QUÉ orden se va a cerrar y qué implica, y el
             botón que cierra está abajo de todo eso. */
          <section className="flex flex-col gap-4">
            <h2 className="text-2xl font-extrabold text-foreground">¿Cerramos esta orden?</h2>

            <div className="rounded-2xl border-2 border-border bg-brand/5 px-5 py-5">
              <p className="text-xl font-bold leading-snug text-foreground">
                Vas a finalizar la orden <span className="font-extrabold">{orden.numero}</span>
                {orden.producto_nombre && <> · {orden.producto_nombre}</>}
                {orden.cliente_nombre && <> · {orden.cliente_nombre}</>}
              </p>
              {/* Mismo motivo que en la tarjeta: el apagado sobre `bg-brand/5`
                  da 4,18:1 en claro. En `text-foreground`, 14,88:1 en claro y
                  17,35:1 en oscuro. */}
              <p className="mt-2 text-lg font-semibold text-foreground">
                Queda terminada y sale de la planta. No hay que escanear nada más.
              </p>
            </div>

            {sinNingunaEtapa && (
              <Aviso>
                Ojo: esta orden no tiene ninguna etapa escaneada — no pasó por
                extrusión, impresión ni troquelado. Si la cerrás igual, queda
                finalizada sin paso por planta.
              </Aviso>
            )}

            {/* El error va ACÁ, pegado al botón que lo provocó, y no arriba de
                todo: si el cierre falla mientras el operario mira «Sí,
                finalizar», el cartel al tope de la página le queda fuera del
                scroll — toca, no pasa nada visible, vuelve a tocar. */}
            {error && <CartelError texto={error} />}

            <BotonGrande
              texto={`Sí, finalizar ${orden.numero}`}
              cargando={guardando}
              onClick={() => registrar(null)}
              tono="cierre"
            />

            {/* Volver tiene que ser tan fácil de acertar como confirmar: el que
                llegó acá sin querer sale de un toque, no buscando un enlace. */}
            <button
              type="button"
              disabled={guardando}
              onClick={volver}
              className="rounded-2xl border-2 border-border bg-card px-6 py-6 text-center text-xl font-extrabold text-foreground transition active:scale-[0.98] hover:border-brand disabled:opacity-50"
            >
              No, volver
            </button>
          </section>
        ) : (
          <section className="flex flex-col gap-4">
            <h2 className="text-2xl font-extrabold text-foreground">
              {eligeMaquina(etapa) ? `${etiqueta(etapa)} · ¿en qué máquina?` : etiqueta(etapa)}
            </h2>

            {/* Se puede caer acá sin pasar por el selector (QR con `?etapa=`),
                así que el aviso de que la orden está cerrada tiene que estar
                también en esta pantalla y no sólo en la de los pasos. */}
            {cerrada && (
              <Aviso>
                Esta orden ya está cerrada — {cerrada}. Si escaneás igual, queda
                registrado como reproceso y la orden sigue finalizada.
              </Aviso>
            )}

            {/* El aviso va acá y no sólo en la lista de pasos: si dos operarios
                escanean lo mismo, el segundo tiene que enterarse. No se
                bloquea — a veces se vuelve a pasar y es legítimo —, se avisa. */}
            {yaEscaneada(orden, etapa) && (
              <Aviso>
                Esta etapa ya la escanearon: {yaEscaneada(orden, etapa)}. Si
                volvés a escanear, queda registrado tu paso también.
              </Aviso>
            )}

            {/* Igual que en el cierre: el error, al lado del botón que falló. */}
            {error && <CartelError texto={error} />}

            {eligeMaquina(etapa) ? (
              impresoras.length === 0 ? (
                <Aviso>
                  No hay máquinas de {etiqueta(etapa).toLowerCase()} cargadas. Hay
                  que darlas de alta en Administración antes de poder escanear.
                </Aviso>
              ) : (
                impresoras.map((m) => (
                  <BotonGrande
                    key={m.id}
                    texto={m.nombre}
                    cargando={guardando}
                    onClick={() => registrar(m)}
                  />
                ))
              )
            ) : (
              <>
                {/* Sin elección de máquina: un solo botón y afuera. */}
                <p className="text-lg font-semibold text-muted-foreground">
                  Esta etapa no elige máquina. Confirmá y arrancá.
                </p>
                <BotonGrande
                  texto={`Empezar ${etiqueta(etapa).toLowerCase()}`}
                  cargando={guardando}
                  onClick={() => registrar(null)}
                />
              </>
            )}

            {/* Siempre, incluso si la etapa vino en el QR (`?etapa=`). Antes
                estaba escondido tras `!etapaInicial` y por esa ruta no había
                forma de llegar al cierre ni de corregir un QR equivocado: la
                pantalla quedaba clavada en una sola etapa. */}
            <button
              type="button"
              disabled={guardando}
              onClick={volver}
              className="self-start text-lg font-bold text-muted-foreground underline disabled:opacity-50"
            >
              Cambiar de paso
            </button>
          </section>
        )}
      </div>
    </div>
  )
}

/**
 * «Ojo con esto»: lo que no bloquea pero hay que leer antes de tocar.
 *
 * El color vive en el borde y en el ícono —señales no textuales, 3:1 alcanza:
 * el borde da 4,7:1 en claro (`amber-700`) y 9,02:1 en oscuro (`amber-500`), y
 * el ícono 4,34:1 / 9,8:1 sobre el tinte—. Un solo `amber-500` para los dos
 * temas no servía: contra el fondo claro queda en 2,0:1.
 *
 * Las palabras van en `text-foreground`: 15,1:1 en claro y 15,4:1 en oscuro
 * sobre el `bg-amber-500/10` compuesto. El `text-amber-700` de antes quedaba en
 * 4,38:1 sobre ese mismo fondo, abajo del 4,5:1 que pide el texto.
 */
function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-3 rounded-xl border-2 border-amber-700 bg-amber-500/10 px-4 py-3 text-lg font-bold text-foreground dark:border-amber-500">
      <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-amber-700 dark:text-amber-400" strokeWidth={2.5} />
      <span>{children}</span>
    </p>
  )
}

/**
 * Lo mismo que `Aviso` pero en rojo: algo falló y no quedó registrado.
 *
 * Texto 16,51:1 (oscuro) / 14,06:1 (claro); borde 5,06:1 / 6:1; ícono 6,26:1 /
 * 5,16:1. Mismo motivo para el `red-700` en claro: el `red-500` parejo no llega.
 */
function CartelError({ texto }: { texto: string }) {
  return (
    <p className="flex items-start gap-3 rounded-xl border-2 border-red-700 bg-red-500/10 px-4 py-3 text-lg font-bold text-foreground dark:border-red-500">
      <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-red-700 dark:text-red-400" strokeWidth={2.5} />
      <span>{texto}</span>
    </p>
  )
}

function BotonGrande(
  { texto, cargando, onClick, tono = "paso" }:
  { texto: string; cargando: boolean; onClick: () => void; tono?: "paso" | "cierre" },
) {
  // El del cierre va relleno y no delineado: es el único botón de la pantalla
  // que hace algo que no se puede «desescanear», y no puede verse igual que el
  // «empezar tal etapa» de las otras tres.
  //
  // El borde es `border-foreground` y no `border-brand`: el relleno azul da
  // 1,75:1 contra el fondo del tema oscuro, así que por sí solo no dibuja el
  // botón. El borde en `foreground` da 17,57:1 (oscuro) y 16,35:1 (claro)
  // contra el fondo de la página, y el texto blanco 10,99:1 contra el relleno.
  const estilo = tono === "cierre"
    ? "border-foreground bg-brand text-white hover:bg-brand-strong"
    : "border-border bg-card text-foreground hover:border-brand"

  return (
    <button
      type="button"
      disabled={cargando}
      onClick={onClick}
      className={`flex items-center justify-between gap-4 rounded-2xl border-2 px-6 py-7 text-left text-2xl font-extrabold transition active:scale-[0.98] disabled:opacity-50 ${estilo}`}
    >
      {texto}
      {cargando && (
        <Loader2 className={`h-7 w-7 shrink-0 animate-spin ${tono === "cierre" ? "text-white" : "text-brand"}`} />
      )}
    </button>
  )
}

function Pantalla({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-background px-6">
      {children}
    </div>
  )
}
