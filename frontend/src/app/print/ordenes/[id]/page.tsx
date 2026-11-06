/**
 * Página de impresión / PDF — Orden de Trabajo  v2
 */
import { apiFetchServer } from "@/lib/api/server"
import type { OrdenTrabajo } from "@/lib/api/types"
import { headers } from "next/headers"
import { notFound } from "next/navigation"
import QRCode from "qrcode"
import { PrintButtons } from "./print-buttons"
import "./print.css"

interface Props { params: Promise<{ id: string }> }

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
 * Recuadro de observaciones.
 *
 * Una raya sola no alcanza: acá el de la máquina escribe una o dos frases a
 * mano, y necesita caja, no renglón. Si la orden ya trae algo cargado (de la
 * oficina o del agente de voz) se imprime adentro del mismo recuadro.
 */
function Observaciones({ value }: { value?: string | null }) {
  return (
    <div className="ot-obs ot-field--full">
      <span className="ot-label">Observaciones</span>
      <div className="ot-obs-area">{value ?? ""}</div>
    </div>
  )
}

function Field({ label, value, full }: { label: string; value?: string | null; full?: boolean }) {
  return (
    <div className={`ot-field${full ? " ot-field--full" : ""}`}>
      <span className="ot-label">{label}</span>
      <span className={`ot-value${!value ? " ot-value--empty" : ""}`}>{value ?? "\u00A0"}</span>
    </div>
  )
}

