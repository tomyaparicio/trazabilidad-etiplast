"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Building2, ChevronDown, Search, X } from "lucide-react"
import { SIN_RAZON_SOCIAL } from "../_hooks/use-clientes"

/** Tope de opciones renderizadas: con ~400 razones sociales, la lista completa
 *  no aporta nada — el que busca una puntual la escribe. */
const MAX_VISIBLES = 60
const ANCHO_MINIMO = 300

type Caja = { top: number; left: number; width: number }

type Props = {
  value: string
  onChange: (v: string) => void
  opciones: string[]
}

/**
 * Filtro de razón social con búsqueda. Es un combobox propio y no un <select>
 * nativo porque el catálogo real tiene cientos de entradas: scrollearlas a mano
 * no es un filtro, es un castigo. El catálogo ya viene cargado, así que el
 * filtrado es local (sin ida y vuelta al backend por tecla).
 *
 * El panel va en un portal con posición fija porque el banner (PageHeader) es
 * `overflow-hidden` y, dentro del flujo normal, lo recorta contra su borde.
 */
export function RazonSocialFilter({ value, onChange, opciones }: Props) {
  const [caja, setCaja] = useState<Caja | null>(null)
  const [query, setQuery] = useState("")
  const ref = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const open = caja !== null

  const medir = useCallback((): Caja | null => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return null
    const width = Math.max(r.width, ANCHO_MINIMO)
    return {
      top: r.bottom + 8,
      // No dejar que se escape del viewport por la derecha.
      left: Math.max(12, Math.min(r.left, window.innerWidth - width - 12)),
      width,
    }
  }, [])

  // Cerrar siempre limpia la búsqueda: al reabrir se ve el catálogo completo.
  const cerrar = useCallback(() => { setCaja(null); setQuery("") }, [])
  const abrir = useCallback(() => setCaja(medir()), [medir])

  useEffect(() => {
    if (!open) return
    const click = (e: MouseEvent) => {
      const t = e.target as Node
      if (ref.current?.contains(t) || panelRef.current?.contains(t)) return
      cerrar()
    }
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") cerrar() }
    // El trigger vive dentro de la página, que scrollea: el panel lo sigue.
    const reubicar = () => setCaja(medir())
    document.addEventListener("mousedown", click)
    document.addEventListener("keydown", esc)
    window.addEventListener("scroll", reubicar, true)
    window.addEventListener("resize", reubicar)
    return () => {
      document.removeEventListener("mousedown", click)
      document.removeEventListener("keydown", esc)
      window.removeEventListener("scroll", reubicar, true)
      window.removeEventListener("resize", reubicar)
    }
  }, [open, cerrar, medir])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const coincidencias = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? opciones.filter((o) => o.toLowerCase().includes(q)) : opciones
  }, [opciones, query])

  const etiqueta =
    value === SIN_RAZON_SOCIAL ? "Sin razón social" : value || "Todas las razones sociales"

  const item = (v: string, texto: string, extra = "") => (
    <button
      key={v || "__todas__"}
      type="button"
      role="option"
      aria-selected={value === v}
      onClick={() => { onChange(v); cerrar() }}
      className={`flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm transition-colors hover:bg-muted ${
        value === v ? "bg-muted font-semibold text-foreground" : "text-foreground/85"
      } ${extra}`}
    >
      <span className="truncate">{texto}</span>
      {value === v && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-gold" />}
    </button>
  )

  return (
    <div ref={ref} className="relative lg:w-72">
      <Building2 aria-hidden className="pointer-events-none absolute left-4 top-1/2 z-10 size-5 -translate-y-1/2 text-white/60" />
      <button
        type="button"
        onClick={() => (open ? cerrar() : abrir())}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Filtrar por razón social"
        className="flex h-14 w-full items-center rounded-xl border border-white/25 bg-white/10 pl-12 pr-10 text-left text-[15px] text-white transition-colors hover:bg-white/15 focus-visible:border-white/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
      >
        <span className={`truncate ${value ? "font-semibold" : "text-white/75"}`}>{etiqueta}</span>
      </button>
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Quitar filtro de razón social"
          className="absolute right-2.5 top-1/2 z-10 -translate-y-1/2 rounded-lg p-1.5 text-white/70 transition-colors hover:bg-white/15 hover:text-white"
        >
          <X className="size-4" />
        </button>
      ) : (
        <ChevronDown aria-hidden className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-white/60" />
      )}

      {caja && createPortal(
        <div
          ref={panelRef}
          role="listbox"
          aria-label="Razones sociales"
          style={{ top: caja.top, left: caja.left, width: caja.width }}
          className="fixed z-[60] overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl"
        >
          <div className="relative border-b border-border">
            <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar razón social…"
              className="h-12 w-full bg-transparent pl-10 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>

          <div className="max-h-[min(60vh,22rem)] overflow-y-auto">
            {item("", "Todas las razones sociales")}
            {item(SIN_RAZON_SOCIAL, "Sin razón social", "border-b border-border")}
            {coincidencias.slice(0, MAX_VISIBLES).map((rs) => item(rs, rs))}
            {coincidencias.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">Ninguna coincide con “{query.trim()}”</p>
            )}
            {coincidencias.length > MAX_VISIBLES && (
              <p className="border-t border-border px-4 py-2.5 text-center text-xs text-muted-foreground">
                {coincidencias.length - MAX_VISIBLES} más — afiná la búsqueda
              </p>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
