"use client"

import { useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { api } from "@/lib/api"
import type { Trazabilidad } from "@/lib/api/types"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty-state"
import {
  PackageSearch, Search, Loader2, ClipboardList, Truck, ArrowDownUp, Disc3, ExternalLink,
  AlertCircle, RefreshCw,
} from "lucide-react"
import { PageHeader } from "@/components/ui/page-header"

// ─── Helpers ────────────────────────────────────────────────────────────────

const ESTADO_OT: Record<string, string> = {
  borrador: "Borrador", pendiente: "Pendiente", en_proceso: "En Proceso",
  completada: "Completada", cancelada: "Cancelada",
}

const ESTADO_REMITO: Record<string, string> = {
  pendiente: "Pendiente", despachado: "Despachado", entregado: "Entregado", anulado: "Anulado",
}

function fmtFecha(f: string | null | undefined, conHora = false) {
  if (!f) return "—"
  const d = f.includes("T") ? new Date(f) : new Date(f + "T00:00:00")
  return conHora
    ? d.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("es-AR")
}

function TimelineSection({
  icon, title, count, children,
}: { icon: React.ReactNode; title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="relative pl-12 pb-8 last:pb-0">
      {/* Línea vertical */}
      <div className="absolute left-[18px] top-10 bottom-0 w-px bg-border" />
      {/* Punto */}
      <div className="absolute left-0 top-0 w-9 h-9 rounded-full bg-brand text-white flex items-center justify-center">
        {icon}
      </div>
      <div className="pt-1.5">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          {title}
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{count}</Badge>
        </h3>
        <div className="mt-3 space-y-3">{children}</div>
      </div>
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-card/80 border border-border rounded-xl px-4 py-3">
      {children}
    </div>
  )
}

// ─── Página ─────────────────────────────────────────────────────────────────

export default function TrazabilidadPage() {
  const [lote, setLote] = useState("")
  const [resultado, setResultado] = useState<Trazabilidad | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [buscado, setBuscado] = useState(false)

  const buscar = async () => {
    const q = lote.trim()
    if (!q || loading) return // evita doble submit (Enter + click, o Enter repetido)
    setLoading(true); setError(""); setResultado(null)
    try {
      const res = await api.trazabilidad.porLote(q)
      setResultado(res)
      setBuscado(true)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al buscar el lote"
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  const sinResultados =
    resultado &&
    resultado.ordenes.length === 0 &&
    resultado.remitos.length === 0 &&
    resultado.movimientos_stock.length === 0

  return (
    <div className="p-6 lg:p-8 space-y-5 max-w-[1000px] mx-auto">
      {/* ── Header ── */}
      <PageHeader icon={PackageSearch} title="Trazabilidad" subtitle="Seguimiento por lote: órdenes, bobinas, stock y remitos" />

      {/* ── Búsqueda ── */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Número de lote (ej: L-20260610-0042)"
            value={lote}
            onChange={(e) => setLote(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") buscar() }}
            disabled={loading}
            aria-label="Número de lote"
            className="pl-9 h-10 text-sm font-mono"
          />
        </div>
        <Button
          onClick={buscar}
          disabled={loading || !lote.trim()}
          className="bg-brand hover:bg-brand-strong text-white gap-2 h-10 px-5 rounded-xl"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Buscar
        </Button>
      </div>

      {/* ── Error + reintentar ── */}
      {error && (
        <EmptyState
          icon={<AlertCircle className="w-8 h-8" strokeWidth={1.5} />}
          title="No se pudo buscar el lote"
          description={error}
          action={
            <Button variant="outline" size="sm" onClick={buscar} className="gap-2">
              <RefreshCw className="w-3.5 h-3.5" />
              Reintentar
            </Button>
          }
        />
      )}

      {/* ── Estado inicial ── */}
      {!buscado && !loading && !error && (
        <EmptyState
          icon={<PackageSearch className="w-8 h-8" strokeWidth={1.5} />}
          title="Buscá un lote para rastrear"
          description="Ingresá el número de lote de una orden, bobina o remito para ver toda su cadena de trazabilidad"
        />
      )}

      {/* ── Sin resultados ── */}
      {resultado && sinResultados && (
        <EmptyState
          icon={<PackageSearch className="w-8 h-8" strokeWidth={1.5} />}
          title="Sin resultados para este lote"
          description={`No se encontraron órdenes, movimientos de stock ni remitos con el lote "${resultado.lote}".`}
        />
      )}

      {/* ── Timeline ── */}
      {resultado && !sinResultados && (
        <div className="bg-card/80 border border-border rounded-2xl p-6">
          <p className="text-xs text-muted-foreground mb-6">
            Cadena de trazabilidad del lote{" "}
            <span className="font-mono font-semibold text-gold">{resultado.lote}</span>
          </p>

          {/* ── Órdenes de trabajo ── */}
          <TimelineSection
            icon={<ClipboardList className="w-4 h-4" />}
            title="Órdenes de trabajo"
            count={resultado.ordenes.length}
          >
            {resultado.ordenes.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin órdenes asociadas a este lote</p>
            ) : resultado.ordenes.map((ot) => (
              <Card key={ot.id}>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/print/ordenes/${ot.id}`}
                      target="_blank"
                      className="font-mono font-semibold text-gold text-sm hover:underline inline-flex items-center gap-1"
                    >
                      {ot.numero} <ExternalLink className="w-3 h-3" />
                    </Link>
                    <span className="text-sm font-medium">{ot.cliente_nombre ?? `Cliente #${ot.cliente_id}`}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{fmtFecha(ot.fecha)}</span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {ESTADO_OT[ot.estado] ?? ot.estado}
                    </Badge>
                  </div>
                </div>

                {/* Bobinas */}
                {ot.bobinas?.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-border/60">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <Disc3 className="w-3 h-3" /> Bobinas
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {ot.bobinas.map((b, i) => (
                        <div key={b.id ?? i} className="text-xs text-muted-foreground flex items-center gap-2">
                          <span className="text-[10px] font-bold">#{i + 1}</span>
                          <span>{b.metros != null ? `${b.metros} m` : "— m"}</span>
                          <span>·</span>
                          <span>{b.kg_bob != null ? `${b.kg_bob} kg` : "— kg"}</span>
                          {b.numero_lote && (
                            <span className={`font-mono ${b.numero_lote === resultado.lote ? "text-gold font-semibold" : ""}`}>
                              {b.numero_lote}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </TimelineSection>

          {/* ── Movimientos de stock ── */}
          <TimelineSection
            icon={<ArrowDownUp className="w-4 h-4" />}
            title="Movimientos de stock"
            count={resultado.movimientos_stock.length}
          >
            {resultado.movimientos_stock.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin movimientos de stock con este lote</p>
            ) : resultado.movimientos_stock.map((m) => (
              <Card key={m.id}>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={`text-[10px] px-1.5 py-0 ${
                        m.tipo === "ingreso"
                          ? "bg-green-50 text-green-700 border-green-200"
                          : m.tipo === "egreso"
                            ? "bg-red-50 text-red-600 border-red-200"
                            : "bg-zinc-100 text-zinc-600 border-zinc-200"
                      }`}
                    >
                      {m.tipo}
                    </Badge>
                    <Link href="/stock" className="text-sm font-medium hover:underline">
                      {m.stock_item_nombre ?? `Ítem #${m.stock_item_id}`}
                    </Link>
                    {m.motivo && <span className="text-xs text-muted-foreground">({m.motivo})</span>}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {m.cantidad != null ? m.cantidad.toLocaleString("es-AR") : "—"}
                    </span>
                    <span>{fmtFecha(m.created_at, true)}</span>
                  </div>
                </div>
              </Card>
            ))}
          </TimelineSection>

          {/* ── Remitos ── */}
          <TimelineSection
            icon={<Truck className="w-4 h-4" />}
            title="Remitos"
            count={resultado.remitos.length}
          >
            {resultado.remitos.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin remitos con ítems de este lote</p>
            ) : resultado.remitos.map((r) => (
              <Card key={r.id}>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/print/remitos/${r.id}`}
                      target="_blank"
                      className="font-mono font-semibold text-gold text-sm hover:underline inline-flex items-center gap-1"
                    >
                      {r.numero} <ExternalLink className="w-3 h-3" />
                    </Link>
                    <span className="text-sm font-medium">{r.cliente_nombre ?? `Cliente #${r.cliente_id}`}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{fmtFecha(r.fecha)}</span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {ESTADO_REMITO[r.estado] ?? r.estado}
                    </Badge>
                  </div>
                </div>
                {r.items?.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-border/60 space-y-0.5">
                    {r.items.filter((i) => i.lote === resultado.lote).map((i) => (
                      <p key={i.id} className="text-xs text-muted-foreground">
                        • {i.descripcion ?? "Ítem"} — {i.cantidad != null ? `${i.cantidad.toLocaleString("es-AR")} ${i.unidad ?? ""}`.trim() : "—"}
                      </p>
                    ))}
                  </div>
                )}
              </Card>
            ))}
          </TimelineSection>
        </div>
      )}
    </div>
  )
}
