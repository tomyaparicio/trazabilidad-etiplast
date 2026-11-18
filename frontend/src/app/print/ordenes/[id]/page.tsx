/**
 * Página de impresión / PDF — Orden de Trabajo  v2
 */
import { apiFetchServer } from "@/lib/api/server"
import { nombreDeProducto } from "@/lib/producto"
import type { Maquina, OrdenTrabajo } from "@/lib/api/types"
import { headers } from "next/headers"
import { notFound } from "next/navigation"
import QRCode from "qrcode"
import { PrintButtons } from "./print-buttons"
import "./print.css"

interface Props { params: Promise<{ id: string }> }

/**
 * Cuántos espacios de color trae la hoja de papel de esta impresora.
 *
 * LA EMPRESA NO TIENE UNA ORDEN DE TRABAJO: TIENE UNA POR MÁQUINA. Son casi
 * la misma hoja —mismas tres etapas, mismas tablas— pero no idénticas: la de
 * ReinaFlex trae OCHO espacios de color, numerados 1 a 8 en dos filas de
 * cuatro, y la ficha del sistema imprimía seis para todas. Un trabajo de siete
 * u ocho colores no entraba en el papel.
 *
 *  2. QUÉ ESTRUCTURA, que es más grave. La hoja de la AUTOADHESIVA es otra
 *     hoja, porque es otro proceso. Venus y ReinaFlex EXTRUDEN el film acá
 *     adentro, así que su paso 1 pide ancho, color, espesor y los kilos de
 *     cada bobina que sale de la extrusora. La autoadhesiva COMPRA el material
 *     en bobina —OPP blanco, papel— y no tiene nada que extrudar: su paso 1
 *     pregunta qué material es y de qué ancho vino, el 2 suma barniz y
 *     laminación, y el 3 pide el troquel en alto×largo y hacia dónde se
 *     bobina. Imprimirle a esa máquina la hoja de film le pone al operario una
 *     sección de extrusión entera que no aplica.
 *
 * LOS DOS DATOS SALEN DEL CATÁLOGO, no de un `if` con nombres de máquina
 * adentro: hardcodear `{"ReinaFlex": 8}` se rompe en silencio la primera vez
 * que alguien renombra una impresora o carga una nueva, y nadie se entera
 * hasta que la hoja sale impresa. `ordenes_trabajo.impresion_maquina` guarda
 * el nombre como texto suelto —no hay FK— así que se cruza por nombre
 * normalizado, que es lo mismo que ya hace el selector de máquina del alta.
 */
const COLORES_POR_DEFECTO = 6

type HojaTipo = "film" | "autoadhesiva"

interface Hoja {
  /** Cuántos renglones de color dejarle al operario. */
  colores: number
  /** Qué estructura tiene la ficha. `"film"` es la de siempre. */
  tipo: HojaTipo
}

/** La hoja de una máquina que el catálogo no conoce: la de siempre. */
const HOJA_POR_DEFECTO: Hoja = { colores: COLORES_POR_DEFECTO, tipo: "film" }

function normalizarNombre(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
}

/**
 * Le saca al nombre de la máquina el sustantivo genérico de adelante.
 *
 * «Impresora Autoadhesiva» se llama así en el catálogo, pero lo que la
 * identifica es AUTOADHESIVA: «Impresora» lo son todas. Sin esto, el recuadro
 * del filo izquierdo —que existe para que el operario vea de lejos si la orden
 * es para SU máquina— le imprimía una «I» que no distingue nada, con el nombre
 * cortado al medio abajo («IMPRESORA AUTOADHESI / VA») porque no entra.
 *
 * Se recorta el NOMBRE, no sólo la letra, para que la inicial siga sin poder
 * contradecir al nombre que está impreso justo debajo: dicen los dos lo mismo.
 *
 * Sólo si queda algo: una máquina que se llame nada más que «Impresora» sigue
 * saliendo entera, porque ahí el genérico es todo lo que hay.
 */
/* Ya normalizados —sin tildes ni puntuación—, que es con lo que se comparan:
   poner «máquina» acá no serviría de nada, nunca igualaría. */
const GENERICOS = ["impresora", "imp", "maquina"]

function sinPrefijoGenerico(nombre: string): string {
  const limpio = nombre.trim()
  const palabras = limpio.split(/\s+/)
  if (palabras.length < 2) return limpio
  if (!GENERICOS.includes(normalizarNombre(palabras[0]))) return limpio
  const resto = palabras.slice(1).join(" ")
  // SÓLO SI LO QUE QUEDA TIENE LETRAS. Una máquina que se llame «Máquina 3»
  // quedaría como «3», con un «3» gigante en el recuadro: la inicial existe
  // para distinguirse por FORMA y un número suelto no nombra nada. Ahí vale
  // más el nombre entero, aunque empiece por el genérico.
  return /[a-z]/i.test(normalizarNombre(resto)) ? resto : limpio
}

/**
 * Resuelve la máquina UNA sola vez y devuelve las dos cosas juntas.
 *
 * Juntas y no en dos funciones a propósito: son dos preguntas sobre la MISMA
 * máquina, y dos búsquedas separadas pueden dar con filas distintas si el
 * catálogo tiene la misma impresora cargada dos veces —que es exactamente el
 * caso: la autoadhesiva figura como «Impresora Autoadhesiva» y como «Taurus»—.
 * Una ficha con la estructura de una máquina y los colores de otra es el peor
 * de los dos mundos.
 */
