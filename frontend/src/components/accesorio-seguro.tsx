"use client"

/**
 * Aísla un accesorio (paleta ⌘K, asistente, agente de voz) del resto del ERP.
 *
 * Los accesorios se montan en TODAS las pantallas, arriba del contenido. Sin
 * esto, una excepción de cualquiera de ellos —o de una librería suya— sube
 * hasta el boundary de raíz y el usuario ve «Error crítico» con la planta
 * parada, aunque la pantalla donde estaba trabajando estuviera perfecta.
 *
 * Si el accesorio falla: desaparece, queda el error en la consola para
 * diagnosticar, y el ERP sigue andando. No reintenta solo: reintentar
 * volvería a dibujar lo mismo y entraría en bucle.
 */

import { Component, type ReactNode } from "react"

interface Props {
  /** Nombre para el log. Ej: "paleta de comandos". */
  nombre: string
  children: ReactNode
}

export class AccesorioSeguro extends Component<Props, { rompio: boolean }> {
  state = { rompio: false }

  static getDerivedStateFromError() {
    return { rompio: true }
  }

  componentDidCatch(error: unknown, info: unknown) {
    // Queda en la consola del navegador: es lo único que permite saber DESPUÉS
    // cuál accesorio se rompió, porque en pantalla no se muestra nada.
    console.error(`[accesorio] «${this.props.nombre}» dejó de funcionar:`, error, info)
  }

  render() {
    if (this.state.rompio) return null
    return this.props.children
  }
}
