"use client"

/**
 * Tablero de planta — dónde está cada pedido, en vivo.
 *
 * ── Qué es esta pantalla ─────────────────────────────────────────────────────
 *
 * Es la «Planilla de Registro de Extrusión» de la empresa, al día. El
 * relevamiento la describe como el tablero de producción DE FACTO: una fila por
 * trabajo y tres casilleros de avance (Ext. / Imp. / Troq.). Lo que le falta al
 * papel es exactamente lo que el escaneo del QR captura —«los tres casilleros
 * son marcas binarias, sin fecha ni operario ni máquina, y no hay columna de N°
 * de orden: se sabe EN QUÉ etapa está un trabajo, no DESDE CUÁNDO»—. Así que la
 * forma de la pantalla no es una decisión de diseño: es la planilla que ya
 * usan, con las cinco columnas completas.
 *
 * ── Qué había antes, y por qué se cambió ─────────────────────────────────────
 *
 * Los cinco pasos dibujados como cinco bloques a lo ancho, uno abajo del otro,
 * cada uno con sus tarjetas. Medido con UN solo trabajo en la planta: 2.122 px
 * de alto —1,9 pantallas de scroll—, ocho chips arriba de los cuales CINCO
 * decían cero, y el estado vacío del paso 1 más grande que todo el contenido
 * real. Y repetía lo que el dashboard ya muestra (la tira de 5 pasos y la lista
 * de pedidos), más grande. El usuario lo vio y dijo «es horrible».
 *
 * El problema de fondo era el EJE: cinco bloques por paso obligan a buscar una
 * orden en cinco lugares y no dejan ver su recorrido en ningún lado. Una fila
 * por orden contesta las dos preguntas que traen a alguien acá —«¿dónde está
 * este trabajo?» y «¿hay algo parado?»— de un vistazo y sin scroll.
 *
 * ── Los dos colores ─────────────────────────────────────────────────────────
 *
 *   dorado → el trabajo está ACÁ, ahora
 *   ámbar  → pasó y nadie escaneó la etapa siguiente: hay que ir a destrabarlo
 *
 * La misma convención que el dashboard, y el ámbar reservado a lo accionable.
 * El rojo es de otra cosa (el depósito bajo mínimo) y no aparece en el
 * recorrido. Está explicado en `_components/tabla-recorrido.tsx`.
 *
 * ── Los chips ───────────────────────────────────────────────────────────────
 *
 * De ocho a tres. Un cero no es noticia: «0 SIN ARRANCAR» ocupaba primera
 * pantalla para decir que no pasaba nada. Quedaron los tres que contestan algo
 * que la tabla no dice de un vistazo: cuánto hay sobre la planta, cuánto está
 * trabado, y si hay impresora libre para meter otro trabajo. «Finalizadas»,
 * «sin arrancar» y «canceladas» salieron porque son filas de la tabla o un
 * renglón al pie; «bajo mínimo» se fue al bloque del depósito, que es donde se
 * puede hacer algo con él.
 *
 * ── El refresco en vivo ─────────────────────────────────────────────────────
 *
 * Intacto. `useTablero()` sondea `GET /produccion/version` cada 3 s —una
 * consulta barata— y pide el tablero entero sólo cuando ese valor cambió; el
 * refresco ciego de 15 s queda como red de seguridad. Polling y no SSE a
 * propósito: el front pasa por el proxy de Next, que buferea la respuesta
 * entera y colgaría un stream, y Vercel cortaría la función igual sin
 * `maxDuration`.
 *
 * El pasado de cada fila (las fechas de las etapas ya cumplidas) NO está en el
 * tablero: está en la ficha de la orden. Lo trae `useRecorrido()`, que se
 * engancha al CONTENIDO del tablero y no a su reloj —vuelve a pedir las fichas
 * sólo cuando la planta se movió de verdad—, así que `GET /ordenes` no se pide
 * cada 3 s. El razonamiento completo está en `lib/use-recorrido.ts`.
 */
import { PageContainer } from "@/components/ui/page-container"
import { PageHeader } from "@/components/ui/page-header"
import type { PasoTablero } from "@/lib/api/types"
import { useTablero, refrescarTablero } from "@/lib/use-tablero"
import { useRecorrido, refrescarRecorrido } from "@/lib/use-recorrido"
import { enPlantaDe, filasDeRecorrido, trabadasDe } from "@/lib/recorrido-ordenes"
import { AlertCircle, CircleSlash, Factory, Loader2, RefreshCw } from "lucide-react"
import Link from "next/link"
import { useMemo } from "react"
import { Deposito } from "./_components/deposito"
import { TablaRecorrido } from "./_components/tabla-recorrido"

const nf = new Intl.NumberFormat("es-AR")

/** Identidad estable para el caso «el tablero todavía no contestó». */
const SIN_PASOS: PasoTablero[] = []

