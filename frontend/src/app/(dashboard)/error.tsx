"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { AlertTriangle } from "lucide-react"

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 p-8">
      <div className="rounded-2xl bg-destructive/10 border border-destructive/20 p-5">
        <AlertTriangle className="w-10 h-10 text-destructive" strokeWidth={1.5} />
      </div>
      <div className="text-center space-y-2">
        <h2 className="text-xl font-semibold text-foreground">Algo salió mal</h2>
        <p className="text-sm text-muted-foreground max-w-sm">
          Ocurrió un error inesperado. Podés intentar recargar la sección.
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground/60 font-mono">ID: {error.digest}</p>
        )}
      </div>
      <Button
        onClick={reset}
        className="bg-[#1a1866] hover:bg-[#14115a] text-white rounded-xl px-6"
      >
        Reintentar
      </Button>
    </div>
  )
}
