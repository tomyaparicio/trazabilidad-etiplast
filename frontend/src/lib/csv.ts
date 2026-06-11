/**
 * Utilidad de exportación a CSV — sin dependencias externas.
 *
 * Genera un CSV a partir de un arreglo de objetos planos y dispara la descarga
 * en el navegador vía Blob + <a download>. Escapa comillas, comas y saltos de
 * línea según RFC 4180. Las columnas se derivan de las claves presentes en las
 * filas (unión de todas, preservando el orden de aparición).
 */

/** Escapa un valor para una celda CSV. */
function escaparCelda(valor: unknown): string {
  if (valor === null || valor === undefined) return ""
  const texto = String(valor)
  // Requiere comillas si contiene comilla, coma, salto de línea o retorno.
  if (/[",\n\r]/.test(texto)) {
    return `"${texto.replace(/"/g, '""')}"`
  }
  return texto
}

/**
 * Genera el contenido CSV (string) a partir de filas.
 * Exportado por si se necesita el texto sin disparar descarga (tests, preview).
 */
export function generarCSV(rows: Record<string, unknown>[]): string {
  if (!rows || rows.length === 0) return ""

  // Unión ordenada de claves (preserva orden de primera aparición).
  const columnas: string[] = []
  const vistas = new Set<string>()
  for (const fila of rows) {
    for (const clave of Object.keys(fila)) {
      if (!vistas.has(clave)) {
        vistas.add(clave)
        columnas.push(clave)
      }
    }
  }

  const encabezado = columnas.map(escaparCelda).join(",")
  const cuerpo = rows
    .map((fila) => columnas.map((col) => escaparCelda(fila[col])).join(","))
    .join("\r\n")

  return `${encabezado}\r\n${cuerpo}`
}

/**
 * Genera un CSV y dispara su descarga.
 *
 * @param filename Nombre del archivo (se agrega `.csv` si falta).
 * @param rows     Filas como objetos planos { columna: valor }.
 */
export function descargarCSV(filename: string, rows: Record<string, unknown>[]): void {
  if (typeof window === "undefined") return
  if (!rows || rows.length === 0) return

  const nombre = filename.toLowerCase().endsWith(".csv") ? filename : `${filename}.csv`
  // BOM para que Excel detecte UTF-8 correctamente (acentos).
  const contenido = `﻿${generarCSV(rows)}`
  const blob = new Blob([contenido], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)

  const a = document.createElement("a")
  a.href = url
  a.download = nombre
  a.style.display = "none"
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)

  // Liberar el object URL en el siguiente tick.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
