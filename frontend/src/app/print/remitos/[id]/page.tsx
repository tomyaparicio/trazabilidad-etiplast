/**
 * Página de impresión / PDF — Remito de Entrega (documento NO fiscal)
 */
import { apiFetchServer } from "@/lib/api/server"
import type { Remito } from "@/lib/api/types"
import { notFound } from "next/navigation"
import { PrintButtons } from "./print-buttons"
import "./print.css"

interface Props { params: Promise<{ id: string }> }

type RemitoPrint = Remito & {
  cliente_nombre?: string | null
  cliente_razon_social?: string | null
  cliente_cuit?: string | null
  creador_nombre?: string | null
}

const ESTADO_LABEL: Record<string, string> = {
  pendiente: "Pendiente", despachado: "Despachado",
  entregado: "Entregado", anulado: "Anulado",
}

export default async function PrintRemitoPage({ params }: Props) {
  const { id } = await params

  let remito: RemitoPrint
  try {
    remito = await apiFetchServer<RemitoPrint>(`/api/remitos/${id}`)
  } catch {
    return notFound()
  }

  const fechaStr = remito.fecha
    ? new Date(remito.fecha + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })
    : "—"

  const items = remito.items ?? []
  // Siempre mostrar al menos 8 filas en la tabla de ítems
  const filas = items.length >= 8 ? items : [
    ...items,
    ...Array.from({ length: 8 - items.length }, () => null),
  ]

  function Field({ label, value, full }: { label: string; value?: string | null; full?: boolean }) {
    return (
      <div className={`rem-field${full ? " rem-field--full" : ""}`}>
        <span className="rem-label">{label}</span>
        <span className={`rem-value${!value ? " rem-value--empty" : ""}`}>{value ?? ""}</span>
      </div>
    )
  }

  return (
    <html lang="es">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{`Remito ${remito.numero} — Etiplast`}</title>
      </head>
      <body className="rem-body">
        <div className="rem-page">

          {/* ══════════════════ HEADER ══════════════════ */}
          <div className="rem-header">
            {/* Logo + empresa */}
            <div className="rem-logo-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logoSOLO.png" alt="Etiplast" className="rem-logo" />
              <div className="rem-empresa">
                <span className="rem-empresa-nombre">ETIPLAST</span>
                <span className="rem-empresa-sub">Industria del Packaging</span>
              </div>
            </div>

            {/* Letra X — documento no fiscal */}
            <div className="rem-tipo-block">
              <div className="rem-tipo-letra">X</div>
              <span className="rem-tipo-leyenda">Documento no válido como factura</span>
            </div>

            {/* Número + fecha */}
            <div className="rem-meta-block">
              <span className="rem-doc-titulo">Remito</span>
              <span className="rem-doc-numero">{remito.numero}</span>
              <span className="rem-doc-fecha">Fecha: {fechaStr}</span>
            </div>
          </div>

          {/* ── Banda leyenda ── */}
          <div className="rem-no-fiscal">Documento no válido como factura</div>

          {/* ══════════════════ DATOS DEL CLIENTE ══════════════════ */}
          <div className="rem-cliente">
            <Field
              label="Señor/es"
              value={remito.cliente_razon_social ?? remito.cliente_nombre ?? `Cliente #${remito.cliente_id}`}
            />
            <Field label="CUIT" value={remito.cliente_cuit} />
            <Field label="Domicilio de entrega" value={remito.domicilio_entrega} full />
            <Field label="Transporte" value={remito.transporte} />
            <Field label="Estado" value={ESTADO_LABEL[remito.estado] ?? remito.estado} />
          </div>

          {/* ══════════════════ ÍTEMS ══════════════════ */}
          <div className="rem-items">
            <div className="rem-items-title">Detalle de la entrega</div>
            <table className="rem-table">
              <thead>
                <tr>
                  <th style={{ width: 90 }}>OT</th>
                  <th>Descripción</th>
                  <th className="rem-th-right" style={{ width: 110 }}>Cantidad</th>
                  <th style={{ width: 70 }}>Unidad</th>
                  <th style={{ width: 140 }}>Lote</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((item, i) => (
                  <tr key={item ? `i-${item.id}` : `v-${i}`}>
                    <td className="rem-td-mono">{item?.orden_numero ?? ""}</td>
                    <td>{item?.descripcion ?? ""}</td>
                    <td className="rem-td-right">
                      {item?.cantidad != null ? item.cantidad.toLocaleString("es-AR") : ""}
                    </td>
                    <td>{item?.unidad ?? ""}</td>
                    <td className="rem-td-mono">{item?.lote ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ══════════════════ OBSERVACIONES ══════════════════ */}
          <div className="rem-obs">
            <span className="rem-label">Observaciones</span>
            <span className="rem-value">{remito.observaciones ?? ""}</span>
          </div>

          {/* ══════════════════ RECIBÍ CONFORME ══════════════════ */}
          <div className="rem-recibo">
            <div className="rem-recibo-title">Recibí conforme</div>
            <div className="rem-firmas-row">
              <div className="rem-firma">
                <div className="rem-firma-line" />
                <span className="rem-firma-label">Firma</span>
              </div>
              <div className="rem-firma">
                <div className="rem-firma-line" />
                <span className="rem-firma-label">Aclaración</span>
              </div>
              <div className="rem-firma">
                <div className="rem-firma-line" />
                <span className="rem-firma-label">DNI / Fecha</span>
              </div>
            </div>
          </div>

          {/* ══════════════════ FOOTER ══════════════════ */}
          <div className="rem-footer">
            <span>Etiplast · Industria del Packaging — Documento no válido como factura</span>
            <span className="rem-footer-num">{remito.numero}</span>
          </div>

        </div>{/* /rem-page */}

        <PrintButtons />

      </body>
    </html>
  )
}
