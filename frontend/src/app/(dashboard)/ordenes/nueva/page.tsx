"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import type { OrderPrefill } from "@/lib/voice/types"
import { OrdenFormVista } from "../_components/orden-form-dialog"

/**
 * Alta de orden de trabajo (página completa, no diálogo).
 * El prefill del agente de voz viaja por sessionStorage (lo deja ordenes-table
 * antes de navegar acá) y se consume una sola vez.
 */
export default function NuevaOrdenPage() {
  const router = useRouter()
  const [prefill, setPrefill] = useState<OrderPrefill | null>(null)
  const [listo, setListo] = useState(false)

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("eti:orden-prefill")
      if (raw) {
        setPrefill(JSON.parse(raw) as OrderPrefill)
        sessionStorage.removeItem("eti:orden-prefill")
      }
    } catch {
      /* prefill corrupto → alta vacía */
    }
    setListo(true)
  }, [])

  if (!listo) return null

  return <OrdenFormVista prefill={prefill} onDone={() => router.push("/ordenes")} />
}
