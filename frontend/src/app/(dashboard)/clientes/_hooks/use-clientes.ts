"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { api } from "@/lib/api"
import type { Cliente, Filtros } from "@/types/database"

const PER_PAGE = 20
const EMPTY_FILTROS: Filtros = { rubros: [], provincias: [], envases: [] }
export type SortDir = "asc" | "desc"

/**
 * Toda la lógica de datos de Clientes en un solo lugar: fetch, filtros (con
 * búsqueda debounced), paginación, orden, loading/error y las mutaciones
 * optimistas. La UI (view/table/filters) solo consume lo que devuelve.
 */
export function useClientes() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const [filtros, setFiltros] = useState<Filtros>(EMPTY_FILTROS)
  const [search, setSearchState] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [rubro, setRubroState] = useState("")
  const [provincia, setProvinciaState] = useState("")
  const [page, setPage] = useState(1)
  const [sortBy, setSortBy] = useState("marca")
  const [sortDir, setSortDir] = useState<SortDir>("asc")
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Catálogos de filtros (una vez)
  useEffect(() => {
    api.dashboard.filtros().then(setFiltros).catch(() => {})
  }, [])

  // Búsqueda con debounce → resetea a la página 1
  useEffect(() => {
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 300)
    return () => clearTimeout(debounceRef.current)
  }, [search])

  const fetchClientes = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const res = await api.clientes.list({
        page,
        per_page: PER_PAGE,
        search: debouncedSearch.trim() || undefined,
        rubro: rubro || undefined,
        provincia: provincia || undefined,
        sort_by: sortBy,
        sort_dir: sortDir,
      })
      setClientes((res.data as Cliente[]) ?? [])
      setTotal(res.total ?? 0)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [page, debouncedSearch, rubro, provincia, sortBy, sortDir])

  useEffect(() => {
    fetchClientes()
  }, [fetchClientes])

  // Setters de filtro que resetean la paginación
  const setSearch = useCallback((v: string) => setSearchState(v), [])
  const setRubro = useCallback((v: string) => { setRubroState(v); setPage(1) }, [])
  const setProvincia = useCallback((v: string) => { setProvinciaState(v); setPage(1) }, [])
  const clearFilters = useCallback(() => {
    setSearchState(""); setRubroState(""); setProvinciaState(""); setPage(1)
  }, [])

  const toggleSort = useCallback((key: string) => {
    setSortDir((prevDir) => (key === sortBy ? (prevDir === "asc" ? "desc" : "asc") : "asc"))
    setSortBy(key)
    setPage(1)
  }, [sortBy])

  // Mutaciones optimistas (la tabla refleja el cambio sin recargar)
  const onCreated = useCallback((c: Cliente) => { setClientes((p) => [c, ...p]); setTotal((t) => t + 1) }, [])
  const onUpdated = useCallback((c: Cliente) => setClientes((p) => p.map((x) => (x.id === c.id ? c : x))), [])
  const onDeleted = useCallback((id: number) => {
    setClientes((p) => p.filter((x) => x.id !== id))
    setTotal((t) => Math.max(0, t - 1))
  }, [])

  return {
    clientes, total, loading, error, filtros, perPage: PER_PAGE,
    search, setSearch, rubro, setRubro, provincia, setProvincia,
    clearFilters, hasFilters: Boolean(search || rubro || provincia),
    page, setPage, sortBy, sortDir, toggleSort,
    refetch: fetchClientes, onCreated, onUpdated, onDeleted,
  }
}
