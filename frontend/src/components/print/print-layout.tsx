/**
 * PrintLayout — contenedor reutilizable para páginas de impresión / PDF.
 *
 * Provee:
 *  - Membrete ETIPLAST (logo `public/logoSOLO.png` + nombre/subtítulo).
 *  - Slot central para título + número del documento.
 *  - Slot lateral opcional (fecha, estado, etc.).
 *  - Footer de marca.
 *  - Reglas `@media print` A4 que ocultan navegación / chrome (`.no-print`).
 *
 * Las páginas existentes en `app/print/*` son documentos `<html>` autónomos con
 * su propio CSS scopeado y ya incluyen membrete + footer; este componente queda
 * disponible para futuras vistas de impresión que se rendericen dentro del shell.
 */

import { type ReactNode } from "react"

interface PrintLayoutProps {
  /** Título del documento (ej: "Orden de Trabajo"). */
  titulo: string
  /** Número / identificador del documento (ej: "OT-0001"). */
  numero?: string
  /** Contenido lateral del membrete (fecha, estado…). */
  meta?: ReactNode
  /** Cuerpo del documento. */
  children: ReactNode
  /** Texto de footer (por defecto marca Etiplast). */
  footer?: ReactNode
}

export function PrintLayout({
  titulo,
  numero,
  meta,
  children,
  footer,
}: PrintLayoutProps) {
  return (
    <div className="print-layout">
      <PrintLayoutStyles />

      <div className="print-page">
        {/* ── Membrete ── */}
        <header className="print-header">
          <div className="print-logo-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logoSOLO.png" alt="Etiplast" className="print-logo" />
            <div className="print-empresa">
              <span className="print-empresa-nombre">ETIPLAST</span>
              <span className="print-empresa-sub">Industria del Packaging</span>
            </div>
          </div>

          <div className="print-titulo-block">
            <span className="print-titulo">{titulo}</span>
            {numero && <span className="print-numero">{numero}</span>}
          </div>

          {meta && <div className="print-meta-block">{meta}</div>}
        </header>

        {/* ── Cuerpo ── */}
        <main className="print-body">{children}</main>

        {/* ── Footer ── */}
        <footer className="print-footer">
          <span className="print-footer-text">
            {footer ?? "Etiplast · Industria del Packaging"}
          </span>
          {numero && <span className="print-footer-num">{numero}</span>}
        </footer>
      </div>
    </div>
  )
}

/** Estilos del layout de impresión (A4, oculta nav en print). */
function PrintLayoutStyles() {
  return (
    <style>{`
      .print-layout { color: #111; }
      .print-page {
        max-width: 210mm;
        margin: 0 auto;
        padding: 16mm 14mm;
        background: #fff;
        box-sizing: border-box;
      }
      .print-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        border-bottom: 2px solid var(--primary-500);
        padding-bottom: 10px;
        margin-bottom: 16px;
      }
      .print-logo-block { display: flex; align-items: center; gap: 10px; }
      .print-logo { height: 40px; width: auto; object-fit: contain; }
      .print-empresa { display: flex; flex-direction: column; line-height: 1.1; }
      .print-empresa-nombre { font-size: 18px; font-weight: 800; letter-spacing: 0.5px; color: var(--primary-500); }
      .print-empresa-sub { font-size: 10px; color: #666; }
      .print-titulo-block { text-align: center; display: flex; flex-direction: column; }
      .print-titulo { font-size: 13px; text-transform: uppercase; letter-spacing: 1px; color: #555; }
      .print-numero { font-size: 20px; font-weight: 700; color: #111; }
      .print-meta-block { text-align: right; font-size: 12px; color: #333; }
      .print-body { min-height: 40vh; }
      .print-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-top: 1px solid #ddd;
        margin-top: 24px;
        padding-top: 8px;
        font-size: 10px;
        color: #888;
      }
      .print-footer-num { font-weight: 600; color: #555; }

      @page { size: A4; margin: 0; }

      @media print {
        nav, aside, header[data-app-header], .no-print,
        [data-sidebar], [data-app-nav] { display: none !important; }
        body { background: #fff !important; }
        .print-page { box-shadow: none; padding: 12mm; }
      }
    `}</style>
  )
}
