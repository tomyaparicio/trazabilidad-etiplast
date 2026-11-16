"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import type { OrderPrefill } from "@/lib/voice/types"
import { OrdenFormVista } from "../_components/orden-form-dialog"

/**
 * Alta de orden de trabajo (página completa, no diálogo).
 *
 * LA IMPRESORA YA NO SE PREGUNTA ACÁ. Antes esta página tenía un paso 0 que
 * abría el selector de máquina ANTES del formulario, justificado en que «el
 * formulario cambia según la marca». No cambiaba: la máquina se usaba sólo
 * para el payload, un campo de sólo lectura y el resumen.
 *
 * Ahora la decide el producto, adentro del formulario. Si el producto tiene
 * impresora guardada se toma esa y no se pregunta nada; si no la tiene, se
 * abre el selector en ese momento y lo elegido queda grabado en la ficha del
 * producto al guardar la orden. Así el dato que se perdió al borrar máquinas
 * del catálogo —la FK es `ON DELETE SET NULL` y no había backup— se repuebla
 * trabajando, sin planilla y sin script que adivine.
 *
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
