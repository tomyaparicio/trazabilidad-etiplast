"use client"

/**
 * Buscador de cliente por nombre, con la lista debajo del campo.
 *
 * POR QUÉ NO UN DESPLEGABLE: la cartera tiene cientos de clientes y en esta
 * pantalla se carga una cobranza por vez, a mano, mirando un cheque. Buscar
 * tipeando tres letras es más rápido que recorrer una lista larga.
 */

import { useEffect, useRef, useState, type Ref } from "react"
import { Search, X } from "lucide-react"
import { api } from "@/lib/api"
import type { Cliente } from "@/types/database"
import { Input } from "@/components/ui/input"

export function ClienteBuscador({
  id,
  value,
  nombre,
  onSelect,
  placeholder = "Buscar cliente…",
  inputRef,
  invalido = false,
  descritoPor,
}: {
  id?: string
  value: number | null
  nombre?: string | null
  onSelect: (c: Cliente | null) => void
  placeholder?: string
  /** Para que el formulario pueda LLEVAR EL FOCO acá cuando este campo es el
   *  que está mal. El ref va al `<input>`, no a la caja. */
  inputRef?: Ref<HTMLInputElement>
  /** El formulario ya validó y este campo es el que falta. */
  invalido?: boolean
  /** `id` del mensaje de error que explica qué falta. */
  descritoPor?: string
}) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<Cliente[]>([])
  const [open, setOpen] = useState(false)
  const caja = useRef<HTMLDivElement>(null)

  // El nombre mostrado NO se copia a estado local: sale de `nombre`, que lo
  // mantiene quien usa el componente (es a quien le avisamos por `onSelect`).
  // Duplicarlo en un useState obligaba a sincronizarlo con un efecto, y dos
  // fuentes de verdad para el mismo dato se desfasan tarde o temprano.
  const elegido = nombre ?? ""

  useEffect(() => {
    if (!open) return
    const t = setTimeout(async () => {
      try {
        const r = await api.clientes.list({ search: query, per_page: 8 })
        setResults(r.data ?? [])
      } catch {
        setResults([]) // sin backend el buscador queda vacío, no rompe el formulario
      }
    }, 250)
    return () => clearTimeout(t)
  }, [query, open])

  // Cerrar al tocar afuera. `mousedown` y no `click`: si se cierra en el click,
  // un botón que quedó debajo de la lista recibe el suyo igual.
  useEffect(() => {
    const alTocarAfuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", alTocarAfuera)
    return () => document.removeEventListener("mousedown", alTocarAfuera)
  }, [])

  return (
    <div ref={caja} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground" />
        <Input
          id={id}
          ref={inputRef}
          value={open ? query : elegido}
          placeholder={placeholder}
          autoComplete="off"
          aria-invalid={invalido || undefined}
          aria-describedby={descritoPor}
          onFocus={() => { setOpen(true); setQuery("") }}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          className="h-12 pl-11 pr-10 text-[17px] font-semibold placeholder:text-foreground/70 md:text-[17px]"
        />
        {value != null && !open && (
          <button
            type="button"
            aria-label="Quitar cliente"
            onClick={() => onSelect(null)}
            className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            <X className="size-[18px]" />
          </button>
        )}
      </div>
      {open && results.length > 0 && (
        <ul
          role="listbox"
          aria-label="Clientes encontrados"
          className="absolute inset-x-0 top-full z-50 mt-1.5 max-h-64 overflow-y-auto overscroll-contain rounded-xl border border-border bg-popover py-1 shadow-2xl"
        >
          {results.map((c) => (
            <li key={c.id} role="option" aria-selected={c.id === value}>
              <button
                type="button"
                // Igual que arriba: el mousedown de cerrar-al-tocar-afuera
                // se adelanta al click y éste nunca llegaría.
                onMouseDown={() => { onSelect(c); setOpen(false) }}
                // Alto cómodo a propósito: esto lo usa gente grande.
                className="flex w-full flex-col gap-0.5 px-4 py-3 text-left hover:bg-gold/15"
              >
                <span className="text-[16px] font-bold text-foreground">{c.marca}</span>
                {c.razon_social && (
                  <span className="text-[13px] text-muted-foreground">{c.razon_social}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