function hojaDeLaMaquina(maquinas: Maquina[], nombreEnLaOrden?: string | null): Hoja {
  const buscado = normalizarNombre(nombreEnLaOrden?.trim() ?? "")
  if (!buscado) return HOJA_POR_DEFECTO
  const maquina = maquinas.find((m) => {
    const nombre = normalizarNombre(m.nombre ?? "")
    // `includes` en los dos sentidos: en producción la misma máquina figura
    // como «Venus» y como «IMP-001 (Venus)», y la orden guarda cualquiera de
    // las dos formas según cuándo se cargó.
    return nombre === buscado || nombre.includes(buscado) || buscado.includes(nombre)
  })
  if (!maquina) return HOJA_POR_DEFECTO
  return {
    colores: maquina.ficha_colores ?? COLORES_POR_DEFECTO,
    // NULL = film, que es la hoja que el sistema venía imprimiendo para todas:
    // ninguna máquina ya cargada cambia de hoja sola por culpa de esta función.
    tipo: maquina.ficha_tipo === "autoadhesiva" ? "autoadhesiva" : "film",
  }
}

/**
 * De dónde sale la URL que lleva el QR.
 *
 * Se arma con los headers del request y no con una variable de entorno: así
 * funciona igual en localhost, en los previews de Vercel y en producción, sin
 * que nadie tenga que acordarse de configurar nada. Un QR impreso con la URL
 * equivocada es papel tirado.
 */
async function origenDelSitio(): Promise<string> {
  const h = await headers()
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")
  return `${proto}://${host}`
}

/**
 * Un campo de la ficha: rótulo arriba, valor sobre una raya.
 *
 * Fuera del componente a propósito. Declarado adentro se redefine en cada
 * render y React lo trata como un componente nuevo cada vez (`react-hooks/
 * static-components`): no usa nada del closure, así que acá no cuesta nada.
 */
/**
 * Un recuadro de datos, con el rótulo ARRIBA del recuadro y afuera.
 *
 * Es el «ANCHO · COLOR · ESPESOR» del formulario de papel: las celdas se tocan
 * entre sí y forman una sola caja con líneas negras finas. El rótulo va afuera
 * y arriba, no adentro, porque adentro le robaría alto a lo que se escribe.
 *
 * `texto` es para las celdas que llevan una frase y no un número: se alinean a
 * la izquierda y con cuerpo más chico.
 */
function Caja({ campos, ancho }: {
  campos: { label: string; value?: string | null; flex?: number; texto?: boolean }[]
  /** Ancho en px. Sin esto la caja se estira a toda la columna, y una de tres
      celdas queda con sus valores nadando en blanco. Va `width` y no solo
      `maxWidth` porque dentro de un contenedor flex —así se centra la de
      IMPRESIÓN— la caja se achica al contenido y parte rótulos como
      «Cilindro Ø» al medio. `flexShrink: 0` la defiende de lo mismo. */
  ancho?: number
}) {
  return (
    <div
      className="ot-caja"
      style={ancho ? { width: ancho, maxWidth: "100%", flexShrink: 0 } : undefined}
    >
      {campos.map((c, i) => (
        <div
          key={i}
          className={`ot-caja-col${c.texto ? " ot-caja-col--texto" : ""}`}
          style={{ flex: c.flex ?? 1 }}
        >
          <span className="ot-caja-rot">{c.label}</span>
          <span className="ot-caja-val">{c.value || "\u00A0"}</span>
        </div>
      ))}
    </div>
  )
}

/** Rótulo + raya punteada: lo que se completa con lapicera en la máquina. */
function Mano({ label, ancho }: { label: string; ancho?: number }) {
  return (
    <span className="ot-mano">
      <span className="ot-mano-rotulo">{label}</span>
      <span className="ot-mano-raya" style={ancho ? { minWidth: ancho } : undefined} />
    </span>
  )
}

/** `FECHA EXT __ / __ / ____`, igual que el papel. */
function FechaVacia({ label }: { label: string }) {
  return (
    <span className="ot-mano">
      <span className="ot-mano-rotulo">{label}</span>
      <span className="ot-fecha-vacia">
        <i /><span>/</span><i /><span>/</span><i />
      </span>
    </span>
  )
}

/**
 * Rótulo + opciones para marcar con lapicera, como los circulitos del papel.
 *
 * Es el mismo gesto que «MÁQUINA ① ② ③ ④» de troquelado: el sistema no guarda
 * el dato, lo decide el que está parado en la máquina, y la hoja le deja dónde
 * marcarlo. `ancha` es para las que llevan palabra y no un número —SÍ / NO—,
 * que en un círculo de 22 px no entran.
 */
function Marcar({ label, opciones, ancha }: {
  label: string
  opciones: string[]
  ancha?: boolean
}) {
  return (
    <span className="ot-bob-maquina ot-bob-maquina--linea">
      <span className="ot-bob-maquina-rot">{label}</span>
      {opciones.map((o) => (
        <span key={o} className={`ot-bob-opcion${ancha ? " ot-bob-opcion--ancha" : ""}`}>
          {o}
        </span>
      ))}
    </span>
  )
}

/**
 * Recuadro de observaciones.
 *
 * El papel tiene una raya sola, pero acá el de la máquina escribe una o dos
 * frases a mano y necesita caja, no renglón. Si la orden ya trae algo cargado
 * (de la oficina o del agente de voz) se imprime adentro del mismo recuadro.
 */
