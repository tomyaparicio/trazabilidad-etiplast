"use client"

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import type { Bobina, Cliente, ClienteProducto, EstadoOrden, OrdenTrabajo, UserAdmin } from "@/lib/api/types"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select } from "@/components/ui/select"
import {
  Loader2, Plus, Trash2, Search, ChevronDown, Check, Package, ChevronLeft, ChevronRight,
  ClipboardList, Layers, Printer, Scissors, PackageCheck, ShieldCheck, CalendarDays, Calculator, Factory,
  Building2, Flag, UserRound, Wrench,
  type LucideIcon,
  Boxes,
} from "lucide-react"
import type { OrderPrefill } from "@/lib/voice/types"

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Bobina con n° de lote (el tipo base aún no lo expone) */
type BobinaForm = Bobina & { numero_lote?: string | null }

const COLORES_PRESET = [
  "Negro", "Blanco", "Rojo", "Azul", "Amarillo", "Verde",
  "Naranja", "Violeta", "Cyan", "Magenta", "Dorado", "Plateado",
]

const ESTADOS_OT: { value: EstadoOrden; label: string }[] = [
  { value: "borrador",   label: "Borrador" },
  { value: "pendiente",  label: "Pendiente" },
  { value: "en_proceso", label: "En Proceso" },
  { value: "completada", label: "Completada" },
  { value: "cancelada",  label: "Cancelada" },
]

const STEPS: { id: number; label: string; icon: LucideIcon }[] = [
  { id: 1, label: "General",      icon: ClipboardList },
  { id: 2, label: "Extrusión",    icon: Layers        },
  { id: 3, label: "Impresión",    icon: Printer       },
  { id: 4, label: "Troquelado",   icon: Scissors      },
  { id: 5, label: "Finalización", icon: PackageCheck  },
]

function SubSection({ title, icon: Icon }: { title: string; icon?: LucideIcon }) {
  return (
    <div className="flex items-center gap-3 mb-4 mt-6 first:mt-0">
      {Icon && <Icon className="h-4 w-4 shrink-0 text-gold" strokeWidth={2.2} />}
      <h3 className="text-[12.5px] font-extrabold uppercase tracking-[0.16em] text-gold shrink-0">{title}</h3>
      <div className="flex-1 h-px bg-border" />
    </div>
  )
}

function Field({ label, icon: Icon, children, className = "" }: { label: string; icon?: LucideIcon; children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <label className="flex items-center gap-1.5 text-[12.5px] font-bold text-muted-foreground uppercase tracking-wider">
        {Icon && <Icon className="h-[15px] w-[15px] shrink-0 text-gold/90" strokeWidth={2.4} />}
        {label}
      </label>
      {children}
    </div>
  )
}

