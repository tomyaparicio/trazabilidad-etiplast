"use client"

export function PrintButtons() {
  return (
    <div className="pres-print-btn-wrapper no-print">
      <button onClick={() => window.print()} className="pres-print-btn">
        🖨️ Imprimir / Guardar PDF
      </button>
      <button onClick={() => window.close()} className="pres-close-btn">
        Cerrar
      </button>
    </div>
  )
}
