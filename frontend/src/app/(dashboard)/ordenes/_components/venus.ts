/**
 * Reglas propias de la impresora VENUS.
 *
 * El alta de orden arranca eligiendo la máquina (paso 0) y a partir de ahí el
 * formulario cambia según la marca. Acá vive lo que Venus hace distinto en la
 * primera pantalla, aparte de la presentación.
 */

/**
 * Margen de arranque, puesta a punto y recortes, como PROPORCIÓN de la tirada.
 *
 * POR QUÉ UN PORCENTAJE Y NO METROS FIJOS: antes eran 400 m fijos más un
 * redondeo al próximo mil. En tiradas chicas eso casi duplicaba el pedido
 * —1.200 m de film terminaban siendo 2.000— y en tiradas grandes se quedaba
 * corto. El desperdicio crece con la tirada, así que el margen también.
 */
export const MARGEN_EXTRUSION = 0.05

/**
 * Lo que tarda el botón «Calcular» en mostrar el total, en milisegundos.
 *
 * La cuenta es instantánea: la espera es para la persona, no para la máquina.
 * Sin ella el número aparece en el mismo parpadeo del click y se pasa de largo;
 * con ella el operario ve que algo pasó y mira el resultado.
 */
export const DEMORA_CALCULO_MS = 650

/** El alto viene en centímetros y el film se mide en metros. */
export const CENTIMETROS_POR_METRO = 100

/**
 * El alto de la etiqueta pasado a METROS: 11,5 cm → 0,115 m.
 *
 * Es el número que se muestra en la explicación de la cuenta. Tiene que ser
 * éste y no los centímetros: si en pantalla dice «10.000 × 12 + 5% = 1.260»
 * la cuenta no cierra y el que la lee piensa que el sistema se equivocó.
 */
export function altoEnMetros(altoCm?: number | null): number {
  return (altoCm ?? 0) / CENTIMETROS_POR_METRO
}

/**
 * ¿La impresora elegida en el paso 0 es Venus?
 *
 * Llega el nombre del catálogo (`impresion_maquina`), no un id, así que se
 * compara sin acentos, sin espacios y en minúscula — igual que en el paso 0.
 * La comparación es EXACTA a propósito: si mañana cargan «Venus 2», es otra
 * máquina y no tiene por qué heredar este formulario.
 */
export function esImpresoraVenus(maquina?: string | null): boolean {
  if (!maquina) return false
  return (
    maquina
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "") === "venus"
  )
}

/**
 * La cuenta EXACTA de metros de film, sin subir al metro.
 *
 *   metros = cantidad × (alto_cm ÷ 100) × 1,05
 *
 * Cada etiqueta consume su ALTO de film. El alto se carga en CENTÍMETROS (11,5)
 * y el film se mide en METROS, así que va dividido por 100 — «le corremos la
 * coma dos lugares»: 11,5 cm → 0,115 m. Al total se le suma el 5% de margen.
 *
 *   10.000 etiquetas × 0,12 m + 5% de margen = 1.260 m
 *
 * POR QUÉ CENTÍMETROS: los altos de la ficha de producto van de 4 a 20. Una
 * etiqueta de 10 mm sería del grosor de una uña; de 10 cm es una etiqueta de
 * botella de verdad.
 *
 * Devuelve `null` cuando todavía no alcanza para calcular: sin cantidad o sin
 * alto NO se inventa un número, se avisa qué falta.
 */
export function metrosCrudos(
  cantidad?: number | null,
  altoCm?: number | null,
): number | null {
  if (cantidad == null || altoCm == null) return null
  if (!Number.isFinite(cantidad) || !Number.isFinite(altoCm)) return null
  if (cantidad <= 0 || altoCm <= 0) return null
  const film = cantidad * (altoCm / CENTIMETROS_POR_METRO)
  const metros = film * (1 + MARGEN_EXTRUSION)
  // Multiplicar decimales en binario deja basura (1260.0000000000002):
  // se redondea a 2 para que lo que se guarda sea el número que la gente ve.
  return Math.round(metros * 100) / 100
}

/**
 * Los metros que se extrudan de verdad: la cuenta subida al metro entero.
 *
 *   1.260 → 1.260 · 3.622,50 → 3.623 · 0,36 → 1
 *
 * SIEMPRE PARA ARRIBA, nunca para abajo: si faltan metros a mitad de la tirada
 * hay que frenar la máquina. Que sobre film se guarda para la próxima; que
 * falte, no se arregla.
 *
 * Tiene que dar EXACTAMENTE lo mismo que `calcular_metros_extrusion` del
 * backend (`backend/services/extrusion.py`): si los dos números no coinciden,
 * la pantalla le muestra al operario algo distinto de lo que se guarda.
 */
export function calcularMetrosExtrusion(
  cantidad?: number | null,
  altoCm?: number | null,
): number | null {
  const crudos = metrosCrudos(cantidad, altoCm)
  if (crudos === null) return null
  return Math.ceil(crudos)
}

/** Lo que se puede leer de la lámina de un producto. */
export interface LaminaLeida {
  /** "Blanco" o "Cristal", como los espera el select de Color. */
  color: string | null
  /** El ancho del film. `null` cuando la lámina no lo dice o es ambiguo. */
  ancho: number | null
}

/**
 * La lámina de la ficha de producto trae DOS datos pegados en un texto:
 * el color y el ancho del film. "Blco 54" = blanco, 54 de ancho.
 *
 * Se lee para no hacer tipear a mano algo que la empresa ya tiene cargado.
 *
 * LO QUE NO SE ADIVINA: de 865 productos con lámina, sólo 154 traen número
 * ("Blco" y "Cristal" a secas son los más comunes) y 10 traen DOS —
 * "Cristal Retrov. 31/T24", donde no sabemos cuál de los dos es el ancho. En
 * esos casos devuelve `ancho: null` y el campo queda vacío para que lo cargue
 * una persona. Poner un ancho equivocado es peor que no poner ninguno: el film
 * se extruda con esa medida.
 */
export function leerLamina(lamina?: string | null): LaminaLeida {
  const texto = (lamina ?? "").trim()
  if (!texto) return { color: null, ancho: null }

  // "Blco", "Blanco", "Blanca" → Blanco. "Cristal", "Cristal Retrov." → Cristal.
  const color = /crist/i.test(texto)
    ? "Cristal"
    : /bl(?:co|anc)/i.test(texto)
      ? "Blanco"
      : null

  const numeros = texto.match(/\d+(?:[.,]\d+)?/g) ?? []
  const ancho = numeros.length === 1 ? Number(numeros[0].replace(",", ".")) : null

  return { color, ancho: Number.isFinite(ancho as number) ? ancho : null }
}

/** Número en formato argentino: punto de miles y coma decimal. */
export function formatoAr(n: number, maxDecimales = 2): string {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: maxDecimales }).format(n)
}

/**
 * `2026-09-29` → `29/09/2026`.
 *
 * Se parte el string a mano en vez de usar `new Date`: `new Date("2026-09-29")`
 * se interpreta en UTC y en Argentina (-3) mostraría el día anterior.
 */
export function fechaLegible(iso?: string | null): string {
  if (!iso) return ""
  const [anio, mes, dia] = iso.split("-")
  return anio && mes && dia ? `${dia}/${mes}/${anio}` : iso
}
