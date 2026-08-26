"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { PageContainer } from "@/components/ui/page-container"
import { api } from "@/lib/api"
import type { Maquina } from "@/lib/api/types"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/ui/page-header"
import { Select } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  AlertTriangle, CalendarRange, ChevronLeft, ChevronRight, Layers, Plus, Printer, RefreshCw, Scissors,
  type LucideIcon,
} from "lucide-react"
import { PlanDialog, type PlanRow } from "./_components/plan-dialog"

// ─── Helpers de fechas (sin libs) ──────────────────────────────────────────

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function parseISO(s: string): Date {
  const [y, m, d] = s.split("-").map(Number)
  return new Date(y, m - 1, d)
}

/** Lunes de la semana que contiene `d` */
function lunesDe(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}

function sumarDias(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

function diffDias(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86_400_000)
}

const DIAS_LABEL = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]

// ─── Configuración visual por etapa / tipo de máquina ──────────────────────

const GRUPOS: { tipo: string; label: string; icon: LucideIcon }[] = [
  { tipo: "extrusion",  label: "Extrusión",  icon: Layers   },
  { tipo: "impresion",  label: "Impresión",  icon: Printer  },
  { tipo: "troquelado", label: "Troquelado", icon: Scissors },
]

const COLOR_ETAPA: Record<string, string> = {
  extrusion:  "bg-cyan-500/15 border-cyan-500/40 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-500/25",
  impresion:  "bg-violet-500/15 border-violet-500/40 text-violet-700 dark:text-violet-300 hover:bg-violet-500/25",
  troquelado: "bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/25",
}

const ESTADO_LABEL: Record<string, string> = {
  planificada: "Planificada",
  en_curso:    "En curso",
  terminada:   "Terminada",
  cancelada:   "Cancelada",
}

const ETAPAS_FILTRO = [
  { value: "",           label: "Todas las etapas" },
  { value: "extrusion",  label: "Extrusión"  },
  { value: "impresion",  label: "Impresión"  },
  { value: "troquelado", label: "Troquelado" },
]

// ─── Posicionamiento de bloques en la semana ───────────────────────────────

type BloquePosicionado = {
  plan: PlanRow
  colInicio: number   // 0..6
  colFin: number      // 0..6
  carril: number      // fila dentro de la máquina (solapes apilados)
}

/** Recorta los planes a la semana visible y los apila en carriles si se solapan */
function posicionarBloques(planes: PlanRow[], lunes: Date): BloquePosicionado[] {
  const bloques: Omit<BloquePosicionado, "carril">[] = []
  for (const plan of planes) {
    if (!plan.fecha_inicio) continue
    const inicio = diffDias(parseISO(plan.fecha_inicio), lunes)
    const fin = diffDias(parseISO(plan.fecha_fin ?? plan.fecha_inicio), lunes)
    if (fin < 0 || inicio > 6) continue
    bloques.push({ plan, colInicio: Math.max(0, inicio), colFin: Math.min(6, fin) })
  }
  bloques.sort((a, b) => a.colInicio - b.colInicio || (a.plan.orden_prioridad ?? 0) - (b.plan.orden_prioridad ?? 0))

  const carriles: BloquePosicionado[][] = []
  const resultado: BloquePosicionado[] = []
  for (const b of bloques) {
    let carril = carriles.findIndex((c) => c.every((o) => o.colFin < b.colInicio || o.colInicio > b.colFin))
    if (carril === -1) {
      carril = carriles.length
      carriles.push([])
    }
    const posicionado = { ...b, carril }
    carriles[carril].push(posicionado)
    resultado.push(posicionado)
  }
  return resultado
}

// ─── Página ────────────────────────────────────────────────────────────────

