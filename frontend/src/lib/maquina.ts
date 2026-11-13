/**
 * Quién es la máquina, a partir del texto que quedó guardado en la orden.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO: `impresion_maquina` es TEXTO LIBRE que copia
 * `maquinas.nombre` del catálogo, y el catálogo de producción no las nombra como
 * las nombra la gente. Ahí están cargadas así:
 *
 *   IMP-001 (Venus)          IMP-002 (Reinaflex)       IMP-003 (Autoadhesiva)
 *
 * mientras que en la base local son «Venus», «ReinaFlex», «Taurus» e «Impresora
 * Autoadhesiva». Comparar el nombre entero contra «venus» da FALSO en producción
 * —«imp001venus» no es «venus»— así que la comparación va POR PALABRAS.
 *
 * Esto ya estaba resuelto adentro de `elegir-maquina.tsx`, pero ese archivo es
 * `"use client"` y la ficha impresa se arma en el servidor. Antes que copiar la
 * lista de nombres en dos lados —y que un día digan cosas distintas sobre la
 * misma máquina— la verdad vive acá y los dos la importan.
 */

/** Las impresoras que la empresa reconoce. */
export type ClaveMaquina = "venus" | "reinaflex" | "autoadhesiva"

/**
 * El texto partido en palabras, sin acentos y en minúscula.
 * `"IMP-001 (Venus)"` → `["imp", "001", "venus"]`
 */
export function enPalabras(texto: string): string[] {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

/**
 * ¿`clave` aparece como palabra (o palabras seguidas) dentro de `texto`?
 *
 * POR PALABRAS Y NO SUBCADENA: buscando subcadena, «venus» entraría dentro de
 * cualquier cosa que la contenga y «flex» marcaría a una «Flexo 2» que no tiene
 * nada que ver. Por palabra completa, «IMP-001 (Venus)» es Venus y «Venus 2» NO
 * —es otra máquina y tiene que aparecer sola hasta que alguien decida lo otro.
 */
export function contieneClave(texto: string, clave: string): boolean {
  const palabras = enPalabras(texto)
  const buscadas = enPalabras(clave)
  if (buscadas.length === 0) return false
  return palabras.some((_, i) => buscadas.every((b, j) => palabras[i + j] === b))
}

/**
 * Los nombres con los que cada máquina figura, hoy, en los dos catálogos.
 *
 * «Taurus» y «Impresora Autoadhesiva» son LA MISMA MÁQUINA: el dueño la llama
 * autoadhesiva y el catálogo la tiene cargada dos veces.
 */
export const CLAVES_MAQUINA: Record<ClaveMaquina, string[]> = {
  venus:        ["venus"],
  reinaflex:    ["reinaflex", "reina flex"],
  autoadhesiva: ["autoadhesiva", "impresora autoadhesiva", "imp-auto", "taurus"],
}

/**
 * Qué máquina es, o `null` si es una que no conocemos.
 *
 * `null` NO es un error: mañana cargan una impresora nueva en el catálogo y la
 * orden se imprime igual. Quien use esto tiene que bancarse el `null` sin marca
 * en vez de inventarle una que ya es de otra.
 */
export function claveDeMaquina(nombre?: string | null): ClaveMaquina | null {
  if (!nombre) return null
  const texto = nombre.trim()
  if (!texto) return null
  for (const clave of Object.keys(CLAVES_MAQUINA) as ClaveMaquina[]) {
    if (CLAVES_MAQUINA[clave].some((alias) => contieneClave(texto, alias))) return clave
  }
  return null
}