function Observaciones({ value }: { value?: string | null }) {
  return (
    <div className="ot-obs">
      <span className="ot-obs-rotulo">Observaciones</span>
      <div className="ot-obs-area">{value ?? ""}</div>
    </div>
  )
}

/**
 * ¿La formulación dice algo que la hoja no muestre ya?
 *
 * `extrusion_formulacion` es la lámina del producto tal cual («Cristal 48»), y
 * de ESA misma lámina salen el color y el ancho que se imprimen justo arriba.
 * En producción 1.098 de las 1.138 láminas cargadas son exactamente eso: color
 * + ancho. Para ésas, imprimir «Formulación · Cristal 48» es repetirle al
 * operario dos campos que ya tiene a la vista.
 *
 * Las otras 40 sí aportan y por eso no se borró el campo: «Cristal R 31» (R de
 * retroverso), «Cristal Esfumado 24», «Cristal R 54 T47», y las formulaciones
 * de verdad tipo «2045/208». Ahí se imprime.
 *
 * Se le saca el color y el número que YA es el ancho; si no queda nada más que
 * separadores, la formulación no agregaba nada.
 */
function formulacionAporta(
  formulacion?: string | null,
  ancho?: number | string | null,
): boolean {
  const texto = (formulacion ?? "").trim()
  if (!texto) return false
  const resto = texto
    .replace(/crist(al)?|bl(co|anc[oa])/gi, "")
    .replace(/\d+(?:[.,]\d+)?/g, (n) =>
      ancho != null && Number(n.replace(",", ".")) === Number(ancho) ? "" : n)
    .replace(/[\s.,·\-/]+/g, "")
  return resto !== ""
}

