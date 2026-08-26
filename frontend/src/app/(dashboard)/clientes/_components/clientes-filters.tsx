"use client"

import { Filter, Search, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import type { Filtros } from "@/types/database"

/**
 * Barra de filtros de Clientes — 100% presentacional (controlada por props).
 * No sabe de fetch ni de estado global; solo emite cambios hacia arriba.
 */
export function ClientesFilters({
  filtros,
  search, onSearch,
  rubro, onRubro,
  provincia, onProvincia,
  hasFilters, onClear,
}: {
  filtros: Filtros
  search: string; onSearch: (v: string) => void
  rubro: string; onRubro: (v: string) => void
  provincia: string; onProvincia: (v: string) => void
  hasFilters: boolean; onClear: () => void
}) {
  return (
    <div className="rounded-2xl border border-border bg-card/60 p-5 backdrop-blur-sm">
      <div className="mb-4 flex items-center gap-2">
        <div className="rounded-lg border border-gold/20 bg-gold/10 p-1.5">
          <Filter className="h-3.5 w-3.5 text-gold" strokeWidth={1.5} />
        </div>
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Filtros</span>
        {hasFilters && (
          <button
            onClick={onClear}
            className="ml-auto flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground transition-colors hover:text-gold"
          >
            <X className="h-3 w-3" /> Limpiar todo
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-4">
        <div className="min-w-[240px] flex-1">
          <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Búsqueda</label>
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search" autoComplete="off" value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="#ID, marca, razón social, localidad, producto…"
              className="h-11 rounded-xl pl-10"
            />
          </div>
        </div>
        <div className="min-w-[180px]">
          <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Rubro</label>
          <Select value={rubro} onChange={(e) => onRubro(e.target.value)} aria-label="Filtrar por rubro" className="h-11 rounded-xl">
            <option value="">Todos los rubros</option>
            {filtros.rubros.map((r) => <option key={r} value={r}>{r}</option>)}
          </Select>
        </div>
        <div className="min-w-[180px]">
          <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Provincia</label>
          <Select value={provincia} onChange={(e) => onProvincia(e.target.value)} aria-label="Filtrar por provincia" className="h-11 rounded-xl">
            <option value="">Todas las provincias</option>
            {filtros.provincias.map((p) => <option key={p} value={p}>{p}</option>)}
          </Select>
        </div>
      </div>
    </div>
  )
}
