/**
 * Página de impresión / PDF — Orden de Trabajo  v2
 */
import { apiFetchServer } from "@/lib/api/server"
import type { OrdenTrabajo } from "@/lib/api/types"
import { notFound } from "next/navigation"
import { PrintButtons } from "./print-buttons"
import "./print.css"

interface Props { params: Promise<{ id: string }> }

export default async function PrintOrdenPage({ params }: Props) {
  const { id } = await params

  let orden: OrdenTrabajo
  try {
    orden = await apiFetchServer<OrdenTrabajo>(`/api/ordenes/${id}`)
  } catch {
    return notFound()
  }

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

  const fmt = (v: number | null | undefined, dec = 2) => v != null ? Number(v).toFixed(dec) : ""

  const estadoLabel: Record<string, string> = {
    borrador: "Borrador", pendiente: "Pendiente",
    en_proceso: "En Proceso", completada: "Completada", cancelada: "Cancelada",
  }

  /* ── Helpers de campo ── */
  function Field({ label, value, full }: { label: string; value?: string | null; full?: boolean }) {
    return (
      <div className={`ot-field${full ? " ot-field--full" : ""}`}>
        <span className="ot-label">{label}</span>
        <span className={`ot-value${!value ? " ot-value--empty" : ""}`}>{value ?? "\u00A0"}</span>
      </div>
    )
  }

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
              <div className="ot-empresa">
                <span className="ot-empresa-nombre">ETIPLAST</span>
                <span className="ot-empresa-sub">Industria del Packaging</span>
              </div>
            </div>

            {/* Número central */}
            <div className="ot-titulo-block">
              <span className="ot-titulo">Orden de Trabajo</span>
              <span className="ot-numero">{orden.numero}</span>
            </div>

            {/* Fecha + Estado */}
            <div className="ot-meta-block">
              <div className="ot-meta-item">
                <span className="ot-meta-label">Fecha</span>
                <span className="ot-meta-value">{fechaStr}</span>
              </div>
              <div className="ot-meta-item">
                <span className="ot-meta-label">Estado</span>
                <span className="ot-meta-estado">{estadoLabel[orden.estado] ?? orden.estado}</span>
              </div>
            </div>
          </div>

          {/* ── Banda cliente ── */}
          <div className="ot-cliente-band">
            <span className="ot-cliente-label">Cliente</span>
            <span className="ot-cliente-nombre">
              {orden.cliente_nombre ?? `Cliente #${orden.cliente_id}`}
            </span>
          </div>

          {/* ══════════════════ CUERPO ══════════════════ */}
          <div className="ot-body-grid">

            {/* ─── EXTRUSIÓN ─── */}
            <div className="ot-section">
              <div className="ot-section-header">
                <span className="ot-section-title">Extrusión</span>
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

                  {/* Campos */}
                  <div className="ot-ext-fields">
                    <Field label="Ancho" value={orden.extrusion_ancho != null ? `${fmt(orden.extrusion_ancho)} mm` : ""} />
                    <Field label="Color" value={orden.extrusion_color} />
                    <Field label="Tratamiento" value={orden.extrusion_trat} />
                    <Field label="Micronaje (µ)" value={orden.extrusion_espesor != null ? `${fmt(orden.extrusion_espesor, 0)} µ` : "60 µ"} />
                    <Field label="Cant. Bobinas" value={orden.extrusion_cant_bob?.toString()} />
                    <Field label="Formulación" value={orden.extrusion_formulacion} full />
                  </div>

                </div>
              </div>
            </div>

            {/* ─── IMPRESIÓN ─── */}
            <div className="ot-section">
              <div className="ot-section-header">
                <span className="ot-section-title">Impresión</span>
              </div>
              <div className="ot-imp-grid">

                <div className="ot-imp-col">
                  <div className="ot-imp-col-title">Frente</div>
                  <div className="ot-imp-text">{orden.impresion_frente ?? ""}</div>
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
            </div>

            {/* ─── TROQUELADO ─── */}
            <div className="ot-section">
              <div className="ot-section-header">
                <span className="ot-section-title">Troquelado</span>
              </div>
              <div className="ot-section-body">
                <div className="ot-troq-grid">
                  <Field label="Ancho" value={orden.troquelado_ancho != null ? `${fmt(orden.troquelado_ancho)} mm` : ""} />
                  <Field label="Alto" value={orden.troquelado_alto != null ? `${fmt(orden.troquelado_alto)} mm` : ""} />
                  <Field label="Envase" value={orden.troquelado_envase} />
                </div>
              </div>
            </div>

            {/* ─── TOTALES + FIRMAS ─── */}
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
                <div className="ot-obs-box">
                  <span className="ot-label">Observaciones</span>
                  <span className="ot-value" style={{ minHeight: 32 }}>{orden.observaciones ?? ""}</span>
                </div>
              </div>

              {/* Firmas */}
              <div className="ot-firmas-section">
                <span className="ot-firmas-title">Autorizaciones</span>
                <div className="ot-firmas-row">
                  {["Producción", "Control de Calidad", "Gerencia"].map((label) => (
                    <div key={label} className="ot-firma">
                      <div className="ot-firma-line" />
                      <span className="ot-firma-label">{label}</span>
                    </div>
                  ))}
                </div>
              </div>

            </div>

          </div>{/* /ot-body-grid */}

          {/* ══════════════════ FOOTER ══════════════════ */}
          <div className="ot-footer">
            <span className="ot-footer-text">Etiplast · Industria del Packaging</span>
            <span className="ot-footer-num">{orden.numero}</span>
          </div>

        </div>{/* /ot-page */}

        <PrintButtons />

      </body>
    </html>
  )
}
