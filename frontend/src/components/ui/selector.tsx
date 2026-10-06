"use client"

/**
 * Desplegable propio, en reemplazo del `<select>` nativo.
 *
 * POR QUÉ NO USAR `<select>`: el navegador delega la lista de opciones al
 * SISTEMA OPERATIVO. En Mac sale oscura y queda bien; en Windows sale blanca
 * con fuente chica, ignora el tema del ERP y no hay CSS que la toque — es una
 * ventana del sistema, no HTML. La planta trabaja en Windows.
 *
 * Lo que NO se pierde al dejar el nativo (y por eso está todo esto acá):
 * teclado completo, lectores de pantalla y cerrar al tocar afuera. Un div con
 * un onClick se ve igual pero deja afuera a quien navega con Tab.
 */

import { useEffect, useId, useRef, useState } from "react"
import { ChevronDown, Check } from "lucide-react"

export interface OpcionSelector {
  /** Lo que se guarda. Cadena vacía = la opción “sin elegir”. */
  valor: string
  /** Lo que se lee en pantalla. */
  label: string
}

interface Props {
  opciones: OpcionSelector[]
  valor: string
  onCambio: (valor: string) => void
  /** Texto del disparador cuando no hay nada elegido. */
  placeholder?: string
  /** Nombre del campo para quien usa lector de pantalla. */
  etiqueta?: string
  disabled?: boolean
  className?: string
}

export function Selector({
  opciones,
  valor,
  onCambio,
  placeholder = "Elegir…",
  etiqueta,
  disabled = false,
  className = "",
}: Props) {
  const [abierto, setAbierto] = useState(false)
  /** Opción marcada con el teclado, que todavía no se eligió. */
  const [marcada, setMarcada] = useState(0)
  const caja = useRef<HTMLDivElement>(null)
  const disparador = useRef<HTMLButtonElement>(null)
  const lista = useRef<HTMLUListElement>(null)
  const idLista = useId()

  const elegida = opciones.find((o) => o.valor === valor)

  // Cerrar al tocar afuera. En `mousedown` y no en `click`: si se cierra recién
  // en el click, un botón que esté debajo del panel recibe el suyo igual.
  useEffect(() => {
    if (!abierto) return
    const alTocarAfuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener("mousedown", alTocarAfuera)
    return () => document.removeEventListener("mousedown", alTocarAfuera)
  }, [abierto])

  // Que la opción marcada quede siempre a la vista al moverse con las flechas.
  useEffect(() => {
    if (!abierto) return
    lista.current?.children[marcada]?.scrollIntoView({ block: "nearest" })
  }, [abierto, marcada])

  /** Abre con la marca puesta en lo que ya está elegido, no en la primera. */
  const abrir = () => {
    const i = opciones.findIndex((o) => o.valor === valor)
    setMarcada(i >= 0 ? i : 0)
    setAbierto(true)
  }

  const elegir = (i: number) => {
    const o = opciones[i]
    if (!o) return
    onCambio(o.valor)
    setAbierto(false)
    disparador.current?.focus()
  }

  const alTeclear = (e: React.KeyboardEvent) => {
    if (disabled) return
    if (!abierto) {
      // Abrir también con flechas: es lo que espera quien viene de un <select>.
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(e.key)) {
        e.preventDefault()
        abrir()
      }
      return
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault()
        setMarcada((i) => Math.min(i + 1, opciones.length - 1))
        break
      case "ArrowUp":
        e.preventDefault()
        setMarcada((i) => Math.max(i - 1, 0))
        break
      case "Home":
        e.preventDefault()
        setMarcada(0)
        break
      case "End":
        e.preventDefault()
        setMarcada(opciones.length - 1)
        break
      case "Enter":
      case " ":
        e.preventDefault()
        elegir(marcada)
        break
      case "Escape":
        e.preventDefault()
        setAbierto(false)
        disparador.current?.focus()
        break
      case "Tab":
        setAbierto(false)
        break
    }
  }

  return (
    <div ref={caja} className={`relative ${className}`}>
      <button
        ref={disparador}
        type="button"
        role="combobox"
        aria-expanded={abierto}
        aria-controls={abierto ? idLista : undefined}
        aria-haspopup="listbox"
        aria-label={etiqueta}
        disabled={disabled}
        onClick={() => (abierto ? setAbierto(false) : abrir())}
        onKeyDown={alTeclear}
        className="flex w-full items-center gap-2 border-b-[1.5px] border-input px-0.5 pb-2 text-left transition-colors hover:border-foreground/40 focus-visible:border-gold focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span
          className={`flex-1 truncate text-[19px] ${elegida ? "font-semibold text-foreground" : "font-medium text-muted-foreground"}`}
        >
          {elegida?.label ?? placeholder}
        </span>
        <ChevronDown
          className={`h-[18px] w-[18px] shrink-0 text-muted-foreground transition-transform ${abierto ? "rotate-180" : ""}`}
        />
      </button>

      {abierto && (
        <ul
          ref={lista}
          id={idLista}
          role="listbox"
          aria-label={etiqueta}
          tabIndex={-1}
          onKeyDown={alTeclear}
          className="absolute z-50 mt-1.5 max-h-[320px] w-full overflow-y-auto overscroll-contain rounded-xl border border-border bg-card py-1.5 shadow-2xl"
        >
          {opciones.map((o, i) => {
            const esElegida = o.valor === valor
            return (
              <li
                key={o.valor || `vacio-${i}`}
                role="option"
                aria-selected={esElegida}
                // `onMouseDown` y no `onClick`: el mousedown de cerrar-al-tocar-
                // afuera se dispara antes y el click nunca llegaría.
                onMouseDown={(e) => {
                  e.preventDefault()
                  elegir(i)
                }}
                onMouseEnter={() => setMarcada(i)}
                // Alto cómodo a propósito: esto lo usa gente grande en planta.
                className={`flex cursor-pointer items-center gap-2.5 px-4 py-3 text-[17px] ${
                  i === marcada ? "bg-gold/15" : ""
                } ${esElegida ? "font-bold text-foreground" : "font-medium text-secondary-foreground"}`}
              >
                <Check
                  className={`h-[18px] w-[18px] shrink-0 text-gold ${esElegida ? "" : "invisible"}`}
                  strokeWidth={2.6}
                />
                <span className="flex-1">{o.label}</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
