"use client"

export function PrintButtons() {
  return (
    <div className="rem-print-btn-wrapper no-print">
      <button onClick={() => window.print()} className="rem-print-btn">
        🖨️ Imprimir / Guardar PDF
      </button>
      <button onClick={() => window.close()} className="rem-close-btn">
        Cerrar
      </button>
    </div>
  )
}
