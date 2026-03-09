"use client"

import React, { useEffect, useState, useCallback, useRef } from "react"
import { api } from "@/lib/api"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import {
  Building2, Plus, Pencil, Loader2,
  Search, Boxes, Package, AlertCircle, Eye,
  ChevronLeft, ChevronRight,
} from "lucide-react"

const PER_PAGE = 30

// ─── Types ────────────────────────────────────────────────────────────────────
interface RazonSocialRow {
  id: number
  razon_social: string
  cuit: string | null
  cantidad_marcas: number
  created_at: string | null
}

interface Producto {
  id: number
  nombre: string | null
  volumen_cantidad: number | null
  volumen_unidad: string | null
  lamina: string | null
  alto: number | null
  cilindro: number | null
  cierre: number | null
  envase: string | null
}

interface MarcaDetalle {
  id: number
  id_cliente: number | null
  marca: string | null
  rubro: string | null
  productos: Producto[]
}

interface RazonSocialDetalle extends RazonSocialRow {
  marcas: MarcaDetalle[]
}

// ─── Rubro colors ────────────────────────────────────────────────────────────
const RUBRO_COLOR: Record<string, string> = {
  Agua:             "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  "Jugos-Gaseosas": "bg-orange-500/10 text-orange-400 border-orange-500/20",
  Limpieza:         "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  Agroquimicos:     "bg-red-500/10 text-red-400 border-red-500/20",
  Aceite:           "bg-amber-500/10 text-amber-400 border-amber-500/20",
}
const rubroColor = (r?: string | null) =>
  RUBRO_COLOR[r ?? ""] ?? "bg-muted/50 text-muted-foreground border-border"

// ─── Product badge ────────────────────────────────────────────────────────────
function ProdBadge({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value == null || String(value).trim() === "") return null
  return (
    <span className="inline-flex items-center gap-1 bg-background/60 border border-border/60 rounded-md px-2 py-0.5 text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground font-medium">{value}</span>
    </span>
  )
}

