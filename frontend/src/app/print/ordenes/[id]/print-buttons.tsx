"use client"

/**
 * La barra del visor: imprimir y cerrar.
 *
 * Va ARRIBA de la hoja en el DOM, no debajo, porque se apoya con
 * `position: sticky` y sticky se pega al borde del contenedor en el sentido en
 * que uno scrollea: puesta después de la hoja quedaría anclada abajo, que es
 * justo el problema que vino a resolver —la ficha mide 297 mm y había que
 * bajar hasta el fondo para encontrar «Imprimir»—.
 *
 * `no-print` la saca del papel.
 */
export function PrintButtons() {
  return (
    <div className="ot-barra no-print">
      {/* El fondo de la barra va de punta a punta, pero los botones se
          alinean con el BORDE DERECHO DE LA HOJA, no con el de la ventana:
          en un monitor ancho, pegados al borde quedan a treinta centímetros
          del documento que controlan y se leen como algo suelto. */}
      <div className="ot-barra-centro">
        <button onClick={() => window.print()} className="ot-print-btn">
          🖨️ Imprimir / Guardar PDF
        </button>
        <button onClick={() => window.close()} className="ot-close-btn">
          Cerrar
        </button>
      </div>
    </div>
  )
}
