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
 * Un recuadro de datos, con el rótulo ARRIBA del recuadro y afuera.
 *
 * Es el «ANCHO · COLOR · ESPESOR» del formulario de papel: las celdas se tocan
 * entre sí y forman una sola caja con líneas negras finas. El rótulo va afuera
 * y arriba, no adentro, porque adentro le robaría alto a lo que se escribe.
 *
 * `texto` es para las celdas que llevan una frase y no un número: se alinean a
 * la izquierda y con cuerpo más chico.
 */
function Caja({ campos }: {
  campos: { label: string; value?: string | null; flex?: number; texto?: boolean }[]
}) {
  return (
    <div className="ot-caja">
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
    // Negro, como el resto de la hoja: el azul de marca sale gris en una
    // impresora en blanco y negro y al lector le cuesta más engancharlo.
    color: { dark: "#000000", light: "#ffffff" },
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
          <div className="ot-header">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logoSOLO.png" alt="Etiplast" className="ot-logo" />

            <div className="ot-titulo-block">
              <span className="ot-titulo">Orden de Trabajo</span>
              {maquinaNombre && (
                <span className="ot-maquina">
                  {maquinaCodigo && <small>{maquinaCodigo}</small>}
                  {maquinaNombre}
                </span>
              )}
            </div>

            {/* Número, fecha y QR. UN solo QR para toda la orden: el operario
                lo escanea y la pantalla le pregunta qué paso va a hacer. */}
            <div className="ot-header-der">
              <div className="ot-header-num">
                <span className="ot-numero">{orden.numero}</span>
                <span className="ot-fecha">{fechaStr}</span>
                <span className="ot-qr-label">Escaneá antes de empezar</span>
                {orden.lote && <span className="ot-qr-lote">{orden.lote}</span>}
              </div>
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
                {orden.producto_nombre ?? ""}
                {/* La muestra del producto. NOOK significa que está rechazada:
                    imprimir 20.000 etiquetas así es tirar el trabajo. */}
                {muestra && (
                  <b style={{ marginLeft: 12 }}>
                    {muestraMal ? `· MUESTRA ${muestra} ·` : "· Muestra OK"}
                  </b>
                )}
              </span>
            </div>
          </div>

          <div className="ot-sep" />

          <div className="ot-cuerpo">

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
                    campos={[
                      { label: "Ancho", value: orden.extrusion_ancho != null ? `${fmt(orden.extrusion_ancho)} mm` : "" },
                      { label: "Color", value: orden.extrusion_color },
                      { label: "Espesor", value: orden.extrusion_espesor != null ? `${fmt(orden.extrusion_espesor, 0)} µ` : "60 µ" },
                      /* La formulación sólo cuando dice algo que el color y el
                         ancho no digan ya: ver `formulacionAporta`. */
                      ...(formulacionAporta(orden.extrusion_formulacion, orden.extrusion_ancho)
                        ? [{ label: "Formulación", value: orden.extrusion_formulacion, flex: 1.4 }]
                        : []),
                      { label: "Tratamiento", value: null },
                      { label: "Bobinas", value: null },
                    ]}
                  />
                </div>

                {/* La grilla de bobinas, como el «KG/BOB.» del papel. */}
                <div className="ot-bobinas" style={{ width: 168 }}>
                  <span className="ot-bobinas-rot">Kg / Bob.</span>
                  <table className="ot-bobinas-tabla">
                    <thead>
                      <tr><th /><th>Metros</th><th>Kg</th></tr>
                    </thead>
                    <tbody>
                      {filasBob.map((b, i) => (
                        <tr key={i}>
                          <td>{i + 1}</td>
                          <td>{b.metros ?? ""}</td>
                          <td>{b.kg_bob ?? ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <Observaciones value={orden.extrusion_observaciones} />
            </div>

            <div className="ot-sep" />

            {/* ═══ ② IMPRESIÓN ═══ */}
            <div className="ot-etapa">
              <div className="ot-etapa-head">
                <span className="ot-paso-num">2</span>
                <span className="ot-paso-title">Impresión</span>
              </div>

              {/* Operario, fecha y colores NO se cargan en pantalla y nunca se
                  imprimen con dato: los escribe a mano el que está en la
                  máquina. El escaneo del QR sí los guarda —para el tablero y la
                  trazabilidad—, pero el papel conserva la raya en blanco.

                  Dos excepciones que SÍ salen impresas: el CILINDRO, que ya
                  viene en la ficha del producto, y el RETROVERSO, que lo carga
                  la oficina — raro, pero cuando va, va escrito. */}
              <Caja
                campos={[
                  { label: "Cilindro Ø", value: orden.impresion_cilindro != null ? `${fmt(orden.impresion_cilindro)} mm` : "", flex: 0.8 },
                  { label: "Frente", value: orden.impresion_frente, flex: 2, texto: true },
                  { label: "Retrov.", value: orden.impresion_retroverso, flex: 1.4, texto: true },
                ]}
              />

              <div style={{ display: "flex", gap: 22, alignItems: "flex-start" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 9, width: 190 }}>
                  <Mano label="Operario" />
                  <FechaVacia label="Fecha imp" />
                </div>
                <div style={{ flex: 1 }}>
                  <span className="ot-mano-rotulo" style={{ display: "block", marginBottom: 5 }}>Colores</span>
                  <div className="ot-colores">
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
              {/* Sin campo MÁQUINA: en troquelado son intercambiables, no se
                  elige ninguna ni al cargar la orden ni al escanear el QR. Una
                  raya que nadie completa nunca es un campo de menos, no de más. */}
              <div className="ot-etapa-head">
                <span className="ot-paso-num">3</span>
                <span className="ot-paso-title">Troquelado</span>
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
                  { label: "Cierre", value: orden.troquelado_cierre != null ? fmt(orden.troquelado_cierre) : "", flex: 0.8 },
                  { label: "Envase", value: orden.troquelado_envase, flex: 1.4 },
                  { label: "Código envase", value: orden.envase_codificado, flex: 1.2 },
                  { label: "Ubicación", value: orden.envase_ubicacion, flex: 1.2 },
                ]}
              />

              <Observaciones value={orden.troquelado_observaciones} />
            </div>

            {/* ═══ PIE ═══
                «CANTIDAD ___ · TOTAL FINAL ___» en el papel. El total en pesos
                no va: el precio no se decide en un papel de máquina. En su
                lugar, LA CUENTA que hace la planta — cuántos metros de film
                salen de esa cantidad— con el detalle abajo para verificarla. */}
            <div className="ot-pie">
              <span className="ot-pie-dato">
                <span className="ot-pie-rotulo">Cantidad</span>
                <span className="ot-pie-valor">
                  {orden.cantidad != null ? fmt(orden.cantidad, 0) : "\u00A0"}
                </span>
              </span>
              <div>
                <span className="ot-pie-dato">
                  <span className="ot-pie-rotulo">Metros de film</span>
                  <span className="ot-pie-valor">
                    {orden.extrusion_metros != null ? `${fmt(orden.extrusion_metros, 0)} m` : "\u00A0"}
                  </span>
                </span>
                {orden.extrusion_metros != null && orden.cantidad != null && orden.troquelado_alto != null && (
                  <div className="ot-pie-cuenta">
                    {fmt(orden.cantidad, 0)} × {fmt(Number(orden.troquelado_alto) / 100, 2)} m + 400 de margen
                  </div>
                )}
              </div>
            </div>

          </div>{/* /ot-cuerpo */}

        </div>{/* /ot-page */}

        <PrintButtons />

      </body>
    </html>
  )
}
