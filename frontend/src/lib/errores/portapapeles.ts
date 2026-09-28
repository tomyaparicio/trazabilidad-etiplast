/**
 * Copiar al portapapeles con respaldo.
 *
 * POR QUÉ EL RESPALDO: `navigator.clipboard` no existe fuera de HTTPS y puede
 * estar bloqueado por permisos. Este botón se usa justo cuando algo ya falló,
 * así que no puede depender de la API moderna.
 */
export async function copiarAlPortapapeles(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto)
    return true
  } catch {
    try {
      const area = document.createElement("textarea")
      area.value = texto
      area.setAttribute("readonly", "")
      area.style.position = "fixed"
      area.style.top = "-1000px"
      area.style.opacity = "0"
      document.body.appendChild(area)
      area.select()
      const copiado = document.execCommand("copy")
      document.body.removeChild(area)
      return copiado
    } catch {
      return false
    }
  }
}
