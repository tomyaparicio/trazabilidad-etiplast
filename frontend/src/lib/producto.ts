/**
 * Cómo se nombra un producto en pantalla y en papel.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO: en producción hay 244 grupos de productos que
 * se llaman IGUAL dentro del mismo cliente. «2 pinos» tiene tres «Agua», y lo
 * único que las separa es el volumen: 500 ml, 1,5 lt y 6 lt. Cada una lleva
 * otro cilindro y otra lámina, así que decir sólo «Agua» manda a adivinar
 * —tanto a quien carga la orden como al operario que tiene la ficha impresa en
 * la mano, parado en la máquina.
 *
 * Vivía adentro de `orden-form-dialog.tsx`, que es un componente de cliente.
 * La ficha impresa es un componente de SERVIDOR y no podía importarlo, así que
 * decía «Agua» a secas mientras el formulario decía «Agua · 500 ml». Dos
 * pantallas del mismo sistema nombrando distinto la misma cosa.
 */

/** Lo mínimo para nombrar un producto: lo cumplen `ClienteProducto` y la orden. */
export type ConVolumen = {
  volumen_cantidad?: number | string | null
  volumen_unidad?: string | null
}

/**
 * El volumen escrito como lo escribe una persona: «1,5 lt», y no «1.5000lt»,
 * que es como viene de la base.
 */
export function volumenLegible(p: ConVolumen): string {
  if (p.volumen_cantidad == null) return ""
  const cantidad = Number(p.volumen_cantidad)
  if (!Number.isFinite(cantidad)) return ""
  const numero = cantidad.toLocaleString("es-AR", { maximumFractionDigits: 3 })
  return p.volumen_unidad ? `${numero} ${p.volumen_unidad}` : numero
}

/**
 * ¿El nombre del producto ya dice su volumen?
 *
 * «Lavandina x 5 lt» con volumen 5 lt no tiene que terminar siendo
 * «Lavandina x 5 lt · 5 lt». Se comparan los NÚMEROS del nombre con el del
 * volumen, no el texto: así «Citrus x 1,5 lt» reconoce su 1,5 escrito con
 * coma, y «Agua 500» no se confunde con un volumen de 5.
 */
export function nombreYaDiceElVolumen(nombre: string, p: ConVolumen): boolean {
  if (p.volumen_cantidad == null) return false
  const cantidad = Number(p.volumen_cantidad)
  if (!Number.isFinite(cantidad)) return false
  const numeros = (nombre.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => Number(n.replace(",", ".")))
  return numeros.some((n) => n === cantidad)
}

/**
 * El nombre completo de un producto: nombre y tamaño.
 *
 * NO va la lámina («Blco 31», «Cristal 24»): es el material con el que se
 * fabrica la etiqueta, no algo que reconozca quien carga la orden, y venía
 * haciendo ruido («Lavandina x 5 lt · Blco 58»).
 *
 * EL TAMAÑO SÍ VA SIEMPRE que esté cargado —lo está en el 98% de los
 * productos—, y no sólo cuando dos se llaman igual: «Agua sport», que es
 * única, también merece decir de cuántos mililitros es.
 */
export function nombreDeProducto(
  nombre: string | null | undefined,
  p: ConVolumen,
  respaldo = "",
): string {
  const limpio = (nombre ?? "").trim()
  if (!limpio) return respaldo
  const volumen = volumenLegible(p)
  if (!volumen || nombreYaDiceElVolumen(limpio, p)) return limpio
  return `${limpio} · ${volumen}`
}
