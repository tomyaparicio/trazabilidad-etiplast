"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Printer, RefreshCw } from "lucide-react"
import type { OrderPrefill } from "@/lib/voice/types"
import { OrdenFormVista } from "../_components/orden-form-dialog"
import { ElegirMaquina, type MaquinaElegida } from "../_components/elegir-maquina"

/**
 * Alta de orden de trabajo (página completa, no diálogo).
 *
 * Paso 0: elegir la impresora. El formulario cambia según la marca, así que
 * primero se pregunta la máquina y recién después se muestra el resto.
 *
 * El prefill del agente de voz viaja por sessionStorage (lo deja ordenes-table
 * antes de navegar acá) y se consume una sola vez; igual se pregunta la máquina.
 */
export default function NuevaOrdenPage() {
  const router = useRouter()
  const [prefill, setPrefill] = useState<OrderPrefill | null>(null)
  const [listo, setListo] = useState(false)
  const [maquina, setMaquina] = useState<MaquinaElegida | null>(null)
  const [eligiendo, setEligiendo] = useState(true)

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

  return (
    <>
      {eligiendo && (
        <ElegirMaquina
          actual={maquina}
          onElegir={(m) => {
            setMaquina(m)
            setEligiendo(false)
          }}
          onCancelar={() => {
            // Si ya había una elegida, «volver» es seguir con el formulario
            // (que sigue montado abajo, con todo lo cargado intacto).
            if (maquina) setEligiendo(false)
            else router.push("/ordenes")
          }}
        />
      )}

      {/* El formulario se monta recién cuando hay máquina, y a partir de ahí NO
          se desmonta: al tocar «Cambiar máquina» sólo se esconde, así no se
          pierde nada de lo ya cargado. */}
      {maquina && (
        <div className={eligiendo ? "hidden" : undefined}>
          <div className="bg-brand-strong sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b-2 border-gold/40 px-5 py-3 text-white sm:px-8 lg:px-10">
            {/* `text-brand-yellow` y no `text-gold`: esta barra es
                `bg-brand-strong` (`--primary-700`, #1d206b), definido fuera de
                los bloques de tema, así que es azul oscuro en claro Y en
                oscuro. `text-gold` resuelve `--gold-text`, oliva (#8a7200) en
                tema claro, y daría 3,05:1 sobre este azul. `--etiplast-500`
                (#f5eb4a) da 11,46:1 y no cambia con el tema. */}
            <p className="flex items-center gap-2.5 text-[15px] font-extrabold">
              <Printer className="h-5 w-5 shrink-0 text-brand-yellow" strokeWidth={2.4} />
              Se imprime en
              <span className="text-[19px] font-extrabold text-brand-yellow">{maquina.label}</span>
            </p>
            <button
              type="button"
              onClick={() => setEligiendo(true)}
              className="inline-flex h-11 items-center gap-2 rounded-xl border-[1.5px] border-white/35 px-4 text-[14.5px] font-extrabold text-white transition-colors hover:bg-white/10"
            >
              <RefreshCw className="h-[17px] w-[17px]" strokeWidth={2.4} />
              Cambiar máquina
            </button>
          </div>

          <OrdenFormVista
            prefill={prefill}
            impresionMaquina={maquina.valor}
            onDone={() => router.push("/ordenes")}
          />
        </div>
      )}
    </>
  )
}
