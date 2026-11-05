"use client"

/**
 * El escaneo, paso a paso: qué orden es → qué paso → listo.
 *
 * Sólo IMPRESIÓN pregunta en qué máquina: Venus, ReinaFlex, Taurus y la
 * Autoadhesiva hacen cosas distintas. En extrusión y troquelado las máquinas
 * son intercambiables, así que se confirma y listo — un toque menos.
 *
 * Pensada para un celular en la planta, con las manos ocupadas: texto grande,
 * negrita, mucho contraste y botones que se aciertan sin apuntar.
 */
import { api } from "@/lib/api/client"
import {
  ETAPAS_CON_MAQUINA,
  type EtapaProduccion, type Maquina, type OrdenTrabajo,
} from "@/lib/api/types"
import { AlertTriangle, Check, Loader2 } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"

const ETAPAS: { valor: EtapaProduccion; label: string }[] = [
  { valor: "extrusion",  label: "Extrusión"  },
  { valor: "impresion",  label: "Impresión"  },
  { valor: "troquelado", label: "Troquelado" },
]

const etiqueta = (e: EtapaProduccion) => ETAPAS.find((x) => x.valor === e)?.label ?? e
const eligeMaquina = (e: EtapaProduccion) => ETAPAS_CON_MAQUINA.includes(e)

/**
 * Si esa etapa ya se escaneó, devuelve quién y cuándo. Si no, null.
 *
 * Sale de los campos que el escaneo llena en la orden (`fecha_*`, `operador_*`),
 * los mismos que salen impresos en la ficha.
 */
function yaEscaneada(orden: OrdenTrabajo, etapa: EtapaProduccion): string | null {
  const fecha = orden[`fecha_${etapa}` as keyof OrdenTrabajo] as string | null
  if (!fecha) return null
  const quien = orden[`operador_${etapa}` as keyof OrdenTrabajo] as string | null
  const cuando = new Date(fecha + "T00:00:00").toLocaleDateString("es-AR")
  return quien ? `${quien}, ${cuando}` : cuando
}

interface Props {
  ordenId: number
  etapaInicial: EtapaProduccion | null
}

