"use client"

export function PrintButtons() {
  return (
    <div className="ot-print-btn-wrapper no-print">
      <button onClick={() => window.print()} className="ot-print-btn">
        🖨️ Imprimir / Guardar PDF
      </button>
      <button onClick={() => window.close()} className="ot-close-btn">
        Cerrar
      </button>
    </div>
  )
}
