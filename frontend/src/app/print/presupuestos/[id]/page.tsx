/**
 * Página de impresión / PDF — Presupuesto (documento comercial)
 */
import { apiFetchServer } from "@/lib/api/server"
import type { Presupuesto } from "@/lib/api/types"
import { notFound } from "next/navigation"
import { PrintButtons } from "./print-buttons"
import "./print.css"

interface Props { params: Promise<{ id: string }> }

type PresupuestoPrint = Presupuesto & {
  cliente_nombre?: string | null
  creador_nombre?: string | null
}

const ESTADO_LABEL: Record<string, string> = {
  borrador: "Borrador", enviado: "Enviado", aprobado: "Aprobado",
  rechazado: "Rechazado", vencido: "Vencido", convertido: "Convertido",
}

const fmtMoneda = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 })
const fmtNum = new Intl.NumberFormat("es-AR")

export default async function PrintPresupuestoPage({ params }: Props) {
  const { id } = await params

  let presupuesto: PresupuestoPrint
  try {
    presupuesto = await apiFetchServer<PresupuestoPrint>(`/api/presupuestos/${id}`)
  } catch {
    return notFound()
  }

  const fechaStr = presupuesto.fecha
    ? new Date(presupuesto.fecha + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })
    : "—"

  const vencimientoStr = (() => {
    if (!presupuesto.fecha || presupuesto.validez_dias == null) return null
    const d = new Date(presupuesto.fecha + "T00:00:00")
    d.setDate(d.getDate() + presupuesto.validez_dias)
    return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })
  })()

  const items = presupuesto.items ?? []
  // Siempre mostrar al menos 8 filas en la tabla de ítems
  const filas: (typeof items[number] | null)[] = items.length >= 8 ? items : [
    ...items,
    ...Array.from({ length: 8 - items.length }, () => null),
  ]

  const esProspecto = !presupuesto.cliente_id && !!presupuesto.prospecto_nombre

  function Field({ label, value, full }: { label: string; value?: string | null; full?: boolean }) {
    return (
      <div className={`pres-field${full ? " pres-field--full" : ""}`}>
        <span className="pres-label">{label}</span>
        <span className={`pres-value${!value ? " pres-value--empty" : ""}`}>{value ?? ""}</span>
      </div>
    )
  }

  return (
    <html lang="es">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{`Presupuesto ${presupuesto.numero} — Etiplast`}</title>
      </head>
      <body className="pres-body">
        <div className="pres-page">

          {/* ══════════════════ HEADER ══════════════════ */}
          <div className="pres-header">
            <div className="pres-logo-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logoSOLO.png" alt="Etiplast" className="pres-logo" />
              <div className="pres-empresa">
                <span className="pres-empresa-nombre">ETIPLAST</span>
                <span className="pres-empresa-sub">Industria del Packaging</span>
              </div>
            </div>

            <div className="pres-titulo-block">
              <span className="pres-titulo">Presupuesto</span>
              <span className="pres-numero">{presupuesto.numero}</span>
            </div>

            <div className="pres-meta-block">
              <div className="pres-meta-item">
                <span className="pres-meta-label">Fecha</span>
                <span className="pres-meta-value">{fechaStr}</span>
              </div>
              <div className="pres-meta-item">
                <span className="pres-meta-label">Estado</span>
                <span className="pres-meta-estado">{ESTADO_LABEL[presupuesto.estado] ?? presupuesto.estado}</span>
              </div>
            </div>
          </div>

          {/* ── Banda cliente ── */}
          <div className="pres-cliente-band">
            <span className="pres-cliente-label">{esProspecto ? "Prospecto" : "Cliente"}</span>
            <span className="pres-cliente-nombre">
              {presupuesto.cliente_nombre ?? presupuesto.prospecto_nombre ?? "—"}
            </span>
            {esProspecto && <span className="pres-cliente-tag">Cliente potencial</span>}
          </div>

          {/* ══════════════════ CUERPO ══════════════════ */}
          <div className="pres-body-grid">

            {/* ── Datos generales ── */}
            <div className="pres-datos-grid">
              <Field label="Moneda" value={presupuesto.moneda} />
              <Field label="Validez" value={presupuesto.validez_dias != null ? `${presupuesto.validez_dias} días` : null} />
              <Field label="Válido hasta" value={vencimientoStr} />
              <Field label="Emitido por" value={presupuesto.creador_nombre} />
            </div>

            {/* ── Ítems ── */}
            <div className="pres-items-section">
              <span className="pres-section-title">Detalle</span>
              <table className="pres-table">
                <thead>
                  <tr>
                    <th style={{ width: 28 }}>#</th>
                    <th>Descripción</th>
                    <th className="pres-th-num" style={{ width: 80 }}>Cantidad</th>
                    <th style={{ width: 60 }}>Unidad</th>
                    <th className="pres-th-num" style={{ width: 100 }}>P. unitario</th>
                    <th className="pres-th-num" style={{ width: 110 }}>Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((item, i) => (
                    <tr key={i}>
                      <td className="pres-td-num">{item ? i + 1 : " "}</td>
                      <td>{item?.descripcion ?? ""}</td>
                      <td className="pres-td-num">{item?.cantidad != null ? fmtNum.format(item.cantidad) : ""}</td>
                      <td>{item?.unidad ?? ""}</td>
                      <td className="pres-td-num">{item?.precio_unitario != null ? fmtMoneda.format(item.precio_unitario) : ""}</td>
                      <td className="pres-td-num">{item?.subtotal != null ? fmtMoneda.format(item.subtotal) : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── Totales ── */}
            <div className="pres-totales-wrap">
              <div className="pres-totales-box">
                <div className="pres-total-row">
                  <span>Subtotal</span>
                  <span>{presupuesto.subtotal != null ? fmtMoneda.format(presupuesto.subtotal) : "—"}</span>
                </div>
                <div className="pres-total-row">
                  <span>Descuento</span>
                  <span>{presupuesto.descuento_porcentaje != null ? `${fmtNum.format(presupuesto.descuento_porcentaje)} %` : "0 %"}</span>
                </div>
                <div className="pres-total-row">
                  <span>IVA</span>
                  <span>{presupuesto.iva_porcentaje != null ? `${fmtNum.format(presupuesto.iva_porcentaje)} %` : "0 %"}</span>
                </div>
                <div className="pres-total-row pres-total-row--final">
                  <span>Total {presupuesto.moneda ?? "ARS"}</span>
                  <span>{presupuesto.total != null ? fmtMoneda.format(presupuesto.total) : "—"}</span>
                </div>
              </div>
            </div>

            {/* ── Condiciones / Observaciones ── */}
            <div className="pres-condiciones-grid">
              <Field label="Condiciones de pago" value={presupuesto.condiciones_pago} />
              <Field label="Observaciones" value={presupuesto.observaciones} />
            </div>

            <p className="pres-nota">
              Presupuesto válido por {presupuesto.validez_dias ?? 30} días a partir de la fecha de emisión.
              Documento no válido como factura.
            </p>

          </div>{/* /pres-body-grid */}

          {/* ══════════════════ FOOTER ══════════════════ */}
          <div className="pres-footer">
            <span className="pres-footer-text">Etiplast · Industria del Packaging</span>
            <span className="pres-footer-num">{presupuesto.numero}</span>
          </div>

        </div>{/* /pres-page */}

        <PrintButtons />

      </body>
    </html>
  )
}
