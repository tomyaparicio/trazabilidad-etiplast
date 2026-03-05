"use client"

import { useEffect, useState, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import type { Cliente, Filtros } from "@/types/database"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Search, ChevronLeft, ChevronRight, X, SearchX, Plus } from "lucide-react"
import { ClienteDetailDialog } from "./cliente-detail-dialog"
import { ClienteNuevoDialog } from "./cliente-nuevo-dialog"

const RUBRO_STYLES: Record<string, { dot: string; text: string; bg: string; border: string }> = {
  Agua:             { dot: "#22d3ee", text: "text-cyan-400",    bg: "bg-cyan-500/10",    border: "border-cyan-500/20" },
  "Jugos-Gaseosas": { dot: "#fb923c", text: "text-orange-400",  bg: "bg-orange-500/10",  border: "border-orange-500/20" },
  Limpieza:         { dot: "#34d399", text: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
  Agroquimicos:     { dot: "#f87171", text: "text-red-400",     bg: "bg-red-500/10",     border: "border-red-500/20" },
  Aceite:           { dot: "#fbbf24", text: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/20" },
}

const AVATAR_PALETTE = [
  { from: "#6366f1", to: "#4338ca", color: "#fff" },
  { from: "#f5eb4a", to: "#c9a500", color: "#0d0d1a" },
  { from: "#8b5cf6", to: "#7c3aed", color: "#fff" },
  { from: "#06b6d4", to: "#0284c7", color: "#fff" },
  { from: "#10b981", to: "#059669", color: "#fff" },
  { from: "#f97316", to: "#ea580c", color: "#fff" },
  { from: "#ec4899", to: "#db2777", color: "#fff" },
]

function avatarFor(name: string) {
  const idx = Math.abs((name?.charCodeAt(0) ?? 65) - 65) % AVATAR_PALETTE.length
  return AVATAR_PALETTE[idx]
}

function getRubroStyle(r: string) {
  return RUBRO_STYLES[r] ?? { dot: "#6b6b8a", text: "text-[#6b6b8a]", bg: "bg-white/[0.05]", border: "border-white/[0.08]" }
}

interface ClientesTableProps {
  initialClientes: Cliente[]
  initialTotal: number
  filtros: Filtros
}

export function ClientesTable({ initialClientes, initialTotal, filtros }: ClientesTableProps) {
  const supabase = createClient()
  const [clientes, setClientes] = useState(initialClientes)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState("")
  const [rubro, setRubro] = useState("")
  const [provincia, setProvincia] = useState("")
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(initialTotal)
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null)
  const [nuevoDialogOpen, setNuevoDialogOpen] = useState(false)

  const perPage = 20
  const totalPages = Math.ceil(total / perPage)
  const nf = new Intl.NumberFormat("es-AR")

  const fetchClientes = useCallback(async () => {
    setLoading(true)
    try {
      const from = (page - 1) * perPage
      const to = from + perPage - 1
      let query = supabase.from("clientes").select("*", { count: "exact" }).order("id_cliente").range(from, to)
      if (search) {
        const term = `%${search}%`
        query = query.or(`marca.ilike.${term},razon_social.ilike.${term},localidad.ilike.${term},producto.ilike.${term}`)
      }
      if (rubro) query = query.eq("rubro", rubro)
      if (provincia) query = query.eq("provincia", provincia)
      const { data, count, error } = await query
      if (error) throw error
      setClientes((data as Cliente[]) || [])
      setTotal(count || 0)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [page, search, rubro, provincia, supabase])

  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    if (!mounted) { setMounted(true); return }
    fetchClientes()
  }, [page, search, rubro, provincia, fetchClientes, mounted])

  const handleClienteUpdate = (updated: Cliente) => {
    setClientes((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
    setSelectedCliente((prev) => (prev?.id === updated.id ? updated : prev))
  }

  const handleClienteCreated = (created: Cliente) => {
    setClientes((prev) => [created, ...prev])
    setTotal((t) => t + 1)
  }

  return (
    <div className="p-6 lg:p-8 space-y-5 max-w-[1200px] mx-auto">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-1 h-6 rounded-full bg-[#f5eb4a]" />
          <div>
            <h2 className="text-xl font-semibold text-white">Clientes</h2>
            <p className="text-[#6b6b8a] text-sm">{nf.format(total)} registros encontrados</p>
          </div>
        </div>
        <Button
          onClick={() => setNuevoDialogOpen(true)}
          className="h-10 px-4 rounded-xl bg-[#f5eb4a]/10 hover:bg-[#f5eb4a]/20 text-[#f5eb4a] border border-[#f5eb4a]/25 text-sm font-medium gap-2 shrink-0"
        >
          <Plus className="w-4 h-4" />
          Nuevo cliente
        </Button>
        {(rubro || provincia) && (
          <div className="flex flex-wrap items-center gap-2">
            {rubro && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-[#6366f1]/10 text-[#6366f1] border border-[#6366f1]/20 px-3 py-1.5 rounded-xl">
                {rubro}
                <button onClick={() => { setRubro(""); setPage(1) }} className="hover:text-white transition-colors">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {provincia && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-[#f5eb4a]/10 text-[#f5eb4a] border border-[#f5eb4a]/20 px-3 py-1.5 rounded-xl">
                {provincia}
                <button onClick={() => { setProvincia(""); setPage(1) }} className="hover:text-white transition-colors">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-[260px] relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4a4a6a]" />
          <Input
            type="search"
            autoComplete="off"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="Buscar marca, razón social, localidad…"
            className="pl-10 h-11 rounded-xl bg-white/[0.03] border-white/[0.06] text-white placeholder:text-[#4a4a6a] focus-visible:border-[#f5eb4a]/30 focus-visible:ring-[#f5eb4a]/10 transition-colors"
          />
        </div>
        <select
          value={rubro}
          onChange={(e) => { setRubro(e.target.value); setPage(1) }}
          aria-label="Filtrar por rubro"
          className="h-11 px-4 bg-white/[0.03] border border-white/[0.06] rounded-xl text-sm text-[#c8c8d8] min-w-[160px] focus:outline-none focus:border-[#f5eb4a]/30 transition-colors cursor-pointer"
        >
          <option value="" className="bg-[#0d0d1a]">Todos los rubros</option>
          {filtros.rubros.map((r) => <option key={r} value={r} className="bg-[#0d0d1a]">{r}</option>)}
        </select>
        <select
          value={provincia}
          onChange={(e) => { setProvincia(e.target.value); setPage(1) }}
          aria-label="Filtrar por provincia"
          className="h-11 px-4 bg-white/[0.03] border border-white/[0.06] rounded-xl text-sm text-[#c8c8d8] min-w-[160px] focus:outline-none focus:border-[#f5eb4a]/30 transition-colors cursor-pointer"
        >
          <option value="" className="bg-[#0d0d1a]">Todas las provincias</option>
          {filtros.provincias.map((p) => <option key={p} value={p} className="bg-[#0d0d1a]">{p}</option>)}
        </select>
      </div>

      {/* ── Table ── */}
      <div className="bg-[#0f0f1a]/80 border border-white/[0.06] rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.05] bg-white/[0.01]">
                {["N.", "Marca", "Rubro", "Razón Social", "Localidad", "Provincia", "Producto", ""].map((h, i) => (
                  <th
                    key={i}
                    scope="col"
                    className="text-left px-5 py-3.5 text-[10px] font-semibold text-[#4a4a6a] uppercase tracking-wider whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-white/[0.03] last:border-0">
                    <td className="px-5 py-4">
                      <div className="h-3 w-8 rounded-full bg-white/[0.06] animate-pulse" />
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-white/[0.06] animate-pulse shrink-0" />
                        <div className="h-3.5 w-28 rounded-full bg-white/[0.06] animate-pulse" />
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="h-6 w-20 rounded-lg bg-white/[0.05] animate-pulse" />
                    </td>
                    <td className="px-5 py-4"><div className="h-3 w-36 rounded-full bg-white/[0.04] animate-pulse" /></td>
                    <td className="px-5 py-4"><div className="h-3 w-24 rounded-full bg-white/[0.04] animate-pulse" /></td>
                    <td className="px-5 py-4"><div className="h-3 w-24 rounded-full bg-white/[0.04] animate-pulse" /></td>
                    <td className="px-5 py-4"><div className="h-3 w-28 rounded-full bg-white/[0.04] animate-pulse" /></td>
                    <td className="px-5 py-4"><div className="w-4 h-4 rounded bg-white/[0.04] animate-pulse" /></td>
                  </tr>
                ))
              ) : clientes.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="rounded-2xl bg-white/[0.04] border border-white/[0.06] p-5">
                        <SearchX className="w-8 h-8 text-[#4a4a6a]" strokeWidth={1.5} />
                      </div>
                      <p className="text-[#6b6b8a] text-sm font-medium">Sin resultados</p>
                      <p className="text-[#4a4a6a] text-xs">No se encontraron clientes con los filtros aplicados</p>
                    </div>
                  </td>
                </tr>
              ) : (
                clientes.map((c) => {
                  const rs = getRubroStyle(c.rubro || "")
                  const av = avatarFor(c.marca || "")
                  return (
                    <tr
                      key={c.id}
                      className="border-b border-white/[0.03] last:border-0 hover:bg-white/[0.025] cursor-pointer transition-colors duration-150 group"
                      onClick={() => setSelectedCliente(c)}
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedCliente(c) } }}
                    >
                      <td className="px-5 py-3.5 text-xs font-mono text-[#4a4a6a] tabular-nums">{c.id_cliente}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 border border-white/[0.06]"
                            style={{ background: `linear-gradient(135deg, ${av.from}, ${av.to})`, color: av.color }}
                          >
                            {(c.marca || "?")?.[0]?.toUpperCase()}
                          </div>
                          <span className="text-sm font-semibold text-white group-hover:text-[#f5eb4a] transition-colors">
                            {c.marca}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium border ${rs.bg} ${rs.text} ${rs.border}`}>
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: rs.dot }} />
                          {c.rubro}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-[#6b6b8a] max-w-[180px] truncate">{c.razon_social}</td>
                      <td className="px-5 py-3.5 text-sm text-[#6b6b8a] truncate">{c.localidad}</td>
                      <td className="px-5 py-3.5 text-sm text-[#6b6b8a] truncate">{c.provincia}</td>
                      <td className="px-5 py-3.5 text-sm text-[#4a4a6a] max-w-[140px] truncate">{c.producto ?? ""}</td>
                      <td className="px-5 py-3.5">
                        <ChevronRight className="w-4 h-4 text-[#3a3a5a] group-hover:text-[#f5eb4a] group-hover:translate-x-0.5 transition-all duration-150" />
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ── Pagination ── */}
        {totalPages > 1 && (
          <nav className="flex items-center justify-between px-5 py-4 border-t border-white/[0.05]" aria-label="Paginación">
            <p className="text-xs text-[#4a4a6a]">
              Mostrando{" "}
              <span className="text-[#c8c8d8] font-medium tabular-nums">
                {nf.format((page - 1) * perPage + 1)}–{nf.format(Math.min(page * perPage, total))}
              </span>{" "}
              de{" "}
              <span className="text-[#c8c8d8] font-medium tabular-nums">{nf.format(total)}</span>
            </p>
            <div className="flex gap-1.5">
              <Button
                variant="outline" size="icon"
                className="h-8 w-8 bg-white/[0.03] border-white/[0.06] text-[#6b6b8a] hover:bg-white/[0.06] hover:text-white rounded-lg"
                onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} aria-label="Página anterior"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const p = page <= 3 ? i + 1 : page + i - 2
                if (p < 1 || p > totalPages) return null
                return (
                  <Button
                    key={p} variant="outline" size="icon"
                    className={`h-8 w-8 text-xs tabular-nums transition-all rounded-lg ${
                      p === page
                        ? "bg-[#f5eb4a]/10 border-[#f5eb4a]/30 text-[#f5eb4a] hover:bg-[#f5eb4a]/15 font-semibold"
                        : "bg-white/[0.03] border-white/[0.06] text-[#6b6b8a] hover:bg-white/[0.06] hover:text-white"
                    }`}
                    onClick={() => setPage(p)} aria-current={p === page ? "page" : undefined}
                  >
                    {p}
                  </Button>
                )
              })}
              <Button
                variant="outline" size="icon"
                className="h-8 w-8 bg-white/[0.03] border-white/[0.06] text-[#6b6b8a] hover:bg-white/[0.06] hover:text-white rounded-lg"
                onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages} aria-label="Página siguiente"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </nav>
        )}
      </div>

      <ClienteDetailDialog
        cliente={selectedCliente}
        onClose={() => setSelectedCliente(null)}
        onUpdate={handleClienteUpdate}
      />
      <ClienteNuevoDialog
        open={nuevoDialogOpen}
        onClose={() => setNuevoDialogOpen(false)}
        onCreated={handleClienteCreated}
        filtros={filtros}
      />
    </div>
  )
}