export default function PlanificacionPage() {
  const { datos, falló, mensaje, cargando } = useTablero()

  // `normalizar()` en `use-tablero` garantiza los cinco pasos y en orden.
  //
  // Memoizado y con un vacío de módulo: `datos?.pasos ?? []` devuelve un array
  // nuevo en cada render mientras el tablero no contestó, y eso dispara el
  // `useMemo` de las filas y el de la firma de `useRecorrido` a cada vuelta.
  const pasos = useMemo(() => datos?.pasos ?? SIN_PASOS, [datos])
  const { fichas } = useRecorrido(pasos)

  const filas = useMemo(() => filasDeRecorrido(pasos, fichas), [pasos, fichas])

  const enPlanta = enPlantaDe(pasos)
  const trabadas = trabadasDe(pasos)
  // Cada paso manda las 20 más recientes, así que la tabla puede estar
  // recortada. Si no se dice, la pantalla parece estar perdiendo trabajo —el
  // bug que este tablero ya pagó una vez.
  const total = pasos.reduce((n, p) => n + p.total, 0)
  const canceladas = datos?.resumen.canceladas ?? 0

  const notas: string[] = []
  if (filas.length < total) {
    notas.push(`Se ven ${nf.format(filas.length)} de ${nf.format(total)} órdenes: las más recientes de cada paso.`)
  }
  if (canceladas > 0) {
    notas.push(
      canceladas === 1
        ? "1 orden cancelada no se muestra."
        : `${nf.format(canceladas)} órdenes canceladas no se muestran.`,
    )
  }

  return (
    <PageContainer>
      <PageHeader
        icon={Factory}
        eyebrow="Producción"
        title="Tablero de planta"
        subtitle="Una fila por orden, una columna por paso: cuándo pasó cada etapa, quién la hizo y en qué máquina"
        actions={
          <button
            type="button"
            onClick={() => {
              refrescarTablero()
              refrescarRecorrido()
            }}
            // `/50` y no `/25` como otras cabeceras: contra el azul más claro
            // del degradado del hero (#292d96) el borde al 25 % queda en 2,3:1
            // y el límite del botón tiene que llegar a 3:1 para distinguirse.
            // Medido: al 50 % da 3,96:1.
            className="flex items-center gap-2 rounded-lg border border-white/50 bg-white/10 px-3.5 py-2 text-sm font-bold text-white transition hover:bg-white/20"
          >
            <RefreshCw aria-hidden="true" className={`size-4 ${cargando ? "animate-spin" : ""}`} />
            Actualizar
          </button>
        }
      />

      {datos && (
        <div className="flex flex-wrap gap-2.5">
          <Chip label={enPlanta === 1 ? "trabajo en la planta" : "trabajos en la planta"} valor={enPlanta} />
          {/* La etiqueta sirve para 1 y para muchas sin cambiarla, así que no
              hay plural que armar. */}
          <Chip label="esperando la etapa siguiente" valor={trabadas} alerta={trabadas > 0} />
          <Chip
            label={datos.resumen.libres === 1 ? "impresora libre" : "impresoras libres"}
            valor={datos.resumen.libres}
          />
        </div>
      )}

      {falló && mensaje && (
        <p className="flex items-center gap-2 rounded-xl border border-red-500/50 bg-red-500/10 px-4 py-3 text-base font-semibold text-red-700 dark:text-red-400">
          <AlertCircle aria-hidden="true" className="size-5 shrink-0" />
          {mensaje}
        </p>
      )}

      {/* Alarma aparte de las trabadas, y no se mezclan: una orden trabada está
          en un paso conocido y sólo falta escanearla en el siguiente. Estas no
          están en ninguna máquina y el tablero no sabe dónde quedaron. */}
      {datos && datos.sin_ubicar.length > 0 && (
        <section className="rounded-xl border-2 border-amber-500 bg-amber-500/10 px-4 py-3">
          {/* `amber-800` en claro y no `amber-700`: medido sobre el fondo real
              del cartel (ámbar al 10 % sobre el fondo de página), el 700 da
              4,34:1 y este texto son 16 px —no llega a «texto grande», así que
              el mínimo es 4,5—. El 800 da 6,2:1. */}
          <h2 className="flex items-center gap-2 text-base font-extrabold uppercase tracking-[0.1em] text-amber-800 dark:text-amber-300">
            <CircleSlash aria-hidden="true" className="size-5 shrink-0" />
            Ninguna máquina las tiene tomadas
          </h2>
          <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-base font-semibold text-foreground">
            Están en producción pero ahora mismo no hay ninguna máquina trabajándolas:
            {datos.sin_ubicar.map((o) => (
              <Link
                key={o.id}
                href={`/ordenes?buscar=${o.numero}`}
                className="font-extrabold text-foreground underline decoration-amber-500 decoration-2 underline-offset-2"
              >
                {o.numero}
              </Link>
            ))}
          </p>
        </section>
      )}

      {cargando && !datos ? (
        <p className="flex items-center gap-3 py-16 text-lg font-semibold text-muted-foreground">
          <Loader2 aria-hidden="true" className="size-6 animate-spin" />
          Leyendo la planta…
        </p>
      ) : datos ? (
        <>
          <TablaRecorrido filas={filas} nota={notas.join(" ") || null} />
          <Deposito stock={datos.stock} />
        </>
      ) : null}
    </PageContainer>
  )
}

/**
 * Un número grande con lo que significa al lado.
 *
 * `alerta` sólo para el que pide una acción —las órdenes trabadas—: si todos
 * los chips pudieran encenderse, encenderse no querría decir nada.
 */
function Chip({ label, valor, alerta }: { label: string; valor: number; alerta?: boolean }) {
  return (
    <p
      className={`flex items-baseline gap-2 rounded-xl border px-4 py-2 ${
        alerta ? "border-amber-500 bg-amber-500/10" : "border-border bg-card"
      }`}
    >
      <span
        className={`text-2xl font-extrabold tabular-nums leading-none ${
          alerta ? "text-amber-700 dark:text-amber-300" : "text-foreground"
        }`}
      >
        {nf.format(valor)}
      </span>
      {/* En el chip de alerta la etiqueta va en `foreground` y no en
          `muted-foreground`: sobre el fondo ámbar el gris apagado baja a
          4,2:1 y son 14 px. Además es el único chip que pide una acción, así
          que que se lea más fuerte que los otros dos es correcto. */}
      <span
        className={`text-sm font-bold uppercase tracking-wider ${
          alerta ? "text-foreground" : "text-muted-foreground"
        }`}
      >
        {label}
      </span>
    </p>
  )
}