export default async function PrintOrdenPage({ params }: Props) {
  const { id } = await params

  let orden: OrdenTrabajo
  try {
    orden = await apiFetchServer<OrdenTrabajo>(`/api/ordenes/${id}`)
  } catch {
    return notFound()
  }

  // El catálogo de máquinas, para saber cómo es la hoja de ESTA impresora.
  // Si no se puede leer, la ficha sale igual con el default: una orden que no
  // se imprime porque el catálogo no contestó es peor que una con seis
  // renglones de color en vez de ocho.
  let maquinas: Maquina[] = []
  try {
    maquinas = await apiFetchServer<Maquina[]>("/api/maquinas")
  } catch {
    maquinas = []
  }

  // UN solo QR para toda la orden. Tres (uno por sección) era ensuciar la hoja
  // para ahorrarle un toque al operario: la pantalla le pregunta qué paso va a
  // hacer y listo.
  //
  // Lleva el ID de la orden, NO el lote: el papel se imprime antes de que nadie
  // escanee y el lote recién nace con el primer escaneo. El ID existe desde que
  // la orden se crea.
  const base = await origenDelSitio()
  const qrOrden = await QRCode.toString(`${base}/escanear/${orden.id}`, {
    type: "svg",
    // ZONA TRANQUILA: 4 módulos de blanco alrededor del código, que es lo que
    // pide el estándar. No es decoración — es parte del símbolo: sin ella el
    // lector no encuentra dónde empieza la grilla y el escaneo falla aunque en
    // pantalla se vea impecable.
    //
    // Va acá y no como `padding` en el CSS a propósito: así el blanco escala
    // junto con el código. Con el padding en píxeles, cada vez que alguien
    // agranda el QR la zona tranquila se achica en módulos sin que se note.
    margin: 4,
    errorCorrectionLevel: "M",
    // Negro, como el resto de la hoja: el azul de marca sale gris en una
    // impresora en blanco y negro y al lector le cuesta más engancharlo.
    color: { dark: "#000000", light: "#ffffff" },
  })

  // Los colores los escribe A MANO el operario en la máquina: el alta no los
  // pide y acá salen en blanco. Lo que cambia por máquina es CUÁNTOS renglones
  // hay que dejarle.
  const hoja = hojaDeLaMaquina(maquinas, orden.impresion_maquina)
  const cantidadColores = hoja.colores
  const colores   = Array.from({ length: cantidadColores }, (_, i) => orden.impresion_colores?.[i] ?? "")
  // Siempre DOS FILAS, como el papel: seis salen 3+3 y ocho salen 4+4. Un
  // número fijo de columnas dejaría los ocho en 3+3+2, con la última fila
  // coja, que no es como está impresa ninguna de las hojas.
  const columnasColores = Math.ceil(cantidadColores / 2)
  const bobinas   = orden.bobinas ?? []
  // 16 casilleros en una grilla de 4×4, como el «KG/BOB.» del papel: ahí no
  // hay encabezados ni numeración, son rayas sueltas donde se anota el peso de
  // cada bobina. Si alguna vez se cargan desde el sistema, el número se imprime
  // y la raya queda abajo igual; hoy nadie los carga (cero filas en las dos
  // bases), así que en la práctica salen todos en blanco.
  const CASILLEROS_BOB = 16
  const casillerosBob = Array.from(
    { length: Math.max(CASILLEROS_BOB, bobinas.length) },
    (_, i) => bobinas[i]?.kg_bob ?? null,
  )

  // El plazo pactado con el cliente va EN EL PAPEL: la ficha es lo que el
  // operario tiene en la mano en la máquina, y hasta ahora ningún formulario
  // —ni el de papel ni éste— decía para cuándo era el pedido. Esa ausencia es
  // parte del problema que el sistema vino a resolver.
  const comprometidaStr = orden.fecha_comprometida
    ? new Date(orden.fecha_comprometida + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })
    : null
  const fechaStr  = orden.fecha
    ? new Date(orden.fecha + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })
    : "—"

  // La máquina de impresión, arriba y grande. El formulario de papel que esta
  // hoja reemplaza se llamaba directamente «VENUS»: el operario lo primero que
  // mira es si la orden es para SU máquina. En producción las impresoras se
  // llaman «IMP-001 (Venus)», así que el código va chico y el nombre grande —
  // que es lo que se lee de lejos, parado al lado de la máquina.
  const maquinaRaw    = orden.impresion_maquina?.trim() ?? ""
  const maquinaPartes = maquinaRaw.match(/^(.*?)\s*\(([^)]+)\)\s*$/)
  const maquinaCodigo = maquinaPartes ? maquinaPartes[1] : ""
  // Sin el «Impresora» de adelante: lo que identifica a la máquina es lo que
  // viene después, y es de donde sale la letra grande del filo izquierdo.
  const maquinaNombre = sinPrefijoGenerico(maquinaPartes ? maquinaPartes[2] : maquinaRaw)

  // La INICIAL de la máquina, gigante contra el filo izquierdo de la hoja.
  //
  // El operario tiene que saber de lejos si la orden es para SU máquina, sin
  // leer. Una letra se distingue por FORMA —V, R y A no se parecen en nada—,
  // así que sobrevive a una fotocopia en blanco y negro, y no hay que
  // aprenderse ningún código: la V es Venus.
  //
  // SALE DEL NOMBRE, NO DE UNA TABLA. Por eso una impresora que carguen mañana
  // ya tiene su letra sin que nadie toque este archivo, y la letra NUNCA puede
  // contradecir al nombre que está impreso tres centímetros a la derecha.
  const inicialMaquina = maquinaNombre.trim().charAt(0).toUpperCase()


  // Separador decimal argentino: «240,5», no «240.5». El resto de la app ya
  // formatea con es-AR (la cantidad sale «20.000»); la ficha era la única que
  // mezclaba los dos criterios en la misma hoja.
  //
  // LOS DECIMALES SÓLO CUANDO EXISTEN: antes todo salía con dos («48,00 mm»,
  // «24,00 mm») y eran ceros de adorno. No se redondea, que es distinto: el
  // CIERRE son diámetros de tapa y 1.039 de los 1.087 cargados tienen decimal
  // de verdad —9,75 no es 10—, así que ése sigue saliendo completo. El
  // cilindro, en cambio, no tiene decimales en ninguno de los 1.119.
  const fmt = (v: number | null | undefined, dec = 2) =>
    v != null
      ? Number(v).toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: dec })
      : ""


  const muestra = orden.producto_muestra?.trim().toUpperCase() ?? ""
  const muestraMal = muestra !== "" && muestra !== "OK"

  return (
    <html lang="es">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{`OT ${orden.numero} — Etiplast`}</title>
      </head>
      <body className="ot-body">
        <div className="ot-page">

          {/* ══════════════════ CABECERA ══════════════════
              Logo · ORDEN DE TRABAJO / MÁQUINA · número, fecha y QR.
              Mismo reparto que el papel, con el QR ocupando el lugar donde
              el formulario impreso tiene el __/__/__ escrito a mano. */}
          <div className={`ot-header${inicialMaquina ? " ot-header--inicial" : ""}`}>
            {/* Ocupa los 12 mm de azul pelado que la banda ya tenía de relleno
                a la izquierda, estirado a los 46 mm de alto. El logo no se
                mueve: arranca donde arrancaba. Va PRIMERO en el DOM para que
                sea la primera columna de la grilla.

                `aria-hidden` porque es la inicial de algo que el lector de
                pantalla ya va a leer entero dos elementos más adelante: suelta
                diría «A» y no significa nada. */}
            {/* COSTADO IZQUIERDO: el recuadro de la maquina pegado al filo y, a su
                derecha y arriba de todo, el membrete. */}
            <div className="ot-header-izq">
            {inicialMaquina && (
              <div className="ot-inicial">
                {/* `aria-hidden` en la LETRA sola: es la inicial de un nombre
                    que está escrito justo abajo, y suelta el lector de pantalla
                    diría «V» sin que signifique nada. El nombre sí se lee. */}
                <span className="ot-inicial-letra" aria-hidden="true">{inicialMaquina}</span>
                {maquinaNombre && (
                  /* Los nombres largos se achican en vez de partirse al medio:
                     el recuadro mide 22 mm y «AUTOADHESIVA» no entra a 11 px,
                     así que `overflow-wrap: anywhere` lo cortaba como
                     «AUTOADHESI / VA». Un corte al medio de la palabra en una
                     hoja impresa se lee como un defecto de impresión. */
                  <span className={`ot-inicial-maquina${maquinaNombre.length > 9 ? " ot-inicial-maquina--largo" : ""}`}>
                    {maquinaNombre}
                    {maquinaCodigo && <small>{maquinaCodigo}</small>}
                  </span>
                )}
              </div>
            )}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-etiplast.png" alt="Etiplast Argentina" className="ot-logo" />
            </div>

            {/* TODO LO QUE IDENTIFICA A LA ORDEN, EN UNA SOLA COLUMNA CENTRADA.
                La fecha con el logo colgando abajo era una torre de dos cosas
                que no tienen nada que ver entre si —una es un dato de la orden,
                la otra es la marca de la fabrica— apretadas en una columna de
                18 mm. Separadas, cada una va donde le corresponde: el logo
                arriba de todo, como el membrete de un papel con membrete, y la
                fecha abajo del numero, que es el otro dato de la orden. */}
            <div className="ot-titulo-block">
              <span className="ot-titulo">Orden de Trabajo</span>
              <span className="ot-numero">{orden.numero}</span>
              <span className="ot-fecha">{fechaStr}</span>
              {comprometidaStr && (
                <span className="ot-comprometida">
                  <small>Entregar</small>
                  {comprometidaStr}
                </span>
              )}
            </div>

            <div className="ot-header-der">
              {/* SVG generado en el servidor, no entra nada del usuario. */}
              <div className="ot-qr-img" dangerouslySetInnerHTML={{ __html: qrOrden }} />
            </div>
          </div>

          {/* ── CLIENTE N° y PRODUCTO, con raya hasta el margen ── */}
          <div className="ot-encabezado">
            <div className="ot-renglon">
              <span className="ot-renglon-rotulo">Cliente N°</span>
              <span className="ot-renglon-valor">
                {orden.cliente_numero != null ? `${orden.cliente_numero} · ` : ""}
                {orden.cliente_nombre ?? `#${orden.cliente_id}`}
              </span>
            </div>
            <div className="ot-renglon">
              <span className="ot-renglon-rotulo">Producto</span>
              <span className="ot-renglon-valor">
                {/* NOMBRE Y TAMAÑO. En producción hay 244 grupos de
                    productos que se llaman igual dentro del mismo cliente:
                    «2 pinos» tiene tres «Agua» —500 ml, 1,5 lt y 6 lt— y cada
                    una lleva otro cilindro y otra lámina. Una ficha que dice
                    sólo «Agua» manda al operario a adivinar cuál de las tres.
                    Misma función que el desplegable al cargar la orden, así
                    las dos pantallas nombran igual la misma cosa. */}
                {nombreDeProducto(orden.producto_nombre, {
                  volumen_cantidad: orden.producto_volumen_cantidad,
                  volumen_unidad: orden.producto_volumen_unidad,
                })}
                {/* La muestra del producto, SÓLO CUANDO ESTÁ MAL. NOOK
                    significa que está rechazada: imprimir 20.000 etiquetas así
                    es tirar el trabajo, y eso tiene que saltar a la vista.

                    «Muestra OK» NO SE IMPRIME MÁS. Era el estado normal —casi
                    todos los productos están aprobados—, así que aparecía en
                    casi todas las fichas, y un cartel que está siempre deja de
                    leerse: cuando de verdad dice otra cosa, el ojo ya aprendió
                    a saltearlo. El renglón de PRODUCTO es para el producto; la
                    tinta va donde está la excepción. */}
                {muestraMal && (
                  <b style={{ marginLeft: 12 }}>{`· MUESTRA ${muestra} ·`}</b>
                )}
              </span>
            </div>
          </div>

          <div className="ot-sep" />

          <div className="ot-cuerpo">

          {/* ╔══════════════════════════════════════════════════════════════╗
              ║  LA HOJA DE LA AUTOADHESIVA                                  ║
              ╚══════════════════════════════════════════════════════════════╝
              No es la de abajo con otra cantidad de colores: es OTRA HOJA,
              porque es otro proceso. Esta máquina no extrude nada — el
              material se compra en bobina (OPP blanco, papel), así que el
              paso 1 no pregunta ancho/color/espesor ni kilos por bobina:
              pregunta QUÉ material vino y de qué ancho.

              CASI TODO SALE EN BLANCO, y está bien: en el papel de la empresa
              también está en blanco. El tipo de material, el barniz, la
              laminación y el bobinado los decide y los escribe el que está
              parado en la máquina; el sistema no los guarda en ninguna
              columna, y una ficha que los inventara sería peor que una vacía.
              Lo que el sistema SÍ sabe —cliente, producto, número de orden,
              fecha, cantidad y el alto del troquel— sale impreso. */}
          {hoja.tipo === "autoadhesiva" ? (
            <>

            {/* ═══ ① MATERIAL ═══ */}
            <div className="ot-etapa">
              <div className="ot-etapa-head">
                <span className="ot-paso-num">1</span>
                <span className="ot-paso-title">Material</span>
              </div>
              {/* Las tres celdas del papel, en blanco: el material lo elige el
                  depósito según lo que haya en stock, y recién ahí se sabe de
                  qué ancho vino la bobina. */}
              <Caja
                ancho={520}
                campos={[
                  { label: "Tipo", value: "", flex: 1.4, texto: true },
                  { label: "Ancho bobina", value: "", flex: 1 },
                  { label: "Mts bobina", value: "", flex: 1 },
                ]}
              />
              <Observaciones value={orden.extrusion_observaciones} />
            </div>

            <div className="ot-sep" />

            {/* ═══ ② IMPRESIÓN ═══ */}
            <div className="ot-etapa">
              <div style={{ display: "flex", gap: 22, alignItems: "flex-start" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 9, width: 196 }}>
                  <div className="ot-etapa-head">
                    <span className="ot-paso-num">2</span>
                    <span className="ot-paso-title">Impresión</span>
                  </div>
                  {/* El papel de esta máquina NO trae operario ni fecha. Acá
                      van igual, y es la única cosa que esta ficha agrega al
                      papel a propósito: saber QUIÉN hizo cada paso es la
                      trazabilidad, que es para lo que existe el sistema. Son
                      dos rayas en blanco; no cuestan nada y cierran un hueco
                      que el papel tiene. */}
                  <Mano label="Operario" />
                  <FechaVacia label="Fecha imp" />
                </div>

                <div style={{ flex: 1 }}>
                  {/* Sin cilindro: la autoadhesiva no imprime con cilindro
                      grabado como la flexo de film. En el papel de esta
                      máquina ese recuadro no existe. */}
                  <span className="ot-mano-rotulo" style={{ display: "block", marginBottom: 5 }}>Colores</span>
                  <div
                    className="ot-colores"
                    style={{ gridTemplateColumns: `repeat(${columnasColores}, 1fr)` }}
                  >
                    {colores.map((c, i) => (
                      <span key={i} className="ot-color">
                        <span className="ot-color-num">{i + 1}.</span>
                        <span className="ot-color-raya">{c}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* BARNIZ · LAMINACIÓN · ANCHO, encajonados como en el papel: son
                  los acabados, se deciden juntos y se marcan de una pasada.
                  AFUERA de la columna de los colores y a todo el ancho de la
                  etapa, que es como está en la hoja — adentro de la columna
                  quedaban 458 px para 478 de contenido y ANCHO se caía a un
                  segundo renglón. */}
              <div className="ot-acabados">
                <Marcar label="Barniz" opciones={["Sí", "No"]} ancha />
                <Marcar label="Laminación" opciones={["Sí", "No"]} ancha />
                <Mano label="Ancho" ancho={96} />
              </div>

              <Observaciones value={orden.impresion_observaciones} />
            </div>

            <div className="ot-sep" />

            {/* ═══ ③ TROQUELADO ═══ */}
            <div className="ot-etapa">
              <div className="ot-etapa-head">
                <span className="ot-paso-num">3</span>
                <span className="ot-paso-title">Troquelado</span>
                <span className="ot-etapa-head-der">
                  <Mano label="Operario" ancho={92} />
                  <FechaVacia label="Fecha troq" />
                </span>
              </div>

              <div style={{ display: "flex", gap: 26, alignItems: "flex-start" }}>
                {/* EL TROQUEL VA EN ALTO × LARGO, no en alto/cierre/envase: acá
                    no hay envase que abrazar — es una etiqueta plana pegada.
                    El ALTO sale de la ficha del producto; el LARGO el sistema
                    no lo guarda en ninguna columna, así que queda en blanco
                    como en el papel. */}
                <Caja
                  ancho={320}
                  campos={[
                    { label: "Troquel · alto", value: orden.troquelado_alto != null ? `${fmt(orden.troquelado_alto)} cm` : "", flex: 1 },
                    { label: "Troquel · largo", value: "", flex: 1 },
                  ]}
                />
                {/* HACIA DÓNDE SE BOBINA. El papel lo resuelve con ocho
                    dibujitos de rollo —cuatro por sentido— porque la dirección
                    es algo que se ve, no que se lee. Acá van numeradas 1 a 4 en
                    cada sentido: reproducir los dibujos de memoria y errarle a
                    uno es peor que numerarlos, porque una tirada bobinada al
                    revés se tira entera. */}
                <div className="ot-bobinados">
                  <Marcar label="Bobinado int." opciones={["1", "2", "3", "4"]} />
                  <Marcar label="Bobinado ext." opciones={["1", "2", "3", "4"]} />
                </div>
              </div>

              <Observaciones value={orden.troquelado_observaciones} />
            </div>

            {/* ═══ PIE ═══
                El papel de esta máquina cierra con CANTIDAD · TOTAL FINAL y
                METROS · METROS FINAL. Los metros van EN BLANCO: la columna que
                el sistema tiene es `extrusion_metros`, que es la cuenta del
                film a extrudar —cantidad × alto— y acá no describe nada, porque
                en autoadhesiva entran varias etiquetas a lo ancho de la banda y
                los metros lineales no son ese número. Imprimir un número que no
                es el que el operario necesita es peor que dejarle la raya. */}
            <div className="ot-pie">
              <span className="ot-pie-dato">
                <span className="ot-pie-rotulo">Cantidad</span>
                <span className="ot-pie-valor">
                  {orden.cantidad != null ? fmt(orden.cantidad, 0) : " "}
                </span>
              </span>
              <span className="ot-pie-dato">
                <span className="ot-pie-rotulo">Total final</span>
                <span className="ot-pie-valor">&nbsp;</span>
              </span>
            </div>

            <div className="ot-pie ot-pie--mano">
              <span className="ot-pie-dato">
                <span className="ot-pie-rotulo">Metros</span>
                <span className="ot-pie-valor">&nbsp;</span>
              </span>
              <span className="ot-pie-dato">
                <span className="ot-pie-rotulo">Metros final</span>
                <span className="ot-pie-valor">&nbsp;</span>
              </span>
            </div>

            </>
          ) : (
            <>

            {/* ═══ ① EXTRUSIÓN ═══ */}
            <div className="ot-etapa">
              {/* Los metros pegados al título, igual que el
                  «EXTRUSION ______ MTS» del formulario de papel: es el número
                  que el operario se lleva a la máquina. */}
              <div className="ot-etapa-head">
                <span className="ot-paso-num">1</span>
                <span className="ot-paso-title">Extrusión</span>
                <span className="ot-paso-dato">
                  {orden.extrusion_metros != null ? fmt(orden.extrusion_metros, 0) : "\u00A0"}
                </span>
                <span className="ot-paso-unidad">mts</span>
              </div>

              <div style={{ display: "flex", gap: 22, alignItems: "flex-start" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 9, flex: 1 }}>
                  {/* En blanco a propósito: lo llena el que está en la máquina. */}
                  <Mano label="Operario" />
                  <FechaVacia label="Fecha ext" />
                  <Caja
                    /* Tres celdas cortas: sin tope se estiran a toda la columna
                       y los valores quedan nadando en blanco. 300 px le dan a
                       cada una lo que necesita y nada más. */
                    ancho={300}
                    campos={[
                      /* Sin la unidad: el rótulo ya dice ANCHO y en extrusión siempre
                         son milímetros. Repetirla gasta ancho de celda en algo
                         que el que está en la máquina ya sabe. */
                      { label: "Ancho", value: fmt(orden.extrusion_ancho) },
                      { label: "Color", value: orden.extrusion_color },
                      { label: "Espesor", value: orden.extrusion_espesor != null ? `${fmt(orden.extrusion_espesor, 0)} µ` : "60 µ" },
                      /* La formulación sólo cuando dice algo que el color y el
                         ancho no digan ya: ver `formulacionAporta`. */
                      ...(formulacionAporta(orden.extrusion_formulacion, orden.extrusion_ancho)
                        ? [{ label: "Formulación", value: orden.extrusion_formulacion, flex: 1.4 }]
                        : []),
                    ]}
                  />
                </div>

                {/* El «KG/BOB.» calcado del papel: el rótulo arriba y una
                    grilla de rayas sueltas, sin encabezados de columna ni
                    numeración de fila. El operario anota el peso de cada
                    bobina mientras extrude, parado al lado de la máquina — no
                    lee una tabla, llena un renglón. Las rayas van anchas por lo
                    mismo: una raya corta se llena con la letra apretada y
                    después no se lee. */}
                <div className="ot-bobinas" style={{ width: 320 }}>
                  <span className="ot-bobinas-rot">Kg / Bob.</span>
                  <div className="ot-bob-grilla">
                    {casillerosBob.map((kg, i) => (
                      <span key={i} className="ot-bob-casillero">
                        {kg ?? "\u00A0"}
                      </span>
                    ))}
                  </div>
                  {/* En qué extrusora se hizo. El papel lo resuelve con dos
                      círculos para marcar con lapicera, y el sistema no lo
                      guarda: `ETAPAS_CON_MAQUINA` es sólo impresión, porque en
                      extrusión las máquinas son intercambiables para el
                      tablero. Para el que está en planta sí importa, así que
                      la ficha lo pregunta como lo preguntaba el papel. */}
                  <div className="ot-bob-maquina">
                    <span className="ot-bob-maquina-rot">Máquina</span>
                    <span className="ot-bob-opcion">1</span>
                    <span className="ot-bob-opcion">2</span>
                  </div>
                </div>
              </div>

              <Observaciones value={orden.extrusion_observaciones} />
            </div>

            <div className="ot-sep" />

            {/* ═══ ② IMPRESIÓN ═══ */}
            {/* Calcado del papel: a la IZQUIERDA el título con el operario y
                la fecha debajo; a la DERECHA la caja del cilindro y, abajo,
                los colores. Antes la caja ocupaba un renglón propio a todo el
                ancho y empujaba todo hacia abajo — el papel la pone al lado
                del título justamente porque es angosta. */}
            <div className="ot-etapa">
              <div style={{ display: "flex", gap: 22, alignItems: "flex-start" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 9, width: 196 }}>
                  <div className="ot-etapa-head">
                    <span className="ot-paso-num">2</span>
                    <span className="ot-paso-title">Impresión</span>
                  </div>
                  {/* Operario y fecha NO se cargan en pantalla y nunca se
                      imprimen con dato: los escribe a mano el que está en la
                      máquina. El escaneo del QR sí los guarda —para el tablero
                      y la trazabilidad—, pero el papel conserva la raya. */}
                  <Mano label="Operario" />
                  <FechaVacia label="Fecha imp" />
                </div>

                <div style={{ flex: 1 }}>
                  {/* Dos que SÍ salen impresas: el CILINDRO, que viene en la
                      ficha del producto, y el RETROVERSO, que carga la oficina
                      — raro, pero cuando va, va escrito. */}
                  {/* Centrada en su columna. Pegada a la izquierda quedaba
                      colgando del título y dejaba todo el blanco de un solo
                      lado; centrada reparte el aire y queda sobre los colores. */}
                  <div style={{ display: "flex", justifyContent: "center" }}>
                    <Caja
                      /* Con tope: sin él los tres recuadros se estiran a toda la
                         columna y quedan enormes y vacíos, porque FRENTE y
                         RETROV. casi nunca traen dato cargado. En el papel son
                         angostos y parejos. */
                      ancho={340}
                      campos={[
                        // Sin «mm»: la unidad del cilindro no cambia nunca, y repetirla en
                        // cada ficha sólo le come ancho a una celda que ya era angosta.
                        { label: "Cilindro Ø", value: orden.impresion_cilindro != null ? fmt(orden.impresion_cilindro) : "", flex: 1 },
                        { label: "Frente", value: orden.impresion_frente, flex: 1.2, texto: true },
                        { label: "Retrov.", value: orden.impresion_retroverso, flex: 1, texto: true },
                      ]}
                    />
                  </div>
                  <span className="ot-mano-rotulo" style={{ display: "block", margin: "9px 0 5px" }}>Colores</span>
                  <div
                    className="ot-colores"
                    style={{ gridTemplateColumns: `repeat(${columnasColores}, 1fr)` }}
                  >
                    {colores.map((c, i) => (
                      <span key={i} className="ot-color">
                        <span className="ot-color-num">{i + 1}.</span>
                        <span className="ot-color-raya">{c}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <Observaciones value={orden.impresion_observaciones} />
            </div>

            <div className="ot-sep" />

            {/* ═══ ③ TROQUELADO ═══ */}
            <div className="ot-etapa">
              <div className="ot-etapa-head">
                <span className="ot-paso-num">3</span>
                <span className="ot-paso-title">Troquelado</span>
                {/* CUATRO TROQUELADORAS, con los circulitos para marcar a mano.
                    Esto estuvo sacado un tiempo con el argumento de que en
                    troquelado las maquinas son intercambiables y el sistema no
                    guarda cual se uso —`ETAPAS_CON_MAQUINA` es solo impresion—,
                    asi que era una raya que nadie completaba. El argumento era
                    del SISTEMA, no de la planta: el formulario de papel las
                    tiene, numeradas del 1 al 4, y el que esta parado en la
                    maquina las marca. La ficha copia al papel.

                    VA EN EL RENGLON DEL TITULO, no abajo como en extrusion,
                    porque asi esta en el papel: «TROQUELADO · MAQUINA 1 2 3 4»
                    a la izquierda y operario y fecha a la derecha. Y no empuja
                    nada: los circulitos miden 22 px y el numero de paso que ya
                    estaba en ese renglon mide 23, asi que el alto del renglon
                    —y el de la hoja— no se mueve. */}
                <span className="ot-bob-maquina ot-bob-maquina--linea">
                  <span className="ot-bob-maquina-rot">Máquina</span>
                  <span className="ot-bob-opcion">1</span>
                  <span className="ot-bob-opcion">2</span>
                  <span className="ot-bob-opcion">3</span>
                  <span className="ot-bob-opcion">4</span>
                </span>
                <span className="ot-etapa-head-der">
                  <Mano label="Operario" ancho={92} />
                  <FechaVacia label="Fecha troq" />
                </span>
              </div>

              {/* CIERRE es el diámetro de la tapa del envase; el ALTO va en
                  CENTÍMETROS, que es el mismo que usa la cuenta de metros.
                  Código y ubicación salen de la ficha del producto: el que va
                  al depósito necesita saber DÓNDE está el envase. */}
              <Caja
                campos={[
                  { label: "Alto", value: orden.troquelado_alto != null ? `${fmt(orden.troquelado_alto)} cm` : "", flex: 0.8 },
                  // El «int» va PEGADO AL NUMERO y no en el rotulo, igual que el «cm»
                  // de Alto, que es la celda de al lado. En el rotulo —«CIERRE
                  // (INT)»— parecia parte del nombre del campo; al lado del valor
                  // se lee por lo que es, la aclaracion de con que criterio esta
                  // tomada esa medida. CON PARENTESIS y no suelto como el «cm»:
                  // «cm» es la unidad y «(int)» es una aclaracion sobre la medida
                  // —interior—, que no es lo mismo, y los parentesis lo dicen.
                  { label: "Cierre", value: orden.troquelado_cierre != null ? `${fmt(orden.troquelado_cierre)} (int)` : "", flex: 0.8 },
                  { label: "Envase", value: orden.troquelado_envase, flex: 1.4 },
                  { label: "Código envase", value: orden.envase_codificado, flex: 1.2 },
                  { label: "Ubicación", value: orden.envase_ubicacion, flex: 1.2 },
                ]}
              />

              <Observaciones value={orden.troquelado_observaciones} />
            </div>

            {/* ═══ PIE ═══
                «CANTIDAD ___ · TOTAL FINAL ___» en el papel. El total en pesos
                no va: el precio no se decide en un papel de máquina. Los
                metros de film tampoco: ya salen arriba, al lado del título de
                EXTRUSIÓN, y repetirlos acá era el mismo número dos veces. */}
            {/* CANTIDAD y CANTIDAD FINAL enfrentadas en el mismo renglón: una
                es lo que se pidió y la otra lo que salió, y la única forma de
                que la diferencia salte a la vista es que se lean juntas. La de
                la derecha, más BULTOS abajo, las completa escritorio a mano
                cuando la orden se cierra — el sistema no tiene ninguna de las
                dos: no hay escaneo ni pantalla que las cargue, y el bulto
                además se arma recién al empaquetar. */}
            <div className="ot-pie">
              <span className="ot-pie-dato">
                <span className="ot-pie-rotulo">Cantidad</span>
                <span className="ot-pie-valor">
                  {orden.cantidad != null ? fmt(orden.cantidad, 0) : "\u00A0"}
                </span>
              </span>
              <span className="ot-pie-dato">
                <span className="ot-pie-rotulo">Cantidad final</span>
                <span className="ot-pie-valor">&nbsp;</span>
              </span>
            </div>

            <div className="ot-pie ot-pie--mano ot-pie--bultos">
              <span className="ot-pie-dato">
                <span className="ot-pie-rotulo">Bultos</span>
                <span className="ot-pie-valor">&nbsp;</span>
              </span>
            </div>

            </>
          )}

          </div>{/* /ot-cuerpo */}

        </div>{/* /ot-page */}

        <PrintButtons />

      </body>
    </html>
  )
}
