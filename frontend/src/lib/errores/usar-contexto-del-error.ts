"use client"

import { useState, useSyncExternalStore } from "react"

// El valor nunca cambia después del primer dibujado, así que no hay a qué
// suscribirse: alcanza con devolver una función de baja que no hace nada.
const sinSuscripcion = () => () => {}
const enElNavegador = () => true
const enElServidor = () => false

/**
 * Ruta y hora del error, listas para mostrar en el cartel.
 *
 * POR QUÉ ASÍ Y NO CON useEffect + setState:
 * - `window.location` y la hora no existen en el servidor. Si se dibujaran
 *   directo, el HTML del servidor y el del navegador no coincidirían.
 * - `useSyncExternalStore` es la forma de decir "esto se dibuja recién en el
 *   navegador" sin romper la hidratación y sin cascadas de re-dibujado.
 * - La hora se congela en el primer dibujado: es el momento DEL ERROR, no el
 *   de cuando el usuario toca "Copiar detalle".
 */
export function useContextoDelError(): { ruta: string; fechaHora: string } {
  const listo = useSyncExternalStore(sinSuscripcion, enElNavegador, enElServidor)
  const [momento] = useState(() => new Date())

  if (!listo) return { ruta: "", fechaHora: "" }
  return {
    ruta: window.location.pathname + window.location.search,
    fechaHora: momento.toLocaleString("es-AR"),
  }
}
