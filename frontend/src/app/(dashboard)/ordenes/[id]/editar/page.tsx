"use client"

import { useCallback, useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { AlertCircle, ArrowLeft, Loader2, RefreshCw } from "lucide-react"
import { api } from "@/lib/api"
import type { OrdenTrabajo } from "@/lib/api/types"
import { Button } from "@/components/ui/button"
import { OrdenFormVista } from "../../_components/orden-form-dialog"

/** Edición de orden de trabajo (página completa, no diálogo). */
export default function EditarOrdenPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const id = Number(params.id)

  const [orden, setOrden] = useState<OrdenTrabajo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const fetchOrden = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      setOrden(await api.ordenes.get(id))
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar la orden")
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { fetchOrden() }, [fetchOrden])

  const volver = () => router.push("/ordenes")

  if (loading) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !orden) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="rounded-2xl border border-destructive/20 bg-destructive/10 p-4 text-destructive">
          <AlertCircle className="h-7 w-7" strokeWidth={1.5} />
        </div>
        <p className="text-sm font-medium text-foreground">{error || "Orden no encontrada"}</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={volver} className="gap-1.5">
            <ArrowLeft className="h-3.5 w-3.5" /> Volver
          </Button>
          <Button variant="outline" size="sm" onClick={fetchOrden} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Reintentar
          </Button>
        </div>
      </div>
    )
  }

  return <OrdenFormVista orden={orden} onDone={volver} />
}