export function EscanearCliente({ ordenId, etapaInicial }: Props) {
  const [orden, setOrden]         = useState<OrdenTrabajo | null>(null)
  const [maquinas, setMaquinas]   = useState<Maquina[]>([])
  const [etapa, setEtapa]         = useState<EtapaProduccion | null>(etapaInicial)
  const [cargando, setCargando]   = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [listo, setListo]         = useState<{ maquina: string | null; etapa: string } | null>(null)

  useEffect(() => {
    let vivo = true
    Promise.all([api.ordenes.get(ordenId), api.maquinas.list()])
      .then(([o, m]) => {
        if (!vivo) return
        setOrden(o)
        setMaquinas(m)
      })
      .catch((e) => vivo && setError(e instanceof Error ? e.message : "No se pudo abrir la orden"))
      .finally(() => vivo && setCargando(false))
    return () => { vivo = false }
  }, [ordenId])

  const registrar = useCallback(async (maquina: Maquina | null) => {
    if (!etapa) return
    setGuardando(true)
    setError(null)
    try {
      const r = await api.ordenes.escanearEtapa(ordenId, {
        etapa,
        ...(maquina ? { maquina_id: maquina.id } : {}),
      })
      setListo({ maquina: r.maquina?.nombre ?? null, etapa: etiqueta(r.etapa) })
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar el escaneo")
    } finally {
      setGuardando(false)
    }
  }, [etapa, ordenId])

  /**
   * Las etapas que se pueden escanear ahora.
   *
   * Las que no eligen máquina están siempre: no dependen del catálogo. La que
   * sí (impresión) aparece solamente si hay alguna impresora cargada.
   */
  const etapasDisponibles = useMemo(
    () => ETAPAS.filter((e) =>
      !eligeMaquina(e.valor) ||
      maquinas.some((m) => (m.tipo ?? "").toLowerCase() === e.valor),
    ),
    [maquinas],
  )

  /* ── Pantallas completas ─────────────────────────────────────────────── */

  if (cargando) {
    return (
      <Pantalla>
        <Loader2 className="h-14 w-14 animate-spin text-brand" />
        <p className="text-xl font-bold text-foreground">Abriendo la orden…</p>
      </Pantalla>
    )
  }

  if (!orden) {
    return (
      <Pantalla>
        <AlertTriangle className="h-16 w-16 text-red-600" />
        <p className="text-2xl font-extrabold text-foreground">No se encontró la orden</p>
        <p className="max-w-sm text-center text-lg font-semibold text-muted-foreground">
          {error ?? "Revisá que el QR sea de una orden que todavía existe."}
        </p>
      </Pantalla>
    )
  }

  if (listo) {
    return (
      <Pantalla>
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-emerald-500/15 ring-4 ring-emerald-500">
          <Check className="h-14 w-14 text-emerald-600" strokeWidth={3} />
        </div>
        <p className="text-3xl font-extrabold text-foreground">Registrado</p>
        <p className="text-center text-xl font-bold text-foreground">
          {orden.numero} · {listo.etapa}
          {listo.maquina && <><br /><span className="text-brand">{listo.maquina}</span></>}
        </p>
        <p className="text-lg font-semibold text-muted-foreground">Ya podés arrancar.</p>
      </Pantalla>
    )
  }

  const impresoras = etapa
    ? maquinas.filter((m) => (m.tipo ?? "").toLowerCase() === etapa)
    : []

  return (
    <div className="min-h-dvh bg-background px-5 py-7">
      <div className="mx-auto flex max-w-xl flex-col gap-7">

        {/* Qué trabajo es. Primero el producto: es lo que mira el operario. */}
        <header className="rounded-2xl border-2 border-border bg-card p-5">
          <p className="text-sm font-extrabold uppercase tracking-[0.2em] text-muted-foreground">
            Orden {orden.numero}
          </p>
          <p className="mt-1 text-3xl font-extrabold leading-tight text-foreground">
            {orden.producto_nombre ?? "Sin producto cargado"}
          </p>
          <p className="mt-1 text-xl font-bold text-foreground">{orden.cliente_nombre}</p>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-base font-semibold text-muted-foreground">
            {orden.cantidad != null && <span>{orden.cantidad.toLocaleString("es-AR")} etiquetas</span>}
            {orden.lote && <span className="font-mono">{orden.lote}</span>}
          </div>
        </header>

        {error && (
          <p className="rounded-xl border-2 border-red-500 bg-red-500/10 px-4 py-3 text-lg font-bold text-red-700 dark:text-red-400">
            {error}
          </p>
        )}

        {!etapa ? (
          <section className="flex flex-col gap-4">
            <h2 className="text-2xl font-extrabold text-foreground">¿Qué vas a hacer?</h2>
            {etapasDisponibles.map((e) => {
              // Un solo QR para toda la orden, así que la pantalla tiene que
              // decir qué pasos ya pasaron: si no, el que llega al final no
              // sabe si lo suyo ya lo hizo otro.
              const hecha = yaEscaneada(orden, e.valor)
              return (
                <button
                  key={e.valor}
                  type="button"
                  onClick={() => setEtapa(e.valor)}
                  className="rounded-2xl border-2 border-border bg-card px-6 py-6 text-left transition active:scale-[0.98] hover:border-brand"
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="text-2xl font-extrabold text-foreground">{e.label}</span>
                    {hecha && <Check className="h-7 w-7 shrink-0 text-emerald-600" strokeWidth={3} />}
                  </span>
                  {hecha && (
                    <span className="mt-1 block text-base font-semibold text-muted-foreground">
                      Ya escaneada · {hecha}
                    </span>
                  )}
                </button>
              )
            })}
          </section>
        ) : (
          <section className="flex flex-col gap-4">
            <h2 className="text-2xl font-extrabold text-foreground">
              {eligeMaquina(etapa) ? `${etiqueta(etapa)} · ¿en qué máquina?` : etiqueta(etapa)}
            </h2>

            {/* El aviso va acá y no sólo en la lista de pasos: si dos operarios
                escanean lo mismo, el segundo tiene que enterarse. No se
                bloquea — a veces se vuelve a pasar y es legítimo —, se avisa. */}
            {yaEscaneada(orden, etapa) && (
              <p className="rounded-xl border-2 border-amber-500 bg-amber-500/10 px-4 py-3 text-lg font-bold text-amber-700 dark:text-amber-400">
                Esta etapa ya la escanearon: {yaEscaneada(orden, etapa)}. Si
                volvés a escanear, queda registrado tu paso también.
              </p>
            )}

            {eligeMaquina(etapa) ? (
              impresoras.length === 0 ? (
                <p className="rounded-xl border-2 border-amber-500 bg-amber-500/10 px-4 py-4 text-lg font-bold text-amber-700 dark:text-amber-400">
                  No hay máquinas de {etiqueta(etapa).toLowerCase()} cargadas. Hay
                  que darlas de alta en Administración antes de poder escanear.
                </p>
              ) : (
                impresoras.map((m) => (
                  <BotonGrande
                    key={m.id}
                    texto={m.nombre}
                    cargando={guardando}
                    onClick={() => registrar(m)}
                  />
                ))
              )
            ) : (
              <>
                {/* Sin elección de máquina: un solo botón y afuera. */}
                <p className="text-lg font-semibold text-muted-foreground">
                  Esta etapa no elige máquina. Confirmá y arrancá.
                </p>
                <BotonGrande
                  texto={`Empezar ${etiqueta(etapa).toLowerCase()}`}
                  cargando={guardando}
                  onClick={() => registrar(null)}
                />
              </>
            )}

            {!etapaInicial && (
              <button
                type="button"
                onClick={() => setEtapa(null)}
                className="self-start text-lg font-bold text-muted-foreground underline"
              >
                Cambiar de paso
              </button>
            )}
          </section>
        )}
      </div>
    </div>
  )
}

function BotonGrande(
  { texto, cargando, onClick }: { texto: string; cargando: boolean; onClick: () => void },
) {
  return (
    <button
      type="button"
      disabled={cargando}
      onClick={onClick}
      className="flex items-center justify-between gap-4 rounded-2xl border-2 border-border bg-card px-6 py-7 text-left text-2xl font-extrabold text-foreground transition active:scale-[0.98] hover:border-brand disabled:opacity-50"
    >
      {texto}
      {cargando && <Loader2 className="h-7 w-7 animate-spin text-brand" />}
    </button>
  )
}

function Pantalla({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-background px-6">
      {children}
    </div>
  )
}
