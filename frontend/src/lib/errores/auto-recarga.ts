/**
 * Efectos de navegador para la recuperación automática tras un deploy.
 * La decisión (¿es desfasaje?, ¿ya recargué?) vive en ./desfasaje.ts y es pura;
 * acá sólo está lo que toca sessionStorage, el reloj y location.
 */

import { debeRecargarPorVersionVieja } from "./desfasaje"

/** Marca de la última recarga automática. Va en sessionStorage: muere al cerrar la pestaña. */
export const CLAVE_MARCA_RECARGA = "eti:recarga-por-actualizacion"

/**
 * sessionStorage TIRA EXCEPCIÓN si el navegador tiene bloqueados los datos de
 * sitio (pasa en modo incógnito de algunos navegadores y con políticas de
 * empresa). Como esto corre dentro del manejo de un error, una excepción acá
 * dejaría al usuario sin ninguna pantalla. Por eso todo va en try/catch.
 */
function leerMarca(): string | null {
  try {
    return window.sessionStorage.getItem(CLAVE_MARCA_RECARGA)
  } catch {
    return null
  }
}

function guardarMarca(valor: number): void {
  try {
    window.sessionStorage.setItem(CLAVE_MARCA_RECARGA, String(valor))
  } catch {
    // Sin storage no podemos dejar la marca: preferimos no recargar nunca más
    // en esta pestaña antes que arriesgar un bucle. Lo resuelve el botón manual.
  }
}

/**
 * Ya programamos la recarga en esta carga de página.
 * POR QUÉ: React puede llamar dos veces al inicializador de estado en
 * desarrollo, y no queremos dos recargas encimadas ni una decisión distinta en
 * cada llamada. Con esta bandera la respuesta es siempre la misma.
 */
let recargaYaProgramada = false

/** Versión del build (la inyecta Next cuando hay `deploymentId` configurado). */
export function versionDelBuild(): string {
  try {
    return process.env.NEXT_DEPLOYMENT_ID ?? ""
  } catch {
    return ""
  }
}

/**
 * Si el error es de "versión vieja" y todavía no recargamos, deja la marca y
 * programa UNA recarga. Devuelve `true` cuando la recarga quedó programada,
 * para que la pantalla muestre "estamos recargando" en vez del cartel de error.
 *
 * Si ya recargamos hace poco y vuelve a pasar, devuelve `false`: ahí sí hay que
 * mostrar el cartel, porque recargar de nuevo sería un bucle.
 */
export function intentarRecargaPorActualizacion(error: unknown, demoraMs = 900): boolean {
  if (typeof window === "undefined") return false
  if (recargaYaProgramada) return true
  const ahora = Date.now()
  if (!debeRecargarPorVersionVieja({ error, marcaPrevia: leerMarca(), ahora })) return false

  guardarMarca(ahora)
  // Sin storage la marca no quedó: no recargamos, para no arriesgar el bucle.
  if (leerMarca() === null) return false

  recargaYaProgramada = true
  // La demora es para que el usuario alcance a leer "estamos recargando".
  window.setTimeout(() => {
    window.location.reload()
  }, demoraMs)
  return true
}
