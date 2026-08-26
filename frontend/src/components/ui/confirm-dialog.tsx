"use client"

import { useState, type ReactNode } from "react"
import { toast } from "sonner"
import { Loader2, TriangleAlert } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** Estilo del botón de confirmar (default: destructive). */
  variant?: "destructive" | "default"
  /**
   * Acción a ejecutar al confirmar. Puede ser async.
   * Convención: LANZÁ el error para que el diálogo lo muestre (toast.error) y
   * quede abierto. Si resuelve OK, el diálogo se cierra solo. Mostrá el
   * toast.success dentro de la acción tras el éxito.
   */
  onConfirm: () => void | Promise<void>
}

/**
 * Diálogo de confirmación reutilizable (estilo AlertDialog) construido sobre el
 * `Dialog` existente. Reemplaza `window.confirm` en todo el ERP.
 *
 * - Previene doble-submit: deshabilita el botón mientras corre la acción.
 * - Spinner en el botón de confirmar mientras la request está en curso.
 * - Cierra al éxito; si `onConfirm` lanza, muestra el error y queda abierto.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  variant = "destructive",
  onConfirm,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false)

  async function handleConfirm() {
    if (busy) return
    setBusy(true)
    try {
      await onConfirm()
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Ocurrió un error")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o) }}>
      <DialogContent
        showCloseButton={false}
        className="max-w-md rounded-2xl"
        onEscapeKeyDown={(e) => { if (busy) e.preventDefault() }}
      >
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div
              className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border ${
                variant === "destructive"
                  ? "border-destructive/20 bg-destructive/10 text-destructive"
                  : "border-gold/25 bg-gold/10 text-gold"
              }`}
            >
              <TriangleAlert className="size-[18px]" strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <DialogTitle>{title}</DialogTitle>
              {description && (
                <DialogDescription className="mt-1.5">{description}</DialogDescription>
              )}
            </div>
          </div>
        </DialogHeader>
        <DialogFooter className="mt-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={variant === "destructive" ? "destructive" : "default"}
            onClick={handleConfirm}
            disabled={busy}
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
