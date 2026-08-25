"use client"

/**
 * Centro de notificaciones (campana con badge + dropdown).
 * Polling del contador cada 60s. Lista paginada simple, ítems clickables que
 * marcan como leída y navegan al link. Botón "Marcar todas como leídas".
 *
 * Montado en header.tsx — implementar acá sin tocar el header.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Bell, CheckCheck, Loader2, BellOff } from "lucide-react"
import { api } from "@/lib/api"
import type { Notificacion } from "@/lib/api/types"

const POLL_MS = 60_000

function tiempoRelativo(iso: string | null): string {
  if (!iso) return ""
  const date = new Date(iso)
  const diff = Date.now() - date.getTime()
  const min = Math.floor(diff / 60_000)
  if (min < 1) return "recién"
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.floor(h / 24)
  if (d < 7) return `hace ${d} d`
  return date.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })
}

export function NotificationCenter() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [count, setCount] = useState(0)
  const [items, setItems] = useState<Notificacion[]>([])
  const [loading, setLoading] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  // ── Polling del contador ──────────────────────────────────────────────────
  const fetchCount = useCallback(async () => {
    try {
      const res = await api.notificaciones.count()
      setCount(res.count ?? 0)
    } catch {
      /* silencioso: el contador es secundario */
    }
  }, [])

  useEffect(() => {
    fetchCount()
    const id = setInterval(fetchCount, POLL_MS)
    return () => clearInterval(id)
  }, [fetchCount])

  // ── Cargar lista al abrir ───────────────────────────────────────────────────
  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.notificaciones.list({ solo_no_leidas: false, page: 1 })
      setItems(res.data ?? [])
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) fetchList()
  }, [open, fetchList])

  // ── Cerrar al clickear afuera / ESC ──────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    document.addEventListener("mousedown", onClick)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onClick)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const handleItemClick = async (n: Notificacion) => {
    if (!n.leida) {
      setItems((prev) => prev.map((it) => (it.id === n.id ? { ...it, leida: true } : it)))
      setCount((c) => Math.max(0, c - 1))
      try { await api.notificaciones.leer(n.id) } catch { /* optimista */ }
    }
    if (n.link) {
      setOpen(false)
      router.push(n.link)
    }
  }

  const handleMarcarTodas = async () => {
    setItems((prev) => prev.map((it) => ({ ...it, leida: true })))
    setCount(0)
    try { await api.notificaciones.leerTodas() } catch { /* optimista */ }
  }

  const hayNoLeidas = items.some((n) => !n.leida)

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Notificaciones"
        className="relative flex h-9 w-9 items-center justify-center rounded-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Bell className="h-[18px] w-[18px]" />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#f5eb4a] px-1 text-[10px] font-bold leading-none text-[#1a1866]">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-border bg-popover shadow-2xl animate-in fade-in slide-in-from-top-1 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-sm font-semibold text-foreground">Notificaciones</span>
            {hayNoLeidas && (
              <button
                type="button"
                onClick={handleMarcarTodas}
                className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Marcar todas
              </button>
            )}
          </div>

          {/* Lista */}
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                <BellOff className="h-6 w-6 text-muted-foreground/50" strokeWidth={1.5} />
                <p className="text-xs text-muted-foreground">No tenés notificaciones</p>
              </div>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleItemClick(n)}
                  className={`flex w-full flex-col items-start gap-0.5 border-b border-border/50 px-4 py-3 text-left transition-colors last:border-0 hover:bg-muted/40 ${
                    n.leida ? "" : "bg-[#1a1866]/5"
                  } ${n.link ? "cursor-pointer" : "cursor-default"}`}
                >
                  <div className="flex w-full items-start gap-2">
                    {!n.leida && (
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#f5eb4a]" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-[13px] ${n.leida ? "font-medium text-foreground" : "font-semibold text-foreground"}`}>
                        {n.titulo}
                      </p>
                      {n.mensaje && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.mensaje}</p>
                      )}
                      <p className="mt-1 text-[10px] text-muted-foreground/70">{tiempoRelativo(n.created_at)}</p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
