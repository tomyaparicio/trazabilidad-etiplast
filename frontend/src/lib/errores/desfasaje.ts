/**
 * Detección de "la app se actualizó mientras la tenías abierta" (desfasaje de
 * versión / version skew) y armado del detalle para reportar un error.
 *
 * POR QUÉ ESTE ARCHIVO EXISTE:
 * cuando se sube una versión nueva a Vercel, la pestaña que ya estaba abierta
 * sigue con el código viejo en memoria pero pide archivos (chunks) que el
 * deploy nuevo renombró. Eso explota con mensajes muy reconocibles. Ese caso NO
 * es un bug: se arregla recargando. Un bug de verdad, en cambio, tiene que
 * seguir mostrándose para que alguien lo arregle.
 *
 * TODO lo de acá es PURO (no toca window, sessionStorage ni el reloj): así se
 * puede probar de verdad. Los efectos viven en ./auto-recarga.ts.
 */

/** Error tal como lo entrega un boundary de Next (puede traer `digest`). */
export type ErrorConDigest = Error & { digest?: string }

/**
 * Firmas de los errores de "versión vieja", verificadas contra el runtime de
 * Turbopack que usa Next 16 en producción y contra los mensajes equivalentes de
 * webpack y de los navegadores (Chrome/Safari/Firefox) al fallar un import.
 *
 * REGLA DE ORO: cada patrón tiene que ser específico. "Failed to fetch" a secas,
 * por ejemplo, queda AFUERA a propósito: es una llamada a la API que se cayó,
 * no un desfasaje, y recargar no lo arregla.
 */
const FIRMAS_DE_VERSION_VIEJA: RegExp[] = [
  // Turbopack (Next 16): `Failed to load chunk <nombre> from module <id>`
  /failed to load chunk/i,
  // webpack: `Loading chunk 42 failed` / `Loading CSS chunk 7 failed`
  /loading (css )?chunk \S+ failed/i,
  // Turbopack: el chunk cargó pero el módulo que se pide ya no está en él
  /module factory is not available/i,
  // import() dinámico contra un archivo que el deploy nuevo borró
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i, // Safari
  // El servidor respondió otra cosa (HTML/404) donde se esperaba JavaScript
  /is not a valid javascript mime type/i,
  /expected a javascript(-or-wasm)? module script/i,
  // Payload RSC de una versión que ya no existe
  /failed to fetch rsc payload/i,
  // Vercel, cuando el deployment al que apuntaba la pestaña ya no está
  /deployment_not_found/i,
]

/** Saca el `message` de cualquier cosa que llegue (Error, string, evento, objeto suelto). */
export function mensajeDeError(error: unknown): string {
  if (typeof error === "string") return error
  if (error instanceof Error) return error.message
  if (error && typeof error === "object") {
    const posible = error as { message?: unknown; reason?: unknown }
    // `unhandledrejection` trae el error real adentro de `reason`.
    if (posible.reason !== undefined && posible.reason !== error) return mensajeDeError(posible.reason)
    if (typeof posible.message === "string") return posible.message
  }
  return ""
}

/** Saca el `name` (ChunkLoadError, TypeError, …) de cualquier cosa que llegue. */
export function nombreDeError(error: unknown): string {
  if (error instanceof Error) return error.name
  if (error && typeof error === "object") {
    const posible = error as { name?: unknown; reason?: unknown }
    if (posible.reason !== undefined && posible.reason !== error) return nombreDeError(posible.reason)
    if (typeof posible.name === "string") return posible.name
  }
  return ""
}

/**
 * FUNCIÓN PURA. ¿Este error es "se actualizó el sistema y tu pestaña quedó vieja"?
 *
 * Devuelve true SOLO para las firmas conocidas de desfasaje. Un error común
 * ("Cannot read properties of undefined (reading 'nombre')") devuelve false:
 * ese es un bug de verdad y tiene que verse, no taparse con una recarga.
 */
export function esErrorDeVersionVieja(error: unknown): boolean {
  if (nombreDeError(error) === "ChunkLoadError") return true
  const mensaje = mensajeDeError(error)
  if (!mensaje) return false
  return FIRMAS_DE_VERSION_VIEJA.some((firma) => firma.test(mensaje))
}

/**
 * FUNCIÓN PURA. ¿Corresponde recargar sola la página?
 *
 * Sí cuando (a) el error es de versión vieja y (b) esta pestaña todavía no se
 * recargó sola. `marcaPrevia` es lo guardado en sessionStorage (el instante de
 * esa recarga, como texto); cualquier cosa ahí ya cuenta como "ya recargué".
 */
export function debeRecargarPorVersionVieja(args: {
  error: unknown
  marcaPrevia: string | null | undefined
  ahora: number
}): boolean {
  const { error, marcaPrevia } = args
  if (!esErrorDeVersionVieja(error)) return false
  // UNA sola recarga automática por pestaña. Antes se permitía una cada 10
  // minutos: si la causa no se va (un HTML cacheado, una extensión), el usuario
  // recibía una recarga tras otra para siempre, y cada una le borraba lo que
  // estaba escribiendo. Si recargar no lo arregló la primera vez, no lo va a
  // arreglar la quinta: a partir de ahí se muestra el cartel con el botón.
  return marcaPrevia === null || marcaPrevia === undefined || marcaPrevia === ""
}

/** FUNCIÓN PURA. Primeras líneas del stack, sin espacios de más. */
export function primerasLineasDeStack(stack: string | undefined, cantidad = 4): string[] {
  if (!stack) return []
  return stack
    .split("\n")
    .map((linea) => linea.trim())
    .filter((linea) => linea.length > 0)
    .slice(0, cantidad)
}

/**
 * FUNCIÓN PURA. Arma el texto que copia el botón "Copiar detalle".
 * Se manda por WhatsApp/mail tal cual, así que va en texto plano y ordenado.
 */
export function armarDetalleDeError(datos: {
  nombre?: string
  mensaje?: string
  stack?: string
  digest?: string
  ruta?: string
  fechaHora?: string
  version?: string
  navegador?: string
}): string {
  const lineas: string[] = ["Etiplast ERP — detalle del error"]
  if (datos.fechaHora) lineas.push(`Cuándo: ${datos.fechaHora}`)
  if (datos.ruta) lineas.push(`Pantalla: ${datos.ruta}`)
  lineas.push(`Error: ${datos.nombre ? `${datos.nombre}: ` : ""}${datos.mensaje || "sin detalle"}`)
  if (datos.digest) lineas.push(`Referencia: ${datos.digest}`)
  if (datos.version) lineas.push(`Versión: ${datos.version}`)
  if (datos.navegador) lineas.push(`Navegador: ${datos.navegador}`)
  const stack = primerasLineasDeStack(datos.stack)
  if (stack.length > 0) lineas.push("Dónde:", ...stack.map((linea) => `  ${linea}`))
  return lineas.join("\n")
}
