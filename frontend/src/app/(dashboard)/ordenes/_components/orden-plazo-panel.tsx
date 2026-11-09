"use client"

/**
 * Plazo, verificación y retrabajo de una orden (RF-05 · RF-11 · RF-16).
 *
 * Los tres viven juntos porque son los tres hechos que el sistema registra
 * SOBRE la orden y no sobre su producción: qué se prometió, quién revisó lo
 * cargado, y si hubo que hacerla de nuevo. La ficha de abajo cuenta cómo se
 * fabricó; este panel cuenta cómo se cumplió.
 */

import { useState } from "react"
import { AlertTriangle, CheckCircle2, Loader2, RotateCcw, ShieldCheck, Undo2 } from "lucide-react"
import { toast } from "sonner"

import { api } from "@/lib/api"
import { fechaCorta } from "@/lib/fechas"
import type { OrdenTrabajo } from "@/lib/api/types"
import { Button } from "@/components/ui/button"

function mensaje(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback
}

export function OrdenPlazoPanel({
  orden,
  onCambio,
}: {
  orden: OrdenTrabajo
  /** Se llama después de verificar, desverificar o rehacer: la orden cambió. */
  onCambio?: () => void
}) {
  const [trabajando, setTrabajando] = useState(false)
  const [pidiendoMotivo, setPidiendoMotivo] = useState(false)
  const [motivo, setMotivo] = useState("")

  const cancelada = orden.estado === "cancelada"
  const verificada = !!orden.verificado_en

  async function correr(accion: () => Promise<unknown>, ok: string) {
    setTrabajando(true)
    try {
      await accion()
      toast.success(ok)
      onCambio?.()
    } catch (e) {
      toast.error(mensaje(e, "No se pudo completar la acción"))
    } finally {
      setTrabajando(false)
    }
  }

  async function confirmarRehacer() {
    const texto = motivo.trim()
    if (!texto) {
      toast.error("Hace falta el motivo: un rechazo sin motivo no se puede analizar después")
      return
    }
    await correr(
      () => api.ordenes.rehacer(orden.id, texto),
      "Orden marcada para rehacer. Se abrió el retrabajo.",
    )
    setPidiendoMotivo(false)
    setMotivo("")
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-muted/20 p-4">

      {/* ── El plazo pactado (RF-05) ── */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
          Comprometida con el cliente
        </p>
        <p className="text-[16px] font-bold text-foreground">
          {orden.fecha_comprometida ? (
            fechaCorta(orden.fecha_comprometida)
          ) : (
            <span className="text-[14px] font-semibold text-muted-foreground">
              Sin plazo cargado
            </span>
          )}
        </p>
      </div>

      {/* Cuando hay las dos fechas, la comparación es el dato: es exactamente
          lo que el indicador de cumplimiento mide, dicho para esta orden. */}
      {orden.fecha_comprometida && orden.fecha_entrega && (
        <p className="text-[14px] font-semibold text-foreground">
          Entregada el {fechaCorta(orden.fecha_entrega)} ·{" "}
          {orden.fecha_entrega <= orden.fecha_comprometida ? (
            <span className="text-emerald-700 dark:text-emerald-400">en término</span>
          ) : (
            <span className="text-amber-700 dark:text-amber-400">fuera de término</span>
          )}
        </p>
      )}

      {/* ── La verificación del responsable (RF-11) ── */}
      <div className="border-t border-border/60 pt-4">
        {verificada ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="inline-flex items-center gap-2 text-[15px] font-bold text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-4.5 w-4.5 shrink-0" strokeWidth={2.5} />
              Verificada por {orden.verificado_por_nombre ?? "—"} el{" "}
              {fechaCorta(orden.verificado_en)}
            </p>
            <Button
              size="sm" variant="outline" disabled={trabajando}
              onClick={() => correr(
                () => api.ordenes.desverificar(orden.id),
                "Se dio marcha atrás la verificación.",
              )}
              className="gap-1.5 text-xs"
            >
              {trabajando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
              Deshacer
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[14px] font-semibold text-muted-foreground">
              {orden.responsable_id
                ? "Sin verificar: el cierre está trabado hasta que el responsable revise las etapas cargadas."
                : "Sin verificar. La orden no tiene responsable asignado, así que el cierre no se traba — pero nadie revisó lo cargado."}
            </p>
            {!cancelada && (
              <Button
                size="sm" disabled={trabajando}
                onClick={() => correr(
                  () => api.ordenes.verificar(orden.id),
                  "Verificación registrada.",
                )}
                className="gap-1.5 text-xs"
              >
                {trabajando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                Verificar
              </Button>
            )}
          </div>
        )}
      </div>

      {/* ── El retrabajo (RF-16) ── */}
      <div className="border-t border-border/60 pt-4">
        {orden.rehacer ? (
          /* Esta orden FALLÓ. Su producción queda tal como está: lo que se ve
             abajo en la ficha es el registro de lo que se hizo, y el arreglo
             se produjo en otra orden. */
          <div className="rounded-lg border-2 border-amber-600/40 bg-amber-500/10 px-4 py-3">
            <p className="inline-flex items-center gap-2 text-[15px] font-bold text-foreground">
              <AlertTriangle className="h-4.5 w-4.5 shrink-0 text-amber-700 dark:text-amber-400" strokeWidth={2.5} />
              Marcada para rehacer
            </p>
            <p className="mt-1 text-[14px] font-semibold text-foreground">{orden.rehacer_motivo}</p>
            <p className="mt-1 text-[13px] font-semibold text-muted-foreground">
              {orden.rehacer_por_nombre ?? "—"} · {fechaCorta(orden.rehacer_en)}
            </p>
          </div>
        ) : orden.rehace_a_id ? (
          /* Esta orden ES el arreglo de otra. */
          <p className="text-[14px] font-semibold text-foreground">
            Rehace la orden{" "}
            <span className="font-mono font-bold">{orden.rehace_a_numero}</span>.
          </p>
        ) : pidiendoMotivo ? (
          <div className="space-y-3">
            <label className="block">
              <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                Por qué hay que rehacerla
              </span>
              <textarea
                autoFocus rows={2} value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ej: el cliente rechazó el lote, el color no coincide con la muestra."
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-[15px] font-medium outline-none focus:ring-1 focus:ring-ring"
              />
            </label>
            <p className="text-[13px] font-semibold text-muted-foreground">
              La producción de esta orden no se toca: se abre una orden nueva con
              la misma especificación, y el plazo se vuelve a pactar.
            </p>
            <div className="flex gap-2">
              <Button size="sm" disabled={trabajando} onClick={confirmarRehacer} className="gap-1.5 text-xs">
                {trabajando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                Marcar y abrir el retrabajo
              </Button>
              <Button
                size="sm" variant="outline" disabled={trabajando}
                onClick={() => { setPidiendoMotivo(false); setMotivo("") }}
                className="text-xs"
              >
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          !cancelada && (
            <Button
              size="sm" variant="outline"
              onClick={() => setPidiendoMotivo(true)}
              className="gap-1.5 text-xs"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Hay que rehacerla
            </Button>
          )
        )}
      </div>
    </div>
  )
}