export default async function PrintOrdenPage({ params }: Props) {
  const { id } = await params

  let orden: OrdenTrabajo
  try {
    orden = await apiFetchServer<OrdenTrabajo>(`/api/ordenes/${id}`)
  } catch {
    return notFound()
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
    margin: 0,
    errorCorrectionLevel: "M",
    color: { dark: "#0f0c44", light: "#ffffff" },
  })

  const colores   = Array.from({ length: 6 }, (_, i) => orden.impresion_colores?.[i] ?? "")
  const bobinas   = orden.bobinas ?? []
  // Siempre mostrar al menos 6 filas en la tabla de bobinas
  const filasBob  = bobinas.length >= 6 ? bobinas : [
    ...bobinas,
    ...Array.from({ length: 6 - bobinas.length }, () => ({ metros: null, kg_bob: null })),
  ]

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
  const maquinaNombre = maquinaPartes ? maquinaPartes[2] : maquinaRaw

  // Separador decimal argentino: «240,00», no «240.00». El resto de la app
  // ya formatea con es-AR (la cantidad sale «20.000»); la ficha era la
  // única que mezclaba los dos criterios en la misma hoja.
  const fmt = (v: number | null | undefined, dec = 2) =>
    v != null
      ? Number(v).toLocaleString("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: dec })
      : ""


  return (
    <html lang="es">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{`OT ${orden.numero} — Etiplast`}</title>
      </head>
      <body className="ot-body">
        <div className="ot-page">

          {/* ══════════════════ HEADER ══════════════════ */}
          <div className="ot-header">
            {/* Logo + empresa */}
            <div className="ot-logo-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logoSOLO.png" alt="Etiplast" className="ot-logo" />
            </div>

            {/* Número central */}
            <div className="ot-titulo-block">
              <span className="ot-titulo">Orden de Trabajo</span>
              <span className="ot-numero">{orden.numero}</span>
              {maquinaNombre && (
                <span className="ot-maquina">
                  {maquinaCodigo && <small>{maquinaCodigo}</small>}
                  {maquinaNombre}
                </span>
              )}
            </div>

            {/* El QR de la orden, en la cabecera: es de toda la ficha, no de un
                paso. El operario lo escanea y la pantalla le pregunta qué va a
                hacer. Probé ponerlo abajo para que entrara más grande y rompía
                el bloque de Totales, así que va acá y gana tamaño comiéndose el
                relleno propio, sin tocar ni una letra del resto de la hoja. */}
            <div className="ot-qr">
              {/* SVG generado por nosotros en el servidor, no entra nada del usuario. */}
              <div className="ot-qr-img" dangerouslySetInnerHTML={{ __html: qrOrden }} />
              <span className="ot-qr-label">Escaneá antes de empezar</span>
              {orden.lote && <span className="ot-qr-lote">{orden.lote}</span>}
            </div>
          </div>

          {/* ── Banda cliente ── */}
          {/* El formulario de papel pide CLIENTE N° y PRODUCTO, no sólo la
              razón social. El número es el que usa la empresa (`numero_visible`),
              no el id interno de la base. */}
          <div className="ot-cliente-band">
            <span className="ot-cliente-label">Cliente</span>
            {orden.cliente_numero != null && (
              <span className="ot-cliente-numero">N° {orden.cliente_numero}</span>
            )}
            <span className="ot-cliente-nombre">
              {orden.cliente_nombre ?? `Cliente #${orden.cliente_id}`}
            </span>
            {orden.producto_nombre && (
              <>
                <span className="ot-cliente-label">Producto</span>
                <span className="ot-cliente-producto">{orden.producto_nombre}</span>
              </>
            )}
            {/* La muestra del producto. NOOK significa que está rechazada:
                imprimir 20.000 etiquetas así es tirar el trabajo, así que grita
                en rojo. OK va discreto, sólo para confirmar que se revisó. */}
            {/* La fecha, acá y no en la cabecera: la banda tiene lugar de sobra
                a la derecha y no suma alto a la hoja, que es el recurso escaso.
                El estado se fue del todo: es dato de oficina, no de planta. */}
            <span className="ot-cliente-fecha">
              <span className="ot-cliente-label">Fecha</span>
              <b>{fechaStr}</b>
            </span>
            {orden.producto_muestra && (
              <span
                className={`ot-muestra${
                  orden.producto_muestra.toUpperCase() === "OK" ? "" : " ot-muestra--mal"
                }`}
              >
                {orden.producto_muestra.toUpperCase() === "OK"
                  ? "Muestra OK"
                  : `Muestra ${orden.producto_muestra}`}
              </span>
            )}
          </div>

          {/* ══════════════════ CUERPO ══════════════════ */}
          <div className="ot-body-grid">

            {/* ─── EXTRUSIÓN ─── */}
            <div className="ot-section">
              {/* Los metros van en el encabezado, igual que el
                  «EXTRUSION ______ MTS» del formulario de papel: es el número
                  que el operario se lleva a la máquina. Sale de la cuenta
                  cantidad × alto + 400 de margen; si la orden es vieja y no lo
                  tiene calculado, no se muestra nada. */}
              <div className="ot-section-header">
                <span className="ot-section-title">Extrusión</span>
                {orden.extrusion_metros != null && (
                  <span className="ot-section-dato">
                    {fmt(orden.extrusion_metros, 0)} <small>m de film</small>
                  </span>
                )}
              </div>
              <div className="ot-section-body">
                <div className="ot-ext-grid">

                  {/* Tabla MTS / KG/BOB */}
                  <div className="ot-bobinas-wrap">
                    <div className="ot-bobinas-title">MTS · KG / BOB</div>
                    <table className="ot-table">
                      <thead>
                        <tr>
                          <th style={{ width: 28 }}>#</th>
                          <th>Metros</th>
                          <th>KG / Bob</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filasBob.map((b, i) => (
                          <tr key={i}>
                            <td className="ot-td-num">{i + 1}</td>
                            <td>{b.metros != null ? b.metros : ""}</td>
                            <td>{b.kg_bob != null ? b.kg_bob : ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Campos, en dos filas con sentido:
                      — arriba lo que el sistema ya sabe (sale de la lámina del
                        producto y del paso 2),
                      — abajo lo que se escribe a mano en la máquina.
                      Tres columnas y no dos: con dos quedaban huecos sueltos al
                      lado de «Cant. Bobinas» y de «Operador». */}
                  <div className="ot-ext-fields">
                    <Field label="Ancho" value={orden.extrusion_ancho != null ? `${fmt(orden.extrusion_ancho)} mm` : ""} />
                    <Field label="Color" value={orden.extrusion_color} />
                    <Field label="Micronaje (µ)" value={orden.extrusion_espesor != null ? `${fmt(orden.extrusion_espesor, 0)} µ` : "60 µ"} />
                    <Field label="Formulación" value={orden.extrusion_formulacion} full />

                    {/* A mano: tratamiento, cantidad de bobinas y quién la hizo. */}
                    <Field label="Tratamiento" value={null} />
                    <Field label="Cant. Bobinas" value={null} />
                    <Field label="Operador" value={null} />
                    <Observaciones />
                  </div>
                </div>
              </div>
            </div>

            {/* ─── IMPRESIÓN ─── */}
            <div className="ot-section">
              {/* Con qué impresora se hace. La elige el paso 0 y la confirma
                  el escaneo del QR; es la única etapa que distingue máquina, y
                  hasta ahora el papel no lo decía en ningún lado. */}
              <div className="ot-section-header">
                <span className="ot-section-title">Impresión</span>
                {orden.impresion_maquina && (
                  <span className="ot-section-dato">{orden.impresion_maquina}</span>
                )}
              </div>
              {/* Frente, observación, colores, operario y fecha NO se cargan en
                  pantalla y NUNCA se imprimen, aunque la base los tenga: los
                  escribe a mano el que está en la máquina. El escaneo del QR sí
                  los guarda —para el tablero y la trazabilidad—, pero el papel
                  conserva la raya en blanco.

                  Dos excepciones que SÍ salen impresas con su dato: el CILINDRO,
                  que ya viene en la ficha del producto, y el RETROVERSO, que lo
                  carga la oficina en el paso de Impresión — raro, pero cuando va,
                  va escrito. */}
              <div className="ot-imp-grid">

                <div className="ot-imp-col">
                  <div className="ot-imp-col-title">Frente</div>
                  <div className="ot-imp-text">{orden.impresion_frente ?? ""}</div>
                </div>

                <div className="ot-imp-col">
                  <div className="ot-imp-col-title">Retroversión</div>
                  <div className="ot-imp-text">{orden.impresion_retroverso ?? ""}</div>
                </div>

                <div className="ot-imp-col">
                  <div className="ot-imp-col-title">Observación</div>
                  <div className="ot-imp-text">{orden.impresion_observaciones ?? ""}</div>
                </div>

                <div className="ot-imp-col ot-imp-right">
                  <Field label="Cilindro" value={orden.impresion_cilindro != null ? `${fmt(orden.impresion_cilindro)} mm` : ""} />
                  <div className="ot-field">
                    <span className="ot-label">Colores</span>
                    <div className="ot-colores-grid">
                      {colores.map((c, i) => (
                        <div key={i} className="ot-color-item">
                          <span className="ot-color-num">{i + 1}.</span>
                          <span className="ot-color-val">{c}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

              </div>

              <div className="ot-imp-pie">
                {/* En blanco a propósito: operario y fecha se llenan con lapicera. */}
                <Field label="Operario" value={null} />
                <Field label="Fecha" value={null} />
              </div>
            </div>

            {/* ─── TROQUELADO ─── */}
            <div className="ot-section">
              <div className="ot-section-header">
                <span className="ot-section-title">Troquelado</span>
              </div>
              <div className="ot-section-body">
                {/* CIERRE, no «Ancho»: es el diámetro de la tapa del envase y
                    viene de la ficha del producto. El ancho se tipeaba a mano y
                    no lo completaba nadie — sigue en la base para las órdenes
                    viejas, pero ya no se imprime.

                    El alto va en CENTÍMETROS: es el mismo que usa la cuenta de
                    metros de extrusión, y los altos de la ficha de producto
                    (4 a 20) son centímetros de etiqueta. Antes decía «mm». */}
                <div className="ot-troq-grid">
                  <Field label="Cierre" value={orden.troquelado_cierre != null ? fmt(orden.troquelado_cierre) : ""} />
                  <Field label="Alto" value={orden.troquelado_alto != null ? `${fmt(orden.troquelado_alto)} cm` : ""} />
                  <Field label="Envase" value={orden.troquelado_envase} />
                  {/* Código y ubicación: el formulario de papel los pide y el
                      que va al depósito los necesita para encontrar el envase.
                      Salen de la ficha del producto. */}
                  <Field label="Código envase" value={orden.envase_codificado} />
                  <Field label="Ubicación" value={orden.envase_ubicacion} />
                </div>
                {/* Sin campo MÁQUINA: en troquelado las máquinas son
                    intercambiables, no se elige ninguna ni al cargar la orden
                    ni al escanear el QR. Una raya que nadie completa nunca es
                    un campo de menos, no de más.

                    Operario y fecha sí van, en blanco: los escribe a mano el
                    que troquela. */}
                <div className="ot-troq-pie">
                  {/* En blanco a propósito: operario y fecha se llenan con lapicera. */}
                  <Field label="Operario" value={null} />
                  <Field label="Fecha" value={null} />
                  <Observaciones value={orden.troquelado_observaciones} />
                </div>
              </div>
            </div>

            {/* ─── TOTALES ───
                Sin bloque de firmas: las «Autorizaciones» (Producción, Control
                de Calidad, Gerencia) eran un invento del rediseño, el
                formulario de papel de la empresa no las tiene y nadie las
                firmaba. */}
            <div className="ot-bottom-grid">

              {/* Totales */}
              <div className="ot-totales-section">
                <div className="ot-section-header">
                  <span className="ot-section-title">Totales</span>
                </div>
                <div className="ot-totales-inner">
                  <div className="ot-total-box">
                    <span className="ot-label">Cantidad</span>
                    <span className="ot-total-amount">
                      {orden.cantidad != null ? orden.cantidad.toLocaleString("es-AR") : ""}
                    </span>
                  </div>
                  <div className="ot-total-box">
                    <span className="ot-label">Total Final</span>
                    <span className="ot-total-amount">
                      {orden.total_final != null
                        ? `$\u00A0${Number(orden.total_final).toLocaleString("es-AR", { minimumFractionDigits: 2 })}`
                        : ""}
                    </span>
                  </div>
                </div>
                {/* El mismo recuadro que las otras dos secciones. Antes tenía
                    un `style={{minHeight:32}}` inline que le ganaba al CSS y
                    quedaba más chico que sus hermanas. */}
                <div className="ot-obs-box">
                  <Observaciones value={orden.observaciones} />
                </div>
              </div>

            </div>

          </div>{/* /ot-body-grid */}

        </div>{/* /ot-page */}

        <PrintButtons />

      </body>
    </html>
  )
}