/** Bloque visual: agrupa campos relacionados en una tarjeta con título dorado. */
function Bloque({ title, icon: Icon, children, className = "" }: { title: string; icon: LucideIcon; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-border bg-secondary/30 p-5 ${className}`}>
      <div className="mb-4 flex items-center gap-2.5">
        <Icon className="h-4 w-4 shrink-0 text-gold" strokeWidth={2.2} />
        <h3 className="text-[12.5px] font-extrabold uppercase tracking-[0.16em] text-gold">{title}</h3>
      </div>
      {children}
    </section>
  )
}

// ─── Selector de marca ────────────────────────────────────────────────────

function ClienteSelector({ value, onSelect, initialName }: { value: number | null; onSelect: (c: Cliente) => void; initialName?: string }) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<Cliente[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [selectedName, setSelectedName] = useState<string>(initialName ?? "")
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (initialName) setSelectedName(initialName)
  }, [initialName])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await api.clientes.list({ search: query, per_page: 10 })
        setResults((res.data as Cliente[]) ?? [])
      } catch { setResults([]) }
      finally { setLoading(false) }
    }, 250)
    return () => clearTimeout(t)
  }, [query])

  const displayName = selectedName || (value ? `Cliente #${value}` : "")

  return (
    <div ref={ref} className="relative">
      <div
        className="flex items-center gap-2 border border-input rounded-lg px-3 h-9 cursor-pointer hover:border-foreground/40 transition-colors bg-background"
        onClick={() => setOpen((o) => !o)}
      >
        {value
          ? <span className="flex-1 text-sm font-medium truncate">{displayName}</span>
          : <span className="flex-1 text-sm text-muted-foreground">Seleccionar marca...</span>
        }
        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-card border border-border rounded-xl shadow-lg overflow-hidden">
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                autoFocus type="text" value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por marca o razón social..."
                className="w-full pl-8 pr-3 py-1.5 text-sm bg-background border border-input rounded-md outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>
          <div className="max-h-52 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground text-xs">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Buscando...
              </div>
            ) : results.length === 0 ? (
              <div className="text-center py-4 text-xs text-muted-foreground">
                {query ? "Sin resultados" : "Escribí para buscar"}
              </div>
            ) : (() => {
              const groups = results.reduce<Record<string, Cliente[]>>((acc, c) => {
                const key = c.razon_social || "__sin__"
                if (!acc[key]) acc[key] = []
                acc[key].push(c)
                return acc
              }, {})
              const multiGroup = Object.keys(groups).length > 1
              return Object.entries(groups).map(([rs, clientes]) => (
                <div key={rs}>
                  {multiGroup && rs !== "__sin__" && (
                    <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/30 border-b border-border">
                      {rs}
                    </div>
                  )}
                  {clientes.map((c) => (
                    <button key={c.id} type="button"
                      onClick={() => { onSelect(c); setSelectedName(c.marca || c.razon_social || `#${c.id}`); setOpen(false); setQuery("") }}
                      className={`w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-muted/60 transition-colors ${c.id === value ? "bg-primary/5" : ""}`}
                    >
                      {c.id === value && <Check className="w-3 h-3 text-primary shrink-0" />}
                      <div>
                        <p className="text-sm font-medium">{c.marca || c.razon_social}</p>
                        {c.productos?.length > 0 && (
                          <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                            {c.productos.length} producto{c.productos.length !== 1 ? "s" : ""}
                          </p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              ))
            })()}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Selector de producto ─────────────────────────────────────────────────

function ProductoSelector({ productos, value, onSelect }: {
  productos: ClienteProducto[]
  value: number | null
  onSelect: (p: ClienteProducto | null) => void
}) {
  if (productos.length === 0) return null
  return (
    <div className="flex items-center gap-2 border border-input rounded-lg px-3 h-9 bg-background">
      <Package className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      <select
        value={value ?? ""}
        onChange={(e) => {
          const id = parseInt(e.target.value)
          onSelect(isNaN(id) ? null : (productos.find((p) => p.id === id) ?? null))
        }}
        className="flex-1 text-sm bg-transparent outline-none"
      >
        <option value="">Sin producto específico</option>
        {productos.map((p) => {
          // Sin el envase: va en su propio select porque puede cambiar
          // respecto del que tiene cargado la presentación.
          const label = [p.nombre, p.volumen_cantidad != null ? `${p.volumen_cantidad}${p.volumen_unidad ?? ""}` : null, p.lamina].filter(Boolean).join(" · ")
          return <option key={p.id} value={p.id}>{label || `Producto #${p.id}`}</option>
        })}
      </select>
    </div>
  )
}

function EnvaseSelector({ catalogo, value, onChange }: {
  catalogo: string[]
  value: string
  onChange: (v: string) => void
}) {
  // Se conserva lo guardado aunque no esté en el catálogo: hay 4 envases en uso
  // que nunca se dieron de alta ("CONSULTAR", "Estin A"…), y sin esto abrir una
  // orden vieja se lo cambiaría solo.
  const fuera = value && !catalogo.includes(value)
  return (
    <div className="flex h-9 items-center gap-2 rounded-lg border border-input bg-background px-3">
      <Boxes className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 bg-transparent text-sm outline-none"
      >
        <option value="">Sin envase</option>
        {fuera && <option value={value}>{value} (fuera del catálogo)</option>}
        {catalogo.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
    </div>
  )
}

// ─── Estado inicial del formulario ─────────────────────────────────────────

function emptyForm() {
  return {
    cliente_id: 0 as number,
    cliente_producto_id: null as number | null,
    fecha: new Date().toISOString().split("T")[0],
    estado: "borrador" as EstadoOrden,
    responsable_id: null as number | null,
    operador: "",
    extrusion_ancho: null as number | null,
    extrusion_color: "Blanco",
    extrusion_trat: "Con",
    extrusion_espesor: 60 as number | null,
    extrusion_cant_bob: null as number | null,
    extrusion_formulacion: "2045/208",
    extrusion_maquina: "",
    extrusion_observaciones: "",
    operador_extrusion: "",
    bobinas: [{ metros: null, kg_bob: null, numero_lote: "" }] as BobinaForm[],
    impresion_frente: "",
    impresion_retroverso: "",
    impresion_observaciones: "",
    impresion_cilindro: null as number | null,
    impresion_colores: ["", "", "", "", "", ""],
    operador_impresion: "",
    troquelado_ancho: null as number | null,
    troquelado_alto: null as number | null,
    troquelado_envase: "",
    troquelado_maquina: "",
    troquelado_observaciones: "",
    operador_troquelado: "",
    control_calidad: "",
    fecha_diseno: "",
    fecha_preprensa: "",
    fecha_extrusion: "",
    fecha_impresion: "",
    fecha_troquelado: "",
    fecha_entrega: "",
    cantidad: null as number | null,
    total_final: null as number | null,
    observaciones: "",
  }
}

function ordenToForm(orden: OrdenTrabajo): ReturnType<typeof emptyForm> {
  const colores = [...(orden.impresion_colores ?? [])]
  while (colores.length < 6) colores.push("")
  const bobinas: BobinaForm[] = orden.bobinas && orden.bobinas.length > 0
    ? (orden.bobinas as BobinaForm[])
    : [{ metros: null, kg_bob: null, numero_lote: "" }]
  return {
    cliente_id: orden.cliente_id,
    cliente_producto_id: orden.cliente_producto_id,
    fecha: orden.fecha ?? new Date().toISOString().split("T")[0],
    estado: orden.estado,
    responsable_id: orden.responsable_id ?? null,
    operador: orden.operador ?? "",
    extrusion_ancho: orden.extrusion_ancho,
    extrusion_color: orden.extrusion_color ?? "Blanco",
    extrusion_trat: orden.extrusion_trat ?? "Con",
    extrusion_espesor: orden.extrusion_espesor ?? 60,
    extrusion_cant_bob: orden.extrusion_cant_bob,
    extrusion_formulacion: orden.extrusion_formulacion ?? "2045/208",
    extrusion_maquina: orden.extrusion_maquina ?? "",
    extrusion_observaciones: orden.extrusion_observaciones ?? "",
    operador_extrusion: orden.operador_extrusion ?? "",
    bobinas,
    impresion_frente: orden.impresion_frente ?? "",
    impresion_retroverso: orden.impresion_retroverso ?? "",
    impresion_observaciones: orden.impresion_observaciones ?? "",
    impresion_cilindro: orden.impresion_cilindro,
    impresion_colores: colores,
    operador_impresion: orden.operador_impresion ?? "",
    troquelado_ancho: orden.troquelado_ancho,
    troquelado_alto: orden.troquelado_alto,
    troquelado_envase: orden.troquelado_envase ?? "",
    troquelado_maquina: orden.troquelado_maquina ?? "",
    troquelado_observaciones: orden.troquelado_observaciones ?? "",
    operador_troquelado: orden.operador_troquelado ?? "",
    control_calidad: orden.control_calidad ?? "",
    fecha_diseno: orden.fecha_diseno ?? "",
    fecha_preprensa: orden.fecha_preprensa ?? "",
    fecha_extrusion: orden.fecha_extrusion ?? "",
    fecha_impresion: orden.fecha_impresion ?? "",
    fecha_troquelado: orden.fecha_troquelado ?? "",
    fecha_entrega: orden.fecha_entrega ?? "",
    cantidad: orden.cantidad,
    total_final: orden.total_final,
    observaciones: orden.observaciones ?? "",
  }
}

// ─── Componente principal ──────────────────────────────────────────────────

interface Props {
  /** Orden a editar (null/ausente = alta nueva). */
  orden?: OrdenTrabajo | null
  prefill?: OrderPrefill | null
  /** Volver al listado (saved=true si se guardó; el listado refresca al montar). */
  onDone: (saved?: boolean) => void
}

/** Vista de página completa del wizard de orden de trabajo (ya no es dialog). */
export function OrdenFormVista({ orden = null, prefill, onDone }: Props) {
  const [form, setForm]                         = useState(emptyForm())
  const [step, setStep]                         = useState(1)
  // Dirección del último movimiento (avanzar = entra desde la derecha).
  const [dir, setDir]                           = useState<1 | -1>(1)
  const [clienteName, setClienteName]           = useState("")
  const [clienteProductos, setClienteProductos] = useState<ClienteProducto[]>([])
  // Catálogo de envases desde /dashboard/filtros: /admin/envases exige rol admin
  // y a este formulario entra producción, que se quedaría sin opciones.
  const [envases, setEnvases] = useState<string[]>([])

  useEffect(() => {
    api.dashboard.filtros().then((f) => setEnvases(f.envases ?? [])).catch(() => {})
  }, [])
  const [usuarios, setUsuarios]                 = useState<UserAdmin[]>([])
  const [saving, setSaving]                     = useState(false)
  const [error, setError]                       = useState("")
  const [success, setSuccess]                   = useState(false)

  useEffect(() => {
    api.admin.listUsers().then((u) => setUsuarios(u.filter((u) => u.is_active))).catch(() => {})
  }, [])

  useEffect(() => {
    setStep(1)
    setError("")
    if (orden) {
      setForm(ordenToForm(orden))
      setClienteName(orden.cliente_nombre ?? "")
      api.clientes.get(orden.cliente_id)
        .then((c) => setClienteProductos(c.productos ?? []))
        .catch(() => setClienteProductos([]))
    } else if (prefill) {
      // Prellenar desde el agente de voz
      const coloresPrefill = prefill.impresion_colores
        ? [...prefill.impresion_colores, "", "", "", "", ""].slice(0, 6)
        : ["", "", "", "", "", ""]
      setForm({
        ...emptyForm(),
        cliente_id:            prefill.cliente_id,
        cantidad:              prefill.cantidad ?? null,
        observaciones:         prefill.observaciones ?? "",
        fecha_entrega:         prefill.fecha_entrega ?? "",
        extrusion_color:       prefill.extrusion_color ?? "Blanco",
        extrusion_trat:        prefill.extrusion_trat ?? "Con",
        extrusion_espesor:     prefill.extrusion_espesor ?? 60,
        extrusion_formulacion: prefill.extrusion_formulacion ?? "2045/208",
        extrusion_ancho:       prefill.extrusion_ancho ?? null,
        extrusion_cant_bob:    prefill.extrusion_cant_bob ?? null,
        troquelado_alto:       prefill.troquelado_alto ?? null,
        troquelado_ancho:      prefill.troquelado_ancho ?? null,
        troquelado_envase:     prefill.troquelado_envase ?? "",
        impresion_colores:     coloresPrefill,
      })
      setClienteName(prefill.cliente_nombre ?? "")
      // Cargar productos del cliente si está disponible
      if (prefill.cliente_id) {
        api.clientes.get(prefill.cliente_id)
          .then((c) => setClienteProductos(c.productos ?? []))
          .catch(() => setClienteProductos([]))
      } else {
        setClienteProductos([])
      }
    } else {
      setForm(emptyForm())
      setClienteName("")
      setClienteProductos([])
    }

  }, [orden, prefill])

  type Form = ReturnType<typeof emptyForm>
  const set = (key: keyof Form, value: unknown) => setForm((f) => ({ ...f, [key]: value }))
  const num = (v: string) => (v === "" ? null : Number(v))

  const handleSelectCliente = (c: Cliente) => {
    const productos = c.productos ?? []
    setClienteName(c.marca || c.razon_social || "")
    setClienteProductos(productos)
    if (productos.length === 1) {
      const p = productos[0]
      setForm((f) => ({
        ...f, cliente_id: c.id, cliente_producto_id: p.id,
        ...(p.cilindro != null && { impresion_cilindro: p.cilindro }),
        ...(p.alto != null     && { troquelado_alto: p.alto }),
        ...(p.envase           && { troquelado_envase: p.envase }),
        ...(p.lamina           && { extrusion_formulacion: p.lamina }),
      }))
    } else {
      setForm((f) => ({ ...f, cliente_id: c.id, cliente_producto_id: null, impresion_cilindro: null, troquelado_alto: null, troquelado_envase: "", extrusion_formulacion: "2045/208" }))
    }
  }

  const handleSelectProducto = (p: ClienteProducto | null) => {
    if (!p) { set("cliente_producto_id", null); return }
    setForm((f) => ({
      ...f, cliente_producto_id: p.id,
      ...(p.cilindro != null && { impresion_cilindro: p.cilindro }),
      ...(p.alto != null     && { troquelado_alto: p.alto }),
      ...(p.envase           && { troquelado_envase: p.envase }),
      ...(p.lamina           && { extrusion_formulacion: p.lamina }),
    }))
  }

  const addBobina    = () => setForm((f) => ({ ...f, bobinas: [...f.bobinas, { metros: null, kg_bob: null, numero_lote: "" }] }))
  const removeBobina = (i: number) => setForm((f) => ({ ...f, bobinas: f.bobinas.filter((_, idx) => idx !== i) }))
  const updateBobina = (i: number, key: "metros" | "kg_bob" | "numero_lote", v: string) =>
    setForm((f) => ({ ...f, bobinas: f.bobinas.map((b, idx) => idx === i ? { ...b, [key]: key === "numero_lote" ? v : num(v) } : b) }))
  const updateColor  = (i: number, v: string) =>
    setForm((f) => { const colores = [...f.impresion_colores]; colores[i] = v; return { ...f, impresion_colores: colores } })

  const goNext = () => {
    if (step === 1 && !form.cliente_id) { setError("Seleccioná un cliente para continuar"); return }
    setError("")
    setDir(1)
    setStep((s) => Math.min(s + 1, STEPS.length))
  }
  const goPrev = () => { setError(""); setDir(-1); setStep((s) => Math.max(s - 1, 1)) }

  const handleSubmit = async () => {
    if (saving) return
    setSaving(true); setError("")
    try {
      const payload = { ...form, impresion_colores: form.impresion_colores.filter(Boolean), bobinas: form.bobinas.filter((b) => b.metros != null || b.kg_bob != null || (b as BobinaForm).numero_lote?.trim()) }
      const saved = orden ? await api.ordenes.update(orden.id, payload) : await api.ordenes.create(payload)
      toast.success(orden ? `Orden ${saved.numero} actualizada` : `Orden ${saved.numero} creada`)
      setSuccess(true)
      setTimeout(() => onDone(true), 1500)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al guardar"
      setError(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  // ── Render de cada step ──────────────────────────────────────────────────

  const renderStep = () => {
    switch (step) {
      // ── Step 1: General — 2 bloques: el pedido / asignación ─────────────
      case 1:
        return (
          <div className="space-y-4">
            {/* ① El pedido: para quién y qué se produce */}
            <Bloque title="El pedido" icon={ClipboardList}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field label="Marca" icon={Building2} className="sm:col-span-2">
                  <ClienteSelector value={form.cliente_id || null} onSelect={handleSelectCliente} initialName={clienteName} />
                </Field>
                <Field label="Fecha" icon={CalendarDays}>
                  <Input type="date" value={form.fecha ?? ""} onChange={(e) => set("fecha", e.target.value)} />
                </Field>
                {clienteProductos.length > 0 && (
                  <Field label="Producto" icon={Package} className="sm:col-span-2">
                    <ProductoSelector productos={clienteProductos} value={form.cliente_producto_id ?? null} onSelect={handleSelectProducto} />
                  </Field>
                )}
                {clienteProductos.length > 0 && (
                  <Field label="Envase" icon={Boxes}>
                    <EnvaseSelector catalogo={envases} value={form.troquelado_envase ?? ""}
                      onChange={(v) => set("troquelado_envase", v)} />
                  </Field>
                )}
              </div>
            </Bloque>

            {/* ② Asignación: quién la lleva y en qué estado arranca */}
            <Bloque title="Asignación y estado" icon={UserRound}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field label="Responsable" icon={UserRound}>
                  <Select value={form.responsable_id ?? ""} onChange={(e) => set("responsable_id", e.target.value === "" ? null : Number(e.target.value))}>
                    <option value="">Sin asignar</option>
                    {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre_completo || u.email}</option>)}
                  </Select>
                </Field>
                <Field label="Operador" icon={Wrench}>
                  <Input value={form.operador} onChange={(e) => set("operador", e.target.value)} placeholder="Nombre del operador" />
                </Field>
                <Field label="Estado" icon={Flag}>
                  <Select value={form.estado} onChange={(e) => set("estado", e.target.value)}>
                    {ESTADOS_OT.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
                  </Select>
                </Field>
              </div>
            </Bloque>
          </div>
        )

      // ── Step 2: Extrusión — 3 bloques: film / bobinas / producción ──────
      case 2:
        return (
          <div className="space-y-4">
            {/* ① El film: qué material se extruye */}
            <Bloque title="El film" icon={Layers}>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Field label="Ancho (mm)">
                  <Input type="number" step="0.01" placeholder="0.00" value={form.extrusion_ancho ?? ""}
                    onChange={(e) => set("extrusion_ancho", num(e.target.value))} />
                </Field>
                <Field label="Micronaje (µ)">
                  <Input type="number" step="1" placeholder="60" value={form.extrusion_espesor ?? ""}
                    onChange={(e) => set("extrusion_espesor", num(e.target.value))} />
                </Field>
                <Field label="Color">
                  <Select value={form.extrusion_color ?? "Blanco"} onChange={(e) => set("extrusion_color", e.target.value)}>
                    <option value="Blanco">Blanco</option>
                    <option value="Cristal">Cristal</option>
                  </Select>
                </Field>
                <Field label="Tratamiento">
                  <Select value={form.extrusion_trat ?? "Con"} onChange={(e) => set("extrusion_trat", e.target.value)}>
                    <option value="Con">Con</option>
                    <option value="Sin">Sin</option>
                  </Select>
                </Field>
                <Field label="Formulación / Lámina" className="col-span-2">
                  <Input placeholder="2045/208" value={form.extrusion_formulacion ?? ""}
                    onChange={(e) => set("extrusion_formulacion", e.target.value)} />
                </Field>
              </div>
            </Bloque>

            {/* ② Las bobinas: cuántas y sus medidas */}
            <Bloque title="Las bobinas" icon={Package}>
              <div className="mb-4 grid grid-cols-2 gap-4 sm:w-1/2">
                <Field label="Cant. Bobinas">
                  <Input type="number" placeholder="0" value={form.extrusion_cant_bob ?? ""}
                    onChange={(e) => set("extrusion_cant_bob", num(e.target.value))} />
                </Field>
              </div>
              <label className="mb-2 block text-[12.5px] font-bold uppercase tracking-wider text-muted-foreground">MTS / KG por bobina</label>
              <div className="overflow-hidden rounded-xl border border-border bg-card/60">
                <table className="w-full text-sm">
                  <thead className="border-b border-border bg-muted/40">
                    <tr>
                      <th className="px-3 py-2.5 text-left text-[11.5px] font-bold uppercase text-muted-foreground">#</th>
                      <th className="px-3 py-2.5 text-left text-[11.5px] font-bold uppercase text-muted-foreground">Metros</th>
                      <th className="px-3 py-2.5 text-left text-[11.5px] font-bold uppercase text-muted-foreground">KG/Bob</th>
                      <th className="px-3 py-2.5 text-left text-[11.5px] font-bold uppercase text-muted-foreground">N° Lote</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {form.bobinas.map((b, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2 text-[13px] font-bold text-muted-foreground">{i + 1}</td>
                        <td className="px-3 py-2">
                          <Input type="number" step="0.01" placeholder="0.00" value={b.metros ?? ""}
                            onChange={(e) => updateBobina(i, "metros", e.target.value)} className="w-32" />
                        </td>
                        <td className="px-3 py-2">
                          <Input type="number" step="0.001" placeholder="0.000" value={b.kg_bob ?? ""}
                            onChange={(e) => updateBobina(i, "kg_bob", e.target.value)} className="w-32" />
                        </td>
                        <td className="px-3 py-2">
                          <Input placeholder="Opcional" value={(b as BobinaForm).numero_lote ?? ""}
                            onChange={(e) => updateBobina(i, "numero_lote", e.target.value)} className="w-36" />
                        </td>
                        <td className="px-2 py-2">
                          {form.bobinas.length > 1 && (
                            <button type="button" onClick={() => removeBobina(i)}
                              aria-label={`Eliminar fila de bobina ${i + 1}`}
                              className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button type="button" onClick={addBobina}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3.5 py-2 text-[13.5px] font-bold text-muted-foreground transition-colors hover:border-gold/50 hover:text-gold">
                <Plus className="h-4 w-4" /> Agregar fila
              </button>
            </Bloque>

            {/* ③ La producción: quién y en qué máquina */}
            <Bloque title="La producción" icon={Factory}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Máquina">
                  <Input placeholder="Ej: EXT-01" value={form.extrusion_maquina ?? ""}
                    onChange={(e) => set("extrusion_maquina", e.target.value)} />
                </Field>
                <Field label="Operador">
                  <Input placeholder="Nombre del operador" value={form.operador_extrusion ?? ""}
                    onChange={(e) => set("operador_extrusion", e.target.value)} />
                </Field>
                <Field label="Observaciones" className="sm:col-span-2">
                  <textarea value={form.extrusion_observaciones ?? ""} placeholder="Notas de extrusión"
                    onChange={(e) => set("extrusion_observaciones", e.target.value)} rows={2}
                    className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                </Field>
              </div>
            </Bloque>
          </div>
        )

      // ── Step 3: Impresión ───────────────────────────────────────────────
      case 3:
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Frente">
                <textarea value={form.impresion_frente ?? ""} placeholder="Descripción del frente"
                  onChange={(e) => set("impresion_frente", e.target.value)} rows={3}
                  className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring" />
              </Field>
              <Field label="Observaciones">
                <textarea value={form.impresion_observaciones ?? ""} placeholder="Observaciones de impresión"
                  onChange={(e) => set("impresion_observaciones", e.target.value)} rows={3}
                  className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring" />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Cilindro (mm)">
                <Input type="number" step="0.01" placeholder="0.00" value={form.impresion_cilindro ?? ""}
                  onChange={(e) => set("impresion_cilindro", num(e.target.value))} className="h-9 text-sm" />
              </Field>
              <Field label="Operador">
                <Input placeholder="Nombre del operador" value={form.operador_impresion ?? ""}
                  onChange={(e) => set("operador_impresion", e.target.value)} className="h-9 text-sm" />
              </Field>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Colores (hasta 6)</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {form.impresion_colores.map((color, i) => (
                  <div key={i} className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground">{i + 1}.</span>
                    <Input value={color} onChange={(e) => updateColor(i, e.target.value)}
                      placeholder={COLORES_PRESET[i] ?? `Color ${i + 1}`}
                      className="h-9 text-sm pl-7" list={`colores-preset-${i}`} />
                    <datalist id={`colores-preset-${i}`}>
                      {COLORES_PRESET.map((c) => <option key={c} value={c} />)}
                    </datalist>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )

      // ── Step 4: Troquelado ──────────────────────────────────────────────
      case 4:
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Ancho (mm)">
                <Input type="number" step="0.01" placeholder="0.00" value={form.troquelado_ancho ?? ""}
                  onChange={(e) => set("troquelado_ancho", num(e.target.value))} className="h-9 text-sm" />
              </Field>
              <Field label="Alto (mm)">
                <Input type="number" step="0.01" placeholder="0.00" value={form.troquelado_alto ?? ""}
                  onChange={(e) => set("troquelado_alto", num(e.target.value))} className="h-9 text-sm" />
              </Field>
            </div>

            <Field label="Máquina">
              <Input placeholder="Ej: TRQ-01" value={form.troquelado_maquina ?? ""}
                onChange={(e) => set("troquelado_maquina", e.target.value)} className="h-9 text-sm" />
            </Field>

            <Field label="Observaciones">
              <textarea value={form.troquelado_observaciones ?? ""} placeholder="Notas de troquelado"
                onChange={(e) => set("troquelado_observaciones", e.target.value)} rows={2}
                className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring" />
            </Field>
          </div>
        )

      // ── Step 5: Finalización ─────────────────────────────────────────────
      case 5:
        return (
          <div className="space-y-4">
            <SubSection title="Control de Calidad" icon={ShieldCheck} />
            <Field label="Observaciones">
              <textarea value={form.control_calidad ?? ""} placeholder="Notas de control de calidad..."
                onChange={(e) => set("control_calidad", e.target.value)} rows={3}
                className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring" />
            </Field>

            <SubSection title="Fechas por Etapa" icon={CalendarDays} />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {([
                ["fecha_diseno",     "Diseño"],
                ["fecha_preprensa",  "Preprensa"],
                ["fecha_extrusion",  "Extrusión"],
                ["fecha_impresion",  "Impresión"],
                ["fecha_troquelado", "Troquelado"],
                ["fecha_entrega",    "Entrega"],
              ] as [keyof ReturnType<typeof emptyForm>, string][]).map(([key, label]) => (
                <Field key={key} label={label}>
                  <Input type="date" value={(form[key] as string) ?? ""}
                    onChange={(e) => set(key, e.target.value)} className="h-9 text-sm" />
                </Field>
              ))}
            </div>

            <SubSection title="Totales" icon={Calculator} />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Cantidad">
                <Input type="number" placeholder="0" value={form.cantidad ?? ""}
                  onChange={(e) => set("cantidad", num(e.target.value))} className="h-9 text-sm" />
              </Field>
              <Field label="Total Final">
                <Input type="number" step="0.01" placeholder="0.00" value={form.total_final ?? ""}
                  onChange={(e) => set("total_final", num(e.target.value))} className="h-9 text-sm" />
              </Field>
            </div>
            {(() => {
              const metros = (form.cantidad != null && form.troquelado_alto != null) ? form.cantidad * form.troquelado_alto * 1.20 : null
              const kilos  = (form.extrusion_ancho != null && metros != null) ? form.extrusion_ancho * metros * 0.6 * 0.92 : null
              return (
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Metros (calc.)">
                    <div className="h-9 flex items-center px-3 border border-input rounded-lg bg-muted/40 text-sm font-medium">
                      {metros != null ? metros.toFixed(2) : <span className="text-muted-foreground">—</span>}
                    </div>
                  </Field>
                  <Field label="Kilos (calc.)">
                    <div className="h-9 flex items-center px-3 border border-input rounded-lg bg-muted/40 text-sm font-medium">
                      {kilos != null ? kilos.toFixed(3) : <span className="text-muted-foreground">—</span>}
                    </div>
                  </Field>
                </div>
              )
            })()}
            <Field label="Observaciones generales">
              <Input placeholder="Notas adicionales" value={form.observaciones ?? ""}
                onChange={(e) => set("observaciones", e.target.value)} className="h-9 text-sm" />
            </Field>
          </div>
        )
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="min-h-full w-full bg-background pb-0">

        {/* ── Overlay de éxito ────────────────────────────────────────────── */}
        {success && (
          <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/95 backdrop-blur-sm gap-5 animate-in fade-in duration-300">
            <div className="flex items-center justify-center w-20 h-20 rounded-full bg-emerald-500/15 border-2 border-emerald-500 animate-in zoom-in-50 duration-300">
              <Check className="w-10 h-10 text-emerald-500 stroke-[2.5]" />
            </div>
            <div className="text-center">
              <p className="text-xl font-semibold text-foreground">{orden ? "Orden actualizada" : "¡Orden creada!"}</p>
              <p className="text-sm text-muted-foreground mt-1">Los cambios fueron guardados correctamente</p>
            </div>
          </div>
        )}

        {/* ── Header: banner azul de marca full-bleed + stepper de barras ── */}
        <div className="bg-brand relative overflow-hidden px-5 pt-5 text-white sm:px-8 lg:px-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logoSOLO.png" alt="" aria-hidden className="pointer-events-none absolute -right-10 -top-6 h-52 w-52 select-none object-contain opacity-[0.12] brightness-0 invert" />
          <button
            type="button"
            onClick={() => onDone(false)}
            className="relative -ml-1 mb-3 inline-flex items-center gap-1.5 rounded-lg px-1 py-1 text-[13px] font-semibold text-white/70 transition-colors hover:text-white"
          >
            <ChevronLeft className="h-4 w-4" /> Volver a órdenes
          </button>
          <p className="relative text-center text-[11px] font-extrabold uppercase tracking-[0.22em] text-white/65">
            {orden ? "Editar orden" : "Nueva orden de trabajo"}
          </p>
          <h1 className="font-brand relative mt-1 text-center text-[30px] leading-tight tracking-tight text-white">
            {orden ? `Editar ${orden.numero}` : "Nueva orden"}
            {clienteName && <span className="ml-2.5 text-[17px] font-normal text-white/70">· {clienteName}</span>}
          </h1>

          {/* Stepper: barra + número + nombre (solo pasos ya visitados son clickeables) */}
          <div className="relative mt-4 flex gap-1.5">
            {STEPS.map((s) => {
              const isDone    = s.id < step
              const isCurrent = s.id === step
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => { if (isDone) { setError(""); setDir(-1); setStep(s.id) } }}
                  disabled={!isDone}
                  className={`flex flex-1 flex-col gap-2 px-0.5 pb-3.5 text-left ${isDone ? "cursor-pointer" : "cursor-default"}`}
                >
                  <span className={`h-[4px] rounded-full ${isCurrent ? "bg-gold" : isDone ? "bg-gold/50" : "bg-white/20"}`} />
                  <span className={`flex items-center gap-2 text-[12.5px] font-extrabold ${isCurrent ? "text-white" : isDone ? "text-white/80" : "text-white/45"}`}>
                    <span className={`grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full border-2 ${
                      isCurrent ? "border-gold bg-gold text-gold-foreground" : isDone ? "border-gold/60 bg-gold/20 text-gold" : "border-white/35"
                    }`}>
                      {isDone ? <Check className="h-3.5 w-3.5" /> : <s.icon className="h-3.5 w-3.5" strokeWidth={2.4} />}
                    </span>
                    <span className="hidden sm:inline">{s.label}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Content (key={step} → anima la entrada en la dirección del movimiento) ── */}
        <div className="ot-wizard min-h-[calc(100vh-320px)] px-5 py-7 sm:px-8 lg:px-10">
          <div key={step} className={`animate-in fade-in duration-300 ${dir === 1 ? "slide-in-from-right-8" : "slide-in-from-left-8"}`}>
            {renderStep()}
          </div>
          {error && (
            <p className="mt-4 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-[14.5px] font-semibold text-red-200">{error}</p>
          )}
        </div>

        {/* ── Footer sticky: la navegación siempre a la vista.
             (el dock de IA ahora vive centrado, ya no tapa los botones) ── */}
        <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-background/95 px-5 py-4 backdrop-blur sm:px-8 lg:px-10">
          <span className="text-[14px] font-extrabold text-muted-foreground">
            Paso <span className="text-foreground">{step}</span> de {STEPS.length}
          </span>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={step === 1 ? () => onDone(false) : goPrev}
              disabled={saving}
              className="inline-flex h-12 items-center gap-1.5 rounded-xl border-[1.5px] border-border px-5 text-[15px] font-extrabold text-foreground transition-colors hover:bg-muted/40 disabled:pointer-events-none disabled:opacity-40"
            >
              {step > 1 && <ChevronLeft className="h-[18px] w-[18px]" />}
              {step === 1 ? "Cancelar" : "Atrás"}
            </button>
            {step < STEPS.length ? (
              <button type="button" onClick={goNext} className="inline-flex h-12 items-center gap-2 rounded-xl bg-gold px-6 text-[15.5px] font-extrabold text-gold-foreground transition hover:brightness-95">
                Continuar <ChevronRight className="h-5 w-5" />
              </button>
            ) : (
              <button type="button" onClick={handleSubmit} disabled={saving} className="inline-flex h-12 items-center gap-2 rounded-xl bg-gold px-6 text-[15.5px] font-extrabold text-gold-foreground transition hover:brightness-95 disabled:opacity-60">
                {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
                {orden ? "Guardar cambios" : "Crear orden"}
              </button>
            )}
          </div>
        </div>

    </div>
  )
}
