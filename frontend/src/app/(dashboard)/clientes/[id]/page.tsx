"use client"

import { useCallback, useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { AlertCircle, ArrowLeft, Loader2, RefreshCw } from "lucide-react"
import { api } from "@/lib/api"
import type { Cliente } from "@/types/database"
import { Button } from "@/components/ui/button"
import { ClienteDetalle } from "../_components/cliente-detail-dialog"

/**
 * Vista de detalle de cliente (página completa, no diálogo).
 * Carga el cliente client-side (sin SSR bloqueante) y muestra la ficha.
 */
export default function ClienteDetallePage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const id = Number(params.id)

  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const fetchCliente = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      setCliente(await api.clientes.get(id))
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el cliente")
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { fetchCliente() }, [fetchCliente])

  const goBack = () => router.push("/clientes")

  if (loading) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !cliente) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="rounded-2xl border border-destructive/20 bg-destructive/10 p-4 text-destructive">
          <AlertCircle className="h-7 w-7" strokeWidth={1.5} />
        </div>
        <p className="text-sm font-medium text-foreground">{error || "Cliente no encontrado"}</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={goBack} className="gap-1.5">
            <ArrowLeft className="h-3.5 w-3.5" /> Volver
          </Button>
          <Button variant="outline" size="sm" onClick={fetchCliente} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Reintentar
          </Button>
        </div>
      </div>
    )
  }

  return <ClienteDetalle cliente={cliente} onBack={goBack} onUpdate={setCliente} />
}