export default function PlanificacionPage() {
  const [lunes, setLunes] = useState<Date>(() => lunesDe(new Date()))
  const [maquinas, setMaquinas] = useState<Maquina[]>([])
  const [maquinasLoading, setMaquinasLoading] = useState(true)
  const [maquinasError, setMaquinasError] = useState(false)
  const [planes, setPlanes] = useState<PlanRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [filtroEtapa, setFiltroEtapa] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [planEditando, setPlanEditando] = useState<PlanRow | null>(null)

  const desde = toISO(lunes)
  const hasta = toISO(sumarDias(lunes, 6))
  const hoyISO = toISO(new Date())

  const cargarMaquinas = useCallback(async () => {
    setMaquinasLoading(true)
    setMaquinasError(false)
    try {
      setMaquinas(await api.maquinas.list())
    } catch {
      setMaquinasError(true)
    } finally {
      setMaquinasLoading(false)
    }
  }, [])

  useEffect(() => {
    cargarMaquinas()
  }, [cargarMaquinas])

  const cargarPlanes = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const data = await api.planificacion.list({
        desde,
        hasta,
        etapa: filtroEtapa || undefined,
      })
      setPlanes(data as PlanRow[])
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [desde, hasta, filtroEtapa])

  useEffect(() => {
    cargarPlanes()
  }, [cargarPlanes])

  // Gate único de carga/error: la grilla necesita máquinas Y planes para
  // renderizar algo con sentido, así que ambos fetch comparten un solo estado
  // visual (evita el flash de "no hay máquinas" mientras todavía cargan).
  const cargando = loading || maquinasLoading
  const huboError = error || maquinasError
  const reintentar = () => { cargarMaquinas(); cargarPlanes() }

  const dias = useMemo(() => Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i)), [lunes])

  const grupos = useMemo(() => {
    const visibles = filtroEtapa ? GRUPOS.filter((g) => g.tipo === filtroEtapa) : GRUPOS
    return visibles
      .map((g) => ({ ...g, maquinas: maquinas.filter((m) => m.tipo === g.tipo) }))
      .filter((g) => g.maquinas.length > 0)
  }, [maquinas, filtroEtapa])

  const planesPorMaquina = useMemo(() => {
    const mapa = new Map<number, BloquePosicionado[]>()
    for (const m of maquinas) {
      mapa.set(m.id, posicionarBloques(planes.filter((p) => p.maquina_id === m.id), lunes))
    }
    return mapa
  }, [planes, maquinas, lunes])

  const abrirCrear = () => { setPlanEditando(null); setDialogOpen(true) }
  const abrirEditar = (plan: PlanRow) => { setPlanEditando(plan); setDialogOpen(true) }

  const rangoLabel = `${lunes.toLocaleDateString("es-AR", { day: "numeric", month: "short" })} – ${sumarDias(lunes, 6).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" })}`

  return (
    <PageContainer>
      {/* ── Header ── */}
      <PageHeader
        icon={CalendarRange}
        title="Planificación"
        subtitle="Planificación de producción por máquina y etapa"
        actions={
          <Button onClick={abrirCrear} className="bg-brand hover:bg-brand-strong text-white gap-1.5">
            <Plus className="w-4 h-4" /> Planificar OT
          </Button>
        }
      />

      {/* ── Toolbar: navegación de semana + filtro ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setLunes(sumarDias(lunes, -7))} aria-label="Semana anterior">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" className="h-8" onClick={() => setLunes(lunesDe(new Date()))}>
            Hoy
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setLunes(sumarDias(lunes, 7))} aria-label="Semana siguiente">
            <ChevronRight className="w-4 h-4" />
          </Button>
          <span className="text-sm font-medium text-foreground ml-2 capitalize">{rangoLabel}</span>
        </div>
        <div className="w-48 shrink-0">
          <Select
            value={filtroEtapa}
            onChange={(e) => setFiltroEtapa(e.target.value)}
            aria-label="Filtrar por etapa"
            className="h-8 text-sm"
          >
            {ETAPAS_FILTRO.map((e) => (
              <option key={e.value} value={e.value}>{e.label}</option>
            ))}
          </Select>
        </div>
      </div>

      {/* ── Grilla semanal ── */}
      <TooltipProvider delayDuration={200}>
        <div className="bg-card/80 border border-border rounded-2xl overflow-x-auto">
          <div className="min-w-[860px]">
            {/* Header de días */}
            <div className="grid grid-cols-[170px_repeat(7,minmax(0,1fr))] border-b border-border">
              <div className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Máquina
              </div>
              {dias.map((d, i) => {
                const esHoy = toISO(d) === hoyISO
                return (
                  <div
                    key={i}
                    className={`px-2 py-2.5 text-center border-l border-border/60 ${esHoy ? "bg-brand/5" : ""}`}
                  >
                    <p className={`text-[11px] font-semibold uppercase tracking-wider ${esHoy ? "text-brand dark:text-blue-400" : "text-muted-foreground"}`}>
                      {DIAS_LABEL[i]}
                    </p>
                    <p className={`text-sm font-medium ${esHoy ? "text-brand dark:text-blue-400" : "text-foreground"}`}>
                      {d.getDate()}
                    </p>
                  </div>
                )
              })}
            </div>

            {cargando ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full bg-muted rounded-lg" />
                ))}
              </div>
            ) : huboError ? (
              <div className="p-10 flex flex-col items-center justify-center gap-3 text-center">
                <div className="rounded-2xl border border-destructive/20 bg-destructive/10 p-4 text-destructive">
                  <AlertTriangle className="w-6 h-6" strokeWidth={1.5} />
                </div>
                <p className="text-sm font-medium text-foreground">No se pudo cargar la planificación</p>
                <p className="max-w-sm text-xs text-muted-foreground">
                  Puede ser un problema de conexión o que el servidor esté iniciando. Intentá de nuevo.
                </p>
                <Button onClick={reintentar} variant="outline" size="sm" className="mt-1 gap-2">
                  <RefreshCw className="w-3.5 h-3.5" />
                  Reintentar
                </Button>
              </div>
            ) : grupos.length === 0 ? (
              <div className="p-10 flex flex-col items-center justify-center text-center">
                <CalendarRange className="w-8 h-8 text-muted-foreground mb-3" strokeWidth={1.5} />
                <p className="text-sm text-muted-foreground">
                  No hay máquinas cargadas{filtroEtapa ? " para esta etapa" : ""}. Cargalas desde Administración → Máquinas.
                </p>
              </div>
            ) : (
              grupos.map((grupo) => (
                <div key={grupo.tipo}>
                  {/* Header de grupo */}
                  <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 border-b border-border/60">
                    <grupo.icon className="w-3.5 h-3.5 text-brand dark:text-blue-400" />
                    <span className="text-[11px] font-bold uppercase tracking-widest text-brand dark:text-blue-400">
                      {grupo.label}
                    </span>
                  </div>

                  {/* Filas de máquinas */}
                  {grupo.maquinas.map((maquina) => {
                    const bloques = planesPorMaquina.get(maquina.id) ?? []
                    const carriles = Math.max(1, ...bloques.map((b) => b.carril + 1))
                    return (
                      <div
                        key={maquina.id}
                        className="grid grid-cols-[170px_repeat(7,minmax(0,1fr))] border-b border-border/60 last:border-b-0"
                        style={{ gridTemplateRows: `repeat(${carriles}, minmax(2.75rem, auto))` }}
                      >
                        {/* Nombre de máquina (abarca todos los carriles) */}
                        <div
                          className="px-4 flex items-center text-sm font-medium text-foreground"
                          style={{ gridRow: `1 / ${carriles + 1}`, gridColumn: 1 }}
                        >
                          {maquina.nombre}
                        </div>

                        {/* Celdas de fondo (líneas de día) */}
                        {Array.from({ length: carriles }).map((_, fila) =>
                          dias.map((d, col) => (
                            <div
                              key={`${fila}-${col}`}
                              className={`border-l border-border/40 ${toISO(d) === hoyISO ? "bg-brand/5" : ""}`}
                              style={{ gridRow: fila + 1, gridColumn: col + 2 }}
                            />
                          ))
                        )}

                        {/* Bloques de plan */}
                        {bloques.map((b) => {
                          const estiloEstado =
                            b.plan.estado === "cancelada" ? "opacity-50 line-through" :
                            b.plan.estado === "terminada" ? "opacity-70" : ""
                          return (
                            <Tooltip key={b.plan.id}>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  onClick={() => abrirEditar(b.plan)}
                                  className={`z-10 m-1 px-2 py-1 rounded-lg border text-left text-xs font-medium truncate transition-colors cursor-pointer ${COLOR_ETAPA[b.plan.etapa] ?? "bg-muted border-border text-foreground"} ${estiloEstado}`}
                                  style={{ gridRow: b.carril + 1, gridColumn: `${b.colInicio + 2} / ${b.colFin + 3}` }}
                                >
                                  <span className="font-semibold">{b.plan.orden_numero ?? `#${b.plan.orden_trabajo_id}`}</span>
                                  {(b.plan.cliente_marca ?? b.plan.cliente_nombre) && (
                                    <span className="opacity-80"> · {b.plan.cliente_marca ?? b.plan.cliente_nombre}</span>
                                  )}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs">
                                <p className="font-semibold">
                                  {b.plan.orden_numero} — {b.plan.cliente_marca ?? b.plan.cliente_nombre ?? "sin cliente"}
                                </p>
                                <p className="opacity-80">
                                  {ESTADO_LABEL[b.plan.estado] ?? b.plan.estado} · {b.plan.fecha_inicio}
                                  {b.plan.fecha_fin && b.plan.fecha_fin !== b.plan.fecha_inicio ? ` → ${b.plan.fecha_fin}` : ""}
                                </p>
                                {b.plan.notas && <p className="mt-1 opacity-90">{b.plan.notas}</p>}
                              </TooltipContent>
                            </Tooltip>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      </TooltipProvider>

      {/* ── Referencias de color ── */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-cyan-500/30 border border-cyan-500/50" /> Extrusión
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-violet-500/30 border border-violet-500/50" /> Impresión
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-amber-500/30 border border-amber-500/50" /> Troquelado
        </span>
      </div>

      <PlanDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSaved={cargarPlanes}
        maquinas={maquinas}
        plan={planEditando}
        fechaSugerida={desde}
      />
    </PageContainer>
  )
}