// ─── Detail dialog ────────────────────────────────────────────────────────────
function DetalleMarcasDialog({
  rs, onClose, onEdit,
}: {
  rs: RazonSocialRow
  onClose: () => void
  onEdit: () => void
}) {
  const [data, setData] = useState<RazonSocialDetalle | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState("")

  useEffect(() => {
    setLoading(true)
    setFetchError("")
    api.razonessociales.get(rs.id)
      .then((d) => setData(d as RazonSocialDetalle))
      .catch((e) => setFetchError(e instanceof Error ? e.message : "Error al cargar"))
      .finally(() => setLoading(false))
  }, [rs.id])

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="w-[95vw] max-w-[860px] max-h-[85vh] overflow-hidden flex flex-col bg-card border-border p-0">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5 text-violet-400" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-foreground leading-tight">
                {rs.razon_social}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                {rs.cuit ? `CUIT ${rs.cuit}` : "Sin CUIT"} · {rs.cantidad_marcas} marca{rs.cantidad_marcas !== 1 ? "s" : ""}
              </DialogDescription>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onEdit}
            className="h-8 rounded-lg text-xs gap-1.5 border-border text-muted-foreground hover:text-foreground hover:bg-muted shrink-0"
          >
            <Pencil className="w-3.5 h-3.5" />Editar
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="flex items-center justify-center py-20 gap-3 text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />Cargando marcas…
            </div>
          ) : fetchError ? (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />{fetchError}
            </div>
          ) : !data || data.marcas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
              <div className="w-14 h-14 rounded-2xl bg-muted/30 border border-border flex items-center justify-center">
                <Boxes className="w-7 h-7 opacity-30" strokeWidth={1.5} />
              </div>
              <p className="text-sm font-medium">Sin marcas vinculadas</p>
              <p className="text-xs text-muted-foreground/60">Las marcas se vinculan desde el detalle del cliente</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {data.marcas.map((marca) => (
                <div key={marca.id} className="rounded-xl border border-border bg-muted/10 p-4">
                  {/* Marca header */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <p className="text-sm font-bold text-foreground leading-tight">
                        {marca.marca || <span className="italic text-muted-foreground">Sin nombre</span>}
                      </p>
                      {marca.id_cliente && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">Cliente #{marca.id_cliente}</p>
                      )}
                    </div>
                    {marca.rubro && (
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${rubroColor(marca.rubro)}`}>
                        {marca.rubro}
                      </span>
                    )}
                  </div>

                  {/* Productos */}
                  {marca.productos.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground/40 italic">Sin productos registrados</p>
                  ) : (
                    <div className="space-y-2">
                      {marca.productos.map((p) => {
                        const title = [
                          p.nombre,
                          p.volumen_cantidad != null ? `${p.volumen_cantidad}${p.volumen_unidad ?? ""}` : null,
                        ].filter(Boolean).join(" · ")

                        return (
                          <div key={p.id} className="rounded-lg border border-border/60 bg-background/40 px-3 py-2.5">
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <Package className="w-3 h-3 text-gold shrink-0" />
                              <p className="text-xs font-semibold text-foreground">
                                {title || <span className="italic text-muted-foreground">Sin nombre</span>}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              <ProdBadge label="Lámina"   value={p.lamina}   />
                              <ProdBadge label="Envase"   value={p.envase}   />
                              <ProdBadge label="Alto"     value={p.alto}     />
                              <ProdBadge label="Cilindro" value={p.cilindro} />
                              <ProdBadge label="Cierre"   value={p.cierre}   />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function RazonesSocialesPage() {
  const [rows, setRows]           = useState<RazonSocialRow[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState("")
  const [search, setSearch]       = useState("")
  const [page, setPage]           = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal]         = useState(0)
  const [viewRS, setViewRS]       = useState<RazonSocialRow | null>(null)
  const [nuevoOpen, setNuevoOpen] = useState(false)
  const [editRS, setEditRS]       = useState<RazonSocialRow | null>(null)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchRows = useCallback(async (q: string, p: number) => {
    setLoading(true); setError("")
    try {
      const res = await api.razonessociales.list({ search: q || undefined, page: p, per_page: PER_PAGE })
      setRows(res.data as RazonSocialRow[])
      setTotal(res.total)
      setTotalPages(res.total_pages)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchRows(search, page) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = (v: string) => {
    setSearch(v)
    setPage(1)
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => fetchRows(v, 1), 350)
  }

  const goToPage = (p: number) => {
    setPage(p)
    fetchRows(search, p)
  }

  const handleCreated = (rs: RazonSocialRow) => {
    setNuevoOpen(false)
    fetchRows(search, 1)
    setPage(1)
  }

  const handleUpdated = (rs: RazonSocialRow) => {
    setRows((prev) => prev.map((r) => (r.id === rs.id ? rs : r)))
    setEditRS(null)
    if (viewRS?.id === rs.id) setViewRS(rs)
  }

  // Genera los números de página a mostrar (máx 7 botones)
  const pageNumbers = (() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
    if (page <= 4) return [1, 2, 3, 4, 5, "…", totalPages]
    if (page >= totalPages - 3) return [1, "…", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages]
    return [1, "…", page - 1, page, page + 1, "…", totalPages]
  })()

  return (
    <div className="p-6 lg:p-8 space-y-5 max-w-[1200px] mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-1 h-6 rounded-full bg-gold" />
          <div>
            <h2 className="text-xl font-semibold text-foreground">Razones Sociales</h2>
            <p className="text-muted-foreground text-sm">
              {loading ? "Cargando…" : `${total.toLocaleString("es-AR")} entidades legales`}
            </p>
          </div>
        </div>
        <Button
          onClick={() => setNuevoOpen(true)}
          className="h-10 px-4 rounded-xl bg-gold/10 hover:bg-gold/20 text-gold border border-gold/25 text-sm font-medium gap-2 shrink-0"
        >
          <Plus className="w-4 h-4" />Nueva razón social
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Buscar razón social o CUIT…"
          className="pl-9 h-10 rounded-xl bg-input border-border focus-visible:border-gold/40 focus-visible:ring-gold/10"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <AlertCircle className="w-4 h-4 shrink-0" />{error}
        </div>
      )}

      {/* Table */}
      <div className="bg-card/80 border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {["Razón Social", "CUIT", "Marcas", "Acciones"].map((h) => (
                  <th key={h} scope="col"
                    className="text-left px-5 py-3.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: PER_PAGE }).map((_, i) => (
                  <tr key={i} className="border-b border-border/50 last:border-0">
                    <td className="px-5 py-4"><div className="h-3.5 w-56 rounded-full bg-muted animate-pulse" /></td>
                    <td className="px-5 py-4"><div className="h-3.5 w-32 rounded-full bg-muted animate-pulse" /></td>
                    <td className="px-5 py-4"><div className="h-6 w-10 rounded-full bg-muted animate-pulse" /></td>
                    <td className="px-5 py-4"><div className="h-8 w-36 rounded-lg bg-muted animate-pulse" /></td>
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="rounded-2xl bg-muted/50 border border-border p-5">
                        <Building2 className="w-8 h-8 text-muted-foreground" strokeWidth={1.5} />
                      </div>
                      <p className="text-muted-foreground text-sm font-medium">
                        {search ? "Sin resultados para esa búsqueda" : "Sin razones sociales registradas"}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((rs) => (
                  <tr key={rs.id} className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors duration-150">

                    {/* Nombre */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-muted/50 border border-border flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
                          {rs.razon_social[0]?.toUpperCase()}
                        </div>
                        <span className="text-sm font-semibold text-foreground">{rs.razon_social}</span>
                      </div>
                    </td>

                    {/* CUIT */}
                    <td className="px-5 py-3.5 text-sm text-muted-foreground font-mono">
                      {rs.cuit || <span className="text-muted-foreground/30 text-xs">—</span>}
                    </td>

                    {/* Marcas count */}
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${
                        rs.cantidad_marcas > 0
                          ? "bg-violet-500/10 text-violet-400 border-violet-500/20"
                          : "bg-muted/50 text-muted-foreground border-border"
                      }`}>
                        {rs.cantidad_marcas}
                      </span>
                    </td>

                    {/* Acciones */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setViewRS(rs)}
                          className="h-8 rounded-lg text-xs gap-1.5 border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                        >
                          <Eye className="w-3.5 h-3.5" />Ver marcas
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditRS(rs)}
                          className="h-8 rounded-lg text-xs gap-1.5 border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                        >
                          <Pencil className="w-3.5 h-3.5" />Editar
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-between gap-4 px-5 py-3.5 border-t border-border bg-muted/10 flex-wrap">

            {/* Info */}
            <p className="text-xs text-muted-foreground whitespace-nowrap">
              Página <span className="font-semibold text-foreground">{page}</span> de{" "}
              <span className="font-semibold text-foreground">{totalPages}</span>
              {" · "}{total.toLocaleString("es-AR")} registros
            </p>

            {/* Controles */}
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => goToPage(page - 1)}
                disabled={page === 1}
                className="h-8 w-8 p-0 rounded-lg border-border text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>

              {pageNumbers.map((n, i) =>
                n === "…" ? (
                  <span key={`ellipsis-${i}`} className="w-8 text-center text-xs text-muted-foreground">…</span>
                ) : (
                  <Button
                    key={n}
                    variant="outline"
                    size="sm"
                    onClick={() => goToPage(n as number)}
                    className={`h-8 w-8 p-0 rounded-lg text-xs border-border transition-colors ${
                      page === n
                        ? "bg-gold/10 text-gold border-gold/30 font-bold hover:bg-gold/15"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                  >
                    {n}
                  </Button>
                )
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => goToPage(page + 1)}
                disabled={page === totalPages}
                className="h-8 w-8 p-0 rounded-lg border-border text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Detail dialog */}
      {viewRS && (
        <DetalleMarcasDialog
          rs={viewRS}
          onClose={() => setViewRS(null)}
          onEdit={() => { setEditRS(viewRS); setViewRS(null) }}
        />
      )}

      {/* Create / Edit dialog */}
      <RSDialog
        open={nuevoOpen}
        onClose={() => setNuevoOpen(false)}
        onSaved={handleCreated}
      />
      {editRS && (
        <RSDialog
          open
          rs={editRS}
          onClose={() => setEditRS(null)}
          onSaved={handleUpdated}
        />
      )}
    </div>
  )
}

// ─── Create / Edit dialog ─────────────────────────────────────────────────────
function RSDialog({
  open, rs, onClose, onSaved,
}: {
  open: boolean
  rs?: RazonSocialRow
  onClose: () => void
  onSaved: (rs: RazonSocialRow) => void
}) {
  const isEdit = !!rs
  const [form, setForm] = useState({ razon_social: rs?.razon_social ?? "", cuit: rs?.cuit ?? "" })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    setForm({ razon_social: rs?.razon_social ?? "", cuit: rs?.cuit ?? "" })
    setError("")
  }, [rs?.id, open])

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.razon_social.trim()) { setError("La razón social es requerida"); return }
    setSaving(true); setError("")
    try {
      const body = { razon_social: form.razon_social.trim(), cuit: form.cuit.trim() || undefined }
      const saved = isEdit
        ? await api.razonessociales.update(rs!.id, body)
        : await api.razonessociales.create(body)
      onSaved(saved as RazonSocialRow)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-[440px] bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Building2 className="w-5 h-5 text-gold" />
            {isEdit ? "Editar razón social" : "Nueva razón social"}
          </DialogTitle>
          <DialogDescription>
            {isEdit ? `Editando: ${rs!.razon_social}` : "Completá los datos de la entidad legal."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">{error}</div>
          )}

          <div className="space-y-1.5">
            <label className="block text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Razón Social <span className="text-red-400">*</span>
            </label>
            <Input value={form.razon_social} onChange={set("razon_social")} placeholder="Aguas del Sur SA"
              className="h-10 rounded-xl bg-input border-border focus-visible:border-gold/40 focus-visible:ring-gold/15" />
          </div>

          <div className="space-y-1.5">
            <label className="block text-[11px] font-medium text-muted-foreground uppercase tracking-wider">CUIT</label>
            <Input value={form.cuit} onChange={set("cuit")} placeholder="30-12345678-9"
              className="h-10 rounded-xl bg-input border-border focus-visible:border-gold/40 focus-visible:ring-gold/15 font-mono" />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="rounded-xl border-border">Cancelar</Button>
            <Button type="submit" disabled={saving || !form.razon_social.trim()}
              className="rounded-xl bg-gold/10 hover:bg-gold/20 text-gold border border-gold/25 gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {isEdit ? "Guardar cambios" : "Crear"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
