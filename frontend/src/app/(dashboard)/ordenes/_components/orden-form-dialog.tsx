"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import type { Bobina, Cliente, ClienteProducto, EstadoOrden, OrdenTrabajo, UserAdmin } from "@/lib/api/types"
import { Input } from "@/components/ui/input"
import { Selector } from "@/components/ui/selector"
import {
  Loader2, Search, ChevronDown, Check, ChevronLeft, ChevronRight,
  ClipboardList, Layers, Printer, Scissors, PackageCheck, CalendarDays, Calculator,
  type LucideIcon,
} from "lucide-react"
import type { OrderPrefill } from "@/lib/voice/types"
import {
  DEMORA_CALCULO_MS, MARGEN_METROS, altoEnMetros, calcularMetrosExtrusion,
  fechaLegible, formatoAr, leerLamina, metrosCrudos,
} from "./venus"

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Bobina con n° de lote (el tipo base aún no lo expone) */
type BobinaForm = Bobina & { numero_lote?: string | null }

const STEPS: { id: number; label: string; icon: LucideIcon }[] = [
  { id: 1, label: "General",      icon: ClipboardList },
  { id: 2, label: "Extrusión",    icon: Layers        },
  { id: 3, label: "Impresión",    icon: Printer       },
  { id: 4, label: "Troquelado",   icon: Scissors      },
  { id: 5, label: "Finalización", icon: PackageCheck  },
]

/**
 * Un dato ya cargado, de sólo lectura, para el resumen del último paso.
 *
 * Cuando el dato falta dice «—» en gris en vez de dejar el renglón vacío: un
 * hueco en blanco se lee como «eso está bien así», y no es lo mismo que «esto
 * quedó sin cargar». El que firma la orden tiene que poder distinguirlos.
 */
function DatoResumen({ label, valor, sufijo }: { label: string; valor?: string | number | null; sufijo?: string }) {
  const vacio = valor == null || valor === ""
  return (
    <div className="min-w-0">
      <span className="ficha-rotulo">{label}</span>
      <p className={`break-words text-[17px] font-bold leading-tight ${vacio ? "text-[#8a8fa6]" : "text-[#111]"}`}>
        {vacio ? "—" : valor}
        {!vacio && sufijo && <span className="ml-1 text-[13.5px] font-semibold text-[#5a5f6e]">{sufijo}</span>}
      </p>
    </div>
  )
}

/** Un paso del alta dentro del resumen: su título y los datos que se cargaron ahí. */
function BloqueResumen({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-3 border-b border-[#e0e2ed] pb-1.5 text-[12px] font-extrabold uppercase tracking-[0.22em] text-[#0f0c44]">
        {titulo}
      </p>
      <div className="grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-4">{children}</div>
    </div>
  )
}

/**
 * `useLayoutEffect` en el navegador y `useEffect` en el servidor.
 *
 * El cursor hay que reubicarlo ANTES de que se pinte la pantalla, o se ve
 * saltar; pero `useLayoutEffect` a secas tira un warning cuando Next renderiza
 * en el servidor, donde no existe el layout.
 */
const useEfectoDeLayout = typeof window !== "undefined" ? useLayoutEffect : useEffect

/**
 * Campo de cantidad que va poniendo los puntos de miles mientras se escribe:
 * 10000 → 10.000, 1000000 → 1.000.000.
 *
 * ES `type="text"` Y NO `type="number"` A PROPÓSITO: un input numérico no
 * acepta el punto como separador de miles — el navegador lo considera un valor
 * inválido y devuelve cadena vacía, así que el campo se borraría solo al tipear
 * el cuarto dígito. `inputMode="numeric"` deja igual el teclado de números en
 * el celular, que es lo único que se perdía al dejar de ser `number`.
 */
function CampoCantidad({ value, onChange, className, placeholder }: {
  value: number | null
  onChange: (v: number | null) => void
  className?: string
  placeholder?: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  /** Cuántos DÍGITOS quedaban a la derecha del cursor cuando se tipeó. */
  const digitosALaDerecha = useRef<number | null>(null)

  const texto = value == null ? "" : formatoAr(value, 0)

  useEfectoDeLayout(() => {
    const el = ref.current
    const pendiente = digitosALaDerecha.current
    if (!el || pendiente == null) return
    digitosALaDerecha.current = null
    // Se cuenta en DÍGITOS y no en caracteres: al escribir, el texto pasa de
    // "10000" a "10.000" y el navegador deja el cursor en la misma posición
    // numérica, que ahora cae en el medio del número. Contando dígitos desde
    // el final, el cursor queda donde la persona lo dejó.
    let pos = el.value.length
    let vistos = 0
    while (pos > 0 && vistos < pendiente) {
      pos -= 1
      if (/\d/.test(el.value[pos])) vistos += 1
    }
    el.setSelectionRange(pos, pos)
  }, [texto])

  return (
    <Input
      ref={ref}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder={placeholder}
      className={className}
      value={texto}
      onChange={(e) => {
        const crudo = e.target.value
        const cursor = e.target.selectionStart ?? crudo.length
        digitosALaDerecha.current = crudo.slice(cursor).replace(/\D/g, "").length
        const digitos = crudo.replace(/\D/g, "")
        onChange(digitos === "" ? null : Number(digitos))
      }}
    />
  )
}

// ─── Selector de marca ────────────────────────────────────────────────────

function ClienteSelector({ value, onSelect, initialName, subrayado = false }: { value: number | null; onSelect: (c: Cliente) => void; initialName?: string; subrayado?: boolean }) {
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
        className={subrayado
          ? "flex cursor-pointer items-center gap-2 border-b-[1.5px] border-input px-0.5 pb-2 transition-colors hover:border-foreground/40"
          : "flex items-center gap-2 border border-input rounded-lg px-3 h-9 cursor-pointer hover:border-foreground/40 transition-colors bg-background"}
        onClick={() => setOpen((o) => !o)}
      >
        {value
          ? <span className={subrayado ? "flex-1 truncate text-[19px] font-semibold" : "flex-1 text-sm font-medium truncate"}>{displayName}</span>
          : <span className={subrayado ? "flex-1 text-[19px] font-medium text-muted-foreground" : "flex-1 text-sm text-muted-foreground"}>Seleccionar marca...</span>
        }
        <ChevronDown className={subrayado ? "h-[18px] w-[18px] shrink-0 text-muted-foreground" : "w-3.5 h-3.5 text-muted-foreground shrink-0"} />
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

/**
 * Volumen del producto escrito como lo escribe una persona: 1,5 lt (y no
 * 1.5000lt, que es como viene de la base).
 */
function volumenLegible(p: ClienteProducto): string {
  if (p.volumen_cantidad == null) return ""
  const cantidad = Number(p.volumen_cantidad)
  if (!Number.isFinite(cantidad)) return ""
  const numero = cantidad.toLocaleString("es-AR", { maximumFractionDigits: 3 })
  return p.volumen_unidad ? `${numero} ${p.volumen_unidad}` : numero
}

/**
 * ¿El nombre del producto ya dice su volumen?
 *
 * «Lavandina x 5 lt» con volumen 5 lt no tiene que terminar siendo
 * «Lavandina x 5 lt · 5 lt». Se comparan los NÚMEROS del nombre con el del
 * volumen, no el texto: así «Citrus x 1,5 lt» reconoce su 1,5 escrito con coma,
 * y «Agua 500» no se confunde con un volumen de 5.
 */
function nombreYaDiceElVolumen(nombre: string, p: ClienteProducto): boolean {
  if (p.volumen_cantidad == null) return false
  const cantidad = Number(p.volumen_cantidad)
  if (!Number.isFinite(cantidad)) return false
  const numeros = (nombre.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => Number(n.replace(",", ".")))
  return numeros.some((n) => n === cantidad)
}

/**
 * Qué texto ve el usuario por cada producto del desplegable.
 *
 * VA EL NOMBRE Y EL TAMAÑO. La lámina ("Blco 31", "Cristal 24") es el material
 * con el que se fabrica la etiqueta: no es algo que reconozca quien carga la
 * orden, y venía pegada al nombre haciendo ruido ("Lavandina x 5 lt · Blco 58").
 *
 * EL TAMAÑO SÍ VA SIEMPRE que esté cargado. Un cliente de bebidas tiene «Agua»,
 * «Agua sport», «Agua con gas», y lo único que las distingue de verdad es de
 * cuántos mililitros son. Antes el volumen aparecía sólo cuando dos productos
 * se llamaban IGUAL, así que «Agua sport» —que es única— se quedaba sin su
 * tamaño aunque lo tuviera cargado.
 *
 * No se repite cuando el nombre ya lo dice (ver `nombreYaDiceElVolumen`).
 */
function etiquetaDeProducto(p: ClienteProducto): string {
  const nombre = (p.nombre ?? "").trim()
  if (!nombre) return `Producto #${p.id}`
  const volumen = volumenLegible(p)
  if (!volumen || nombreYaDiceElVolumen(nombre, p)) return nombre
  return `${nombre} · ${volumen}`
}

function ProductoSelector({ productos, value, onSelect, subrayado = false }: {
  productos: ClienteProducto[]
  value: number | null
  onSelect: (p: ClienteProducto | null) => void
  subrayado?: boolean
}) {
  if (productos.length === 0) return null
  const opciones = [
    { valor: "", label: "Sin producto específico" },
    ...productos.map((p) => ({ valor: String(p.id), label: etiquetaDeProducto(p) })),
  ]
  return (
    <Selector
      etiqueta="Producto"
      opciones={opciones}
      valor={value != null ? String(value) : ""}
      onCambio={(v) => onSelect(v ? (productos.find((p) => String(p.id) === v) ?? null) : null)}
      placeholder="Sin producto específico"
      className={subrayado ? "ficha-selector" : "rounded-lg border border-input bg-background px-3"}
    />
  )
}

function EnvaseSelector({ catalogo, value, onChange, className = "" }: {
  catalogo: string[]
  value: string
  onChange: (v: string) => void
  className?: string
}) {
  // Se conserva lo guardado aunque no esté en el catálogo: hay 4 envases en uso
  // que nunca se dieron de alta ("CONSULTAR", "Estin A"…), y sin esto abrir una
  // orden vieja se lo cambiaría solo.
  const fuera = value && !catalogo.includes(value)
  // El desplegable propio, no el `<select>` nativo: en Windows el nativo delega
  // la lista al sistema operativo y sale blanca, chica y ajena al tema del ERP.
  // La planta trabaja en Windows. Ver `components/ui/selector.tsx`.
  const opciones = [
    { valor: "", label: "Sin envase" },
    ...(fuera ? [{ valor: value, label: `${value} (fuera del catálogo)` }] : []),
    ...catalogo.map((n) => ({ valor: n, label: n })),
  ]
  return (
    <Selector
      etiqueta="Envase"
      opciones={opciones}
      valor={value}
      onCambio={onChange}
      placeholder="Sin envase"
      className={className}
    />
  )
}

// ─── Estado inicial del formulario ─────────────────────────────────────────

/**
 * La fecha de HOY según el reloj de la planta (`yyyy-mm-dd`).
 *
 * `new Date().toISOString()` devuelve la fecha en UTC: en Argentina (-3), del
 * turno tarde en adelante ya marca la de mañana, y la orden nacería fechada un
 * día después de que se cargó.
 */
function hoyIso(): string {
  const d = new Date()
  const mes = String(d.getMonth() + 1).padStart(2, "0")
  const dia = String(d.getDate()).padStart(2, "0")
  return `${d.getFullYear()}-${mes}-${dia}`
}

/**
 * @param estadoInicial en qué estado nace la orden. Venus arranca «En proceso»
 *   (el borrador es un check aparte); el resto sigue naciendo en borrador.
 */
function emptyForm(estadoInicial: EstadoOrden = "borrador") {
  return {
    cliente_id: 0 as number,
    cliente_producto_id: null as number | null,
    fecha: hoyIso(),
    estado: estadoInicial as EstadoOrden,
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
    /** Metros de film calculados (Venus). Se recalcula al guardar, no se tipea. */
    extrusion_metros: null as number | null,
    bobinas: [{ metros: null, kg_bob: null, numero_lote: "" }] as BobinaForm[],
    impresion_frente: "",
    impresion_retroverso: "",
    impresion_observaciones: "",
    impresion_cilindro: null as number | null,
    impresion_colores: ["", "", "", "", "", ""],
    operador_impresion: "",
    impresion_maquina: "",
    troquelado_ancho: null as number | null,
    troquelado_cierre: null as number | null,
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
    fecha: orden.fecha ?? hoyIso(),
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
    extrusion_metros: orden.extrusion_metros ?? null,
    bobinas,
    impresion_frente: orden.impresion_frente ?? "",
    impresion_retroverso: orden.impresion_retroverso ?? "",
    impresion_observaciones: orden.impresion_observaciones ?? "",
    impresion_cilindro: orden.impresion_cilindro,
    impresion_colores: colores,
    operador_impresion: orden.operador_impresion ?? "",
    impresion_maquina: orden.impresion_maquina ?? "",
    troquelado_ancho: orden.troquelado_ancho,
    troquelado_cierre: orden.troquelado_cierre,
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
  /**
   * Impresora elegida en el paso 0 (nombre del catálogo). Viaja tal cual al
   * backend en `impresion_maquina`; si no viene, el alta sigue como siempre.
   */
  impresionMaquina?: string | null
  /** Volver al listado (saved=true si se guardó; el listado refresca al montar). */
  onDone: (saved?: boolean) => void
}

/** Vista de página completa del wizard de orden de trabajo (ya no es dialog). */
export function OrdenFormVista({ orden = null, prefill, impresionMaquina = null, onDone }: Props) {
  // El paso 0 dice con qué impresora se hace. Editar una orden vieja no pasa
  // por ahí, así que puede llegar vacío; el formulario es el MISMO para todas.
  // Las órdenes arrancan En proceso y el que carga las pasa a borrador con el
  // check, en vez de elegir entre cinco estados que casi siempre son dos.
  const estadoInicial: EstadoOrden = "en_proceso"
  // Por ref y no en las dependencias del efecto que arma el formulario: si
  // fuera dependencia, cambiar de máquina a mitad de carga vaciaría todo lo
  // que el operario ya cargó, y el paso 0 justamente está pensado para volver.
  const estadoInicialRef = useRef(estadoInicial)
  estadoInicialRef.current = estadoInicial
  const [form, setForm]                         = useState(emptyForm(estadoInicial))
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
  // Quién está con la sesión iniciada: es el responsable que viene puesto.
  const [usuarioActual, setUsuarioActual]       = useState<UserAdmin | null>(null)
  const [saving, setSaving]                     = useState(false)
  const [error, setError]                       = useState("")
  const [success, setSuccess]                   = useState(false)

  // ── Los metros de film no salen solos: hay que apretar «Calcular» ─────────
  // Se guarda el resultado JUNTO CON los datos con los que se sacó. Así, apenas
  // el operario cambia la cantidad o el alto, el número desaparece y hay que
  // volver a calcular: un total viejo al lado de datos nuevos es peor que no
  // mostrar nada, porque nadie mira dos veces un número que ya vio.
  const [calculo, setCalculo] = useState<
    { cantidad: number; alto: number; metros: number; crudos: number } | null
  >(null)
  const [calculando, setCalculando] = useState(false)
  const temporizadorCalculo = useRef<number | null>(null)
  useEffect(() => () => {
    if (temporizadorCalculo.current !== null) window.clearTimeout(temporizadorCalculo.current)
  }, [])

  useEffect(() => {
    api.admin.listUsers().then((u) => setUsuarios(u.filter((u) => u.is_active))).catch(() => {})
  }, [])

  // El listado de usuarios es solo para admin: la gente de planta lo recibe
  // vacío. `/auth/me` lo contesta cualquiera, así que de acá sale el usuario
  // que va a figurar como responsable (y él mismo como opción del select).
  useEffect(() => {
    let vigente = true
    api.auth.me()
      .then((u) => { if (vigente) setUsuarioActual(u) })
      .catch(() => { /* si no se pudo saber quién es, queda «Sin asignar» */ })
    return () => { vigente = false }
  }, [])

  // Se pone de responsable solo si nadie lo eligió todavía: al editar manda el
  // que ya tiene la orden, y si el operario lo cambia a mano no se lo pisamos.
  useEffect(() => {
    if (!usuarioActual || orden) return
    setForm((f) => (f.responsable_id == null ? { ...f, responsable_id: usuarioActual.id } : f))
  }, [usuarioActual, orden])

  /** Usuarios elegibles como responsable, con el de la sesión siempre presente. */
  const opcionesResponsable = usuarioActual && !usuarios.some((u) => u.id === usuarioActual.id)
    ? [usuarioActual, ...usuarios]
    : usuarios

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
        ...emptyForm(estadoInicialRef.current),
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
        troquelado_cierre:      prefill.troquelado_cierre ?? null,
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
      setForm(emptyForm(estadoInicialRef.current))
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
        ...(p.cierre != null   && { troquelado_cierre: p.cierre }),
        ...(p.envase           && { troquelado_envase: p.envase }),
        ...datosDeLamina(p.lamina),
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
      ...(p.cierre != null   && { troquelado_cierre: p.cierre }),
      ...(p.envase           && { troquelado_envase: p.envase }),
      ...datosDeLamina(p.lamina),
    }))
  }

  /**
   * De dónde salió un campo que la ficha del producto tendría que traer.
   *
   * Un campo vacío sin explicación mezcla tres causas distintas en la misma
   * pantalla en blanco: el sistema falló, el que carga se olvidó, o el dato no
   * existe. El rótulo las separa, y de paso le dice a la empresa dónde cargarlo.
   */
  const origenDelProducto = (valor: number | null) => {
    if (valor != null) return " · viene del producto"
    const hayProducto = clienteProductos.some((x) => x.id === form.cliente_producto_id)
    return hayProducto ? " · este producto no lo tiene cargado" : ""
  }

  /**
   * Lo que la lámina del producto le aporta al formulario.
   *
   * "Blco 54" no es un texto suelto: son el color y el ancho del film pegados.
   * Se reparten en sus campos para que nadie tenga que volver a tipear algo
   * que la empresa ya tiene cargado en la ficha del producto.
   *
   * El ancho sólo se completa cuando la lámina lo dice sin ambigüedad: con
   * "Blco" a secas, o con "Cristal Retrov. 31/T24" (dos números), el campo
   * queda vacío a propósito. Ver `leerLamina`.
   */
  const datosDeLamina = (lamina?: string | null) => {
    if (!lamina) return {}
    const { color, ancho } = leerLamina(lamina)
    return {
      extrusion_formulacion: lamina,
      ...(color != null && { extrusion_color: color }),
      ...(ancho != null && { extrusion_ancho: ancho }),
    }
  }

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
      const payload = {
        ...form,
        // El paso 0 manda: es lo que el operario acaba de elegir. Al editar una
        // orden vieja no hay paso 0 y vale lo que muestra el formulario.
        ...(impresionMaquina ? { impresion_maquina: impresionMaquina } : {}),
        // Los metros de film salen de la cuenta, no de un campo que se tipea:
        // se recalculan al guardar con lo último que quedó en pantalla.
        extrusion_metros: calcularMetrosExtrusion(form.cantidad, form.troquelado_alto),
        impresion_colores: form.impresion_colores.filter(Boolean),
        bobinas: form.bobinas.filter((b) => b.metros != null || b.kg_bob != null || (b as BobinaForm).numero_lote?.trim()),
      }
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

  // ── Paso «General» de VENUS ──────────────────────────────────────────────
  // Es una función normal y no un componente: si fuera `<PasoGeneralVenus />`
  // React lo trataría como un tipo nuevo en cada render y lo volvería a montar,
  // y el campo que se está tipeando perdería el foco tecla por tecla.
  const pasoGeneral = () => {
    const cantidad = form.cantidad
    const alto     = form.troquelado_alto
    const metros   = calcularMetrosExtrusion(cantidad, alto)
    const falta    = [
      cantidad == null || cantidad <= 0 ? "la cantidad de etiquetas" : null,
      alto == null || alto <= 0 ? "el alto de la etiqueta" : null,
    ].filter(Boolean)
    const esBorrador = form.estado === "borrador"

    // El resultado en pantalla vale sólo si es de ESTOS datos. Si cambió alguno,
    // `calculo` queda viejo y se muestra el botón de nuevo.
    const vigente =
      calculo != null && calculo.cantidad === cantidad && calculo.alto === alto
        ? calculo
        : null
    const seDesactualizo = calculo != null && vigente == null

    const calcular = () => {
      const crudos = metrosCrudos(cantidad, alto)
      if (metros == null || crudos == null || cantidad == null || alto == null) return
      setCalculando(true)
      if (temporizadorCalculo.current !== null) window.clearTimeout(temporizadorCalculo.current)
      // La demora es a propósito: el número aparece de golpe y grande, y esa
      // pausa es lo que hace que el operario lo MIRE en vez de pasarlo de largo.
      temporizadorCalculo.current = window.setTimeout(() => {
        setCalculo({ cantidad, alto, metros, crudos })
        setCalculando(false)
      }, DEMORA_CALCULO_MS)
    }

    return (
      <div className="ficha">

        {/* La fecha no es un campo: se informa y ya. Arriba a la derecha, donde
            no se confunde con algo que haya que completar. */}
        <p className="flex items-center justify-end gap-2 text-[13px] font-bold uppercase tracking-[0.1em] text-[#5a5f6e]">
          <CalendarDays className="h-4 w-4 shrink-0" strokeWidth={2.2} />
          Fecha
          <span className="text-[15px] font-extrabold tracking-normal text-[#0f0c44]">
            {fechaLegible(form.fecha)}
          </span>
        </p>

        {/* ① El pedido */}
        <section className="ficha-seccion">
          <header>El pedido</header>
          <div className="ficha-cuerpo">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <span className="ficha-rotulo">Marca</span>
                <ClienteSelector value={form.cliente_id || null} onSelect={handleSelectCliente}
                  initialName={clienteName} subrayado />
              </div>
              <div>
                <span className="ficha-rotulo">Producto</span>
                {clienteProductos.length > 0 ? (
                  <ProductoSelector productos={clienteProductos} value={form.cliente_producto_id ?? null}
                    onSelect={handleSelectProducto} subrayado />
                ) : (
                  <p className="min-h-[30px] border-b-[1.5px] border-[#c0c4d8] px-0.5 pb-[3px] text-[15px] font-medium text-[#6b7185]">
                    {form.cliente_id ? "Esta marca no tiene productos" : "Elegí primero la marca"}
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ② Cuánto se hace */}
        <section className="ficha-seccion">
          <header>Cuánto se hace</header>
          <div className="ficha-cuerpo">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <label>
                <span className="ficha-rotulo">Cantidad de etiquetas</span>
                <CampoCantidad value={cantidad ?? null} onChange={(v) => set("cantidad", v)}
                  placeholder="Ej: 100.000" className="ficha-campo" />
              </label>
              <label>
                <span className="ficha-rotulo">Alto de la etiqueta (cm) · viene del producto</span>
                <Input type="number" inputMode="decimal" min={0} step="0.01" placeholder="Ej: 11.5"
                  value={alto ?? ""} onChange={(e) => set("troquelado_alto", num(e.target.value))}
                  className="ficha-campo" />
              </label>
            </div>

            {/* El total: el único número que el operario se lleva a la máquina. */}
            <div className="mt-5 border-t border-[#e0e2ed] pt-4">
              {metros == null ? (
                <p className="text-[14px] font-semibold text-[#5a5f6e]">
                  Para saber los metros falta cargar {falta.join(" y ")}.
                </p>
              ) : vigente == null ? (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
                  <button
                    type="button"
                    onClick={calcular}
                    disabled={calculando}
                    className="inline-flex items-center gap-2.5 rounded-md bg-[#0f0c44] px-5 py-3 text-[15px] font-bold text-white transition hover:bg-[#2a2580] disabled:cursor-wait disabled:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f0c44]/40"
                  >
                    {calculando ? (
                      <>
                        <Loader2 className="h-[18px] w-[18px] animate-spin motion-reduce:animate-none" strokeWidth={2.4} />
                        Calculando…
                      </>
                    ) : (
                      <>
                        <Calculator className="h-[18px] w-[18px]" strokeWidth={2.4} />
                        {seDesactualizo ? "Volver a calcular" : "Calcular metros de film"}
                      </>
                    )}
                  </button>
                  {seDesactualizo && !calculando && (
                    <span className="text-[14px] font-semibold text-[#5a5f6e]">
                      Cambiaste los datos: calculá de nuevo.
                    </span>
                  )}
                </div>
              ) : (
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <span className="ficha-rotulo !mb-0">Hay que extrudir</span>
                  <span className="text-[34px] font-extrabold leading-none tracking-[-0.02em] text-[#0f0c44] tabular-nums">
                    {formatoAr(vigente.metros)}
                  </span>
                  <span className="text-[16px] font-bold text-[#555]">m de film</span>
                  <span className="w-full text-[13px] font-semibold text-[#5a5f6e]">
                    {formatoAr(vigente.cantidad, 0)} etiquetas × {formatoAr(altoEnMetros(vigente.alto), 4)} m
                    {" "}+ {formatoAr(MARGEN_METROS)} de margen = {formatoAr(vigente.crudos)} m
                    {vigente.metros !== vigente.crudos && ", redondeado para arriba al metro"}
                  </span>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ③ Quién la lleva */}
        <section className="ficha-seccion">
          <header>Quién la lleva</header>
          <div className="ficha-cuerpo">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <span className="ficha-rotulo">Responsable</span>
                <Selector
                  etiqueta="Responsable"
                  valor={form.responsable_id != null ? String(form.responsable_id) : ""}
                  onCambio={(v) => set("responsable_id", v === "" ? null : Number(v))}
                  placeholder="Sin asignar"
                  className="ficha-selector"
                  opciones={[
                    { valor: "", label: "Sin asignar" },
                    ...opcionesResponsable.map((u) => ({
                      valor: String(u.id),
                      label: `${u.nombre_completo || u.email}${u.id === usuarioActual?.id ? " (vos)" : ""}`,
                    })),
                  ]}
                />
              </div>

              <label className="flex cursor-pointer items-start gap-3 sm:self-end sm:pb-1">
                <input
                  type="checkbox" checked={esBorrador}
                  onChange={(e) => set("estado", e.target.checked ? "borrador" : "en_proceso")}
                  className="mt-0.5 h-[20px] w-[20px] shrink-0 cursor-pointer accent-[#0f0c44]"
                />
                <span>
                  <span className="block text-[15px] font-bold text-[#111]">Es borrador</span>
                  <span className="mt-0.5 block text-[13px] font-semibold text-[#5a5f6e]">
                    {esBorrador
                      ? "Se guarda a medio cargar: no entra a producción hasta que la completen."
                      : "Sin tildar entra a producción."}
                  </span>
                </span>
              </label>
            </div>
          </div>
        </section>
      </div>
    )
  }

  // ── Render de cada step ──────────────────────────────────────────────────

  const renderStep = () => {
    switch (step) {
      // ── Step 1: General — 2 bloques: el pedido / asignación ─────────────
      case 1:
        return pasoGeneral()

      // ── Step 2: Extrusión ─────────────────────────────────────────────
      // Con la cara de la ficha que después sale impresa (ver `.ficha` en
      // globals.css): el operario llena los mismos recuadros que va a leer en
      // el papel, y nada cambia de lugar al imprimir.
      case 2:
        return (
          <div className="ficha">

            {/* ① El film */}
            <section className="ficha-seccion">
              <header>El film</header>
              <div className="ficha-cuerpo">
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
                  <label>
                    <span className="ficha-rotulo">Ancho (mm)</span>
                    <Input type="number" step="0.01" placeholder="0,00" value={form.extrusion_ancho ?? ""}
                      onChange={(e) => set("extrusion_ancho", num(e.target.value))} className="ficha-campo" />
                  </label>
                  <label>
                    <span className="ficha-rotulo">Micronaje (µ)</span>
                    <Input type="number" step="1" placeholder="60" value={form.extrusion_espesor ?? ""}
                      onChange={(e) => set("extrusion_espesor", num(e.target.value))} className="ficha-campo" />
                  </label>
                  <div>
                    <span className="ficha-rotulo">Color</span>
                    <Selector
                      etiqueta="Color"
                      valor={form.extrusion_color ?? "Blanco"}
                      onCambio={(v) => set("extrusion_color", v)}
                      opciones={[
                        { valor: "Blanco", label: "Blanco" },
                        { valor: "Cristal", label: "Cristal" },
                      ]}
                      className="ficha-selector"
                    />
                  </div>
                </div>

                {/* El total de metros: el dato que el operario se lleva a la
                    máquina, así que va en su propio recuadro destacado. */}
                {(() => {
                  const metros = calcularMetrosExtrusion(form.cantidad, form.troquelado_alto)
                  if (metros == null) {
                    return (
                      <p className="mt-5 border-t border-[#e0e2ed] pt-4 text-[14px] font-semibold text-[#5a5f6e]">
                        Falta la cantidad de etiquetas o el alto: se cargan en el paso General.
                      </p>
                    )
                  }
                  return (
                    <div className="mt-5 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-[#e0e2ed] pt-4">
                      <span className="ficha-rotulo !mb-0">Hay que extrudir</span>
                      <span className="text-[34px] font-extrabold leading-none tracking-[-0.02em] text-[#0f0c44] tabular-nums">
                        {formatoAr(metros)}
                      </span>
                      <span className="text-[16px] font-bold text-[#555]">m de film</span>
                      <span className="w-full text-[13px] font-semibold text-[#5a5f6e]">
                        {formatoAr(form.cantidad ?? 0, 0)} etiquetas × {formatoAr(altoEnMetros(form.troquelado_alto), 4)} m
                        {" "}+ {formatoAr(MARGEN_METROS)} de margen ={" "}
                        {formatoAr(metrosCrudos(form.cantidad, form.troquelado_alto) ?? 0)} m
                      </span>
                    </div>
                  )
                })()}
              </div>
            </section>

            {/* Las bobinas y la producción NO se cargan acá: salen impresas en
                blanco y las llena a mano el que está en la máquina. La ficha de
                papel ya trae la tabla con seis filas vacías y los recuadros de
                máquina, operador y observaciones.

                Los datos siguen existiendo y guardándose: una orden vieja que
                los tenga cargados no los pierde al editarla, y el agente de voz
                los puede seguir completando. */}
          </div>
        )
      // ── Step 3: Impresión ───────────────────────────────────────────────
      // En pantalla queda SÓLO lo que el sistema ya sabe: la máquina (la eligió
      // el paso 0) y el cilindro (viene cargado en la ficha del producto).
      //
      // ...más el RETROVERSO, que lo carga la oficina y no el operario, aunque
      // sea la excepción: sólo uno o dos clientes imprimen atrás, todo el resto
      // es impresión de frente.
      //
      // Lo demás de este paso lo escribe a mano el que está en la máquina
      // —colores, operario, fecha y observaciones—, así que sale impreso en
      // blanco en la ficha de papel en vez de pedirlo acá. Un campo que nadie
      // completa igual hay que leerlo en cada orden.
      case 3:
        return (
          <div className="ficha">

            {/* ① Con qué se imprime */}
            <section className="ficha-seccion">
              <header>Con qué se imprime</header>
              <div className="ficha-cuerpo">
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <label>
                    <span className="ficha-rotulo">Máquina</span>
                    {/* En el alta la elige el paso 0 y llega acá ya resuelta; se
                        muestra igual para que el operario vea con qué va a imprimir. */}
                    <Input placeholder="Ej: Venus" value={impresionMaquina ?? form.impresion_maquina ?? ""}
                      readOnly={!!impresionMaquina}
                      onChange={(e) => set("impresion_maquina", e.target.value)} className="ficha-campo" />
                  </label>
                  {/* Sale de la ficha del producto, pero hoy sólo 158 de 1.211
                      lo tienen cargado: por eso el rótulo avisa cuando falta. */}
                  <label>
                    <span className="ficha-rotulo">
                      Cilindro (mm){origenDelProducto(form.impresion_cilindro)}
                    </span>
                    <Input type="number" step="0.01" placeholder="0,00" value={form.impresion_cilindro ?? ""}
                      onChange={(e) => set("impresion_cilindro", num(e.target.value))} className="ficha-campo" />
                  </label>
                </div>
              </div>
            </section>

            {/* ② Retroverso: la excepción. Va en su propio recuadro y no mezclado
                con los campos de arriba, justamente para que se lea como lo que
                es: algo que la mayoría de las órdenes deja vacío. */}
            <section className="ficha-seccion">
              <header>Retroverso</header>
              <div className="ficha-cuerpo">
                <label className="block">
                  <span className="ficha-rotulo">Qué se imprime atrás · opcional</span>
                  <textarea
                    value={form.impresion_retroverso ?? ""}
                    onChange={(e) => set("impresion_retroverso", e.target.value)}
                    rows={2}
                    placeholder="Dejalo vacío si la etiqueta se imprime sólo de frente"
                    className="ficha-campo resize-none"
                  />
                </label>
                <p className="mt-2 text-[13.5px] font-semibold text-[#5a5f6e]">
                  Lo llevan uno o dos clientes: casi todas las órdenes van sólo de frente.
                </p>
              </div>
            </section>

            {/* ③ Lo que se llena a mano: no son campos, es el aviso de qué
                recuadros van a salir vacíos en el papel. Si no se dice, el que
                carga la orden cree que falta algo. */}
            <section className="ficha-seccion">
              <header>Lo llena el operario en la máquina</header>
              <div className="ficha-cuerpo">
                <p className="text-[15px] font-semibold leading-relaxed text-[#111]">
                  Colores · Operario · Fecha · Observaciones
                </p>
                <p className="mt-2 text-[13.5px] font-semibold text-[#5a5f6e]">
                  Salen impresos en blanco en la ficha para completar a mano.
                </p>
              </div>
            </section>
          </div>
        )

      // ── Step 4: Troquelado ──────────────────────────────────────────────
      // En pantalla queda lo que el sistema ya sabe o la oficina tiene que
      // decidir: las medidas de la etiqueta y el envase. La máquina y las
      // observaciones las escribe el que troquela, así que salen impresas en
      // blanco igual que en Extrusión e Impresión.
      case 4:
        return (
          <div className="ficha">

            {/* ① Las medidas: las dos vienen de la ficha del producto. */}
            <section className="ficha-seccion">
              <header>La etiqueta</header>
              <div className="ficha-cuerpo">
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  {/* CIERRE, no «Ancho»: es el diámetro de la tapa del envase
                      (13,4 · 24,9 · 27,6…) y la ficha del producto lo tiene en
                      1.143 de 1.211. El ancho se tipeaba a mano y no lo
                      completaba nadie. */}
                  <label>
                    <span className="ficha-rotulo">
                      Cierre{origenDelProducto(form.troquelado_cierre)}
                    </span>
                    <Input type="number" step="0.01" placeholder="0,00" value={form.troquelado_cierre ?? ""}
                      onChange={(e) => set("troquelado_cierre", num(e.target.value))} className="ficha-campo" />
                  </label>
                  {/* Centímetros, no milímetros: es el MISMO alto que usa la
                      cuenta de metros de extrusión, y los altos de la ficha de
                      producto (4 a 20) son centímetros de etiqueta. */}
                  <label>
                    <span className="ficha-rotulo">
                      Alto (cm){origenDelProducto(form.troquelado_alto)}
                    </span>
                    <Input type="number" step="0.01" placeholder="0,00" value={form.troquelado_alto ?? ""}
                      onChange={(e) => set("troquelado_alto", num(e.target.value))} className="ficha-campo" />
                  </label>
                </div>
              </div>
            </section>

            {/* ② El envase vive acá, que es el paso donde se troquela, y no en
                el paso General: ahí sólo va el pedido (marca, producto y cuánto
                se hace). Vale para todas las impresoras. */}
            <section className="ficha-seccion">
              <header>El envase</header>
              <div className="ficha-cuerpo">
                <div className="max-w-[420px]">
                  <span className="ficha-rotulo">Cuál</span>
                  <EnvaseSelector catalogo={envases} value={form.troquelado_envase ?? ""}
                    onChange={(v) => set("troquelado_envase", v)} className="ficha-selector" />
                </div>
                {/* Código y ubicación salen de la ficha del producto: el que va a
                    buscar el envase al depósito necesita saber DÓNDE está. Sólo
                    aparecen si están cargados, que hoy es la minoría. */}
                {(() => {
                  const p = clienteProductos.find((x) => x.id === form.cliente_producto_id)
                  const partes = [
                    p?.envase_codificado ? `Código ${p.envase_codificado}` : null,
                    p?.ubicacion ? `Ubicación ${p.ubicacion}` : null,
                  ].filter(Boolean)
                  if (partes.length === 0) return null
                  return (
                    <p className="mt-3 text-[14px] font-semibold text-[#111]">
                      {partes.join(" · ")}
                    </p>
                  )
                })()}
              </div>
            </section>

            {/* ③ Lo que sale en blanco en el papel. Si no se dice, el que carga
                la orden cree que le falta completar algo. */}
            <section className="ficha-seccion">
              <header>Lo llena el operario en la máquina</header>
              <div className="ficha-cuerpo">
                <p className="text-[15px] font-semibold leading-relaxed text-[#111]">
                  Máquina · Operario · Fecha · Observaciones
                </p>
                <p className="mt-2 text-[13.5px] font-semibold text-[#5a5f6e]">
                  Salen impresos en blanco en la ficha para completar a mano.
                </p>
              </div>
            </section>
          </div>
        )

      // ── Step 5: Finalización ─────────────────────────────────────────────
      // Arranca con el resumen de los cuatro pasos anteriores. El alta son cinco
      // pantallas y la última es la que se firma: antes de guardar hay que poder
      // releer TODO lo cargado sin volver atrás paso por paso.
      //
      // Es de sólo lectura a propósito. Si acá también se pudiera editar habría
      // dos lugares para el mismo dato y ninguno sería el bueno; para corregir
      // algo se vuelve al paso donde vive, que además lo muestra con su contexto.
      case 5: {
        const producto    = clienteProductos.find((x) => x.id === form.cliente_producto_id)
        const responsable = opcionesResponsable.find((u) => u.id === form.responsable_id)
        // LOS MISMOS metros que muestran General y Extrusión, y los mismos que se
        // guardan al enviar (ver `handleSubmit`). Antes acá había otra cuenta
        // —`cantidad × alto × 1,20`— que para 200.000 etiquetas daba 1.440.000 m
        // contra los 1.600 reales: tres números distintos para el mismo dato en
        // el mismo formulario. Hay UNA sola fuente, `calcularMetrosExtrusion`.
        const metros      = calcularMetrosExtrusion(form.cantidad, form.troquelado_alto)
        const maquina     = impresionMaquina ?? form.impresion_maquina
        const envaseExtra = [
          producto?.envase_codificado ? `Cód. ${producto.envase_codificado}` : null,
          producto?.ubicacion ? `Ubic. ${producto.ubicacion}` : null,
        ].filter(Boolean).join(" · ")

        return (
          <div className="ficha">

            {/* ① El resumen de todo lo anterior */}
            <section className="ficha-seccion">
              <header>Lo que cargaste</header>
              <div className="ficha-cuerpo flex flex-col gap-6">

                <BloqueResumen titulo="El pedido">
                  <DatoResumen label="Marca" valor={clienteName} />
                  <DatoResumen label="Producto" valor={producto ? etiquetaDeProducto(producto) : null} />
                  <DatoResumen
                    label="Cantidad"
                    valor={form.cantidad != null ? formatoAr(form.cantidad, 0) : null}
                    sufijo="etiquetas"
                  />
                  <DatoResumen label="Fecha" valor={fechaLegible(form.fecha)} />
                  <DatoResumen
                    label="Responsable"
                    valor={responsable ? (responsable.nombre_completo || responsable.email) : null}
                  />
                  <DatoResumen
                    label="Estado"
                    valor={form.estado === "borrador" ? "Borrador" : "Entra a producción"}
                  />
                </BloqueResumen>

                <BloqueResumen titulo="Extrusión">
                  <DatoResumen
                    label="Ancho"
                    valor={form.extrusion_ancho != null ? formatoAr(form.extrusion_ancho) : null}
                    sufijo="mm"
                  />
                  <DatoResumen
                    label="Micronaje"
                    valor={form.extrusion_espesor != null ? formatoAr(form.extrusion_espesor, 0) : null}
                    sufijo="µ"
                  />
                  <DatoResumen label="Color" valor={form.extrusion_color} />
                  <DatoResumen
                    label="Hay que extrudir"
                    valor={metros != null ? formatoAr(metros) : null}
                    sufijo="m de film"
                  />
                </BloqueResumen>

                <BloqueResumen titulo="Impresión">
                  <DatoResumen label="Máquina" valor={maquina} />
                  <DatoResumen
                    label="Cilindro"
                    valor={form.impresion_cilindro != null ? formatoAr(form.impresion_cilindro) : null}
                    sufijo="mm"
                  />
                  <DatoResumen
                    label="Retroverso"
                    valor={form.impresion_retroverso?.trim() || "Sólo frente"}
                  />
                </BloqueResumen>

                <BloqueResumen titulo="Troquelado">
                  <DatoResumen
                    label="Cierre"
                    valor={form.troquelado_cierre != null ? formatoAr(form.troquelado_cierre) : null}
                  />
                  <DatoResumen
                    label="Alto"
                    valor={form.troquelado_alto != null ? formatoAr(form.troquelado_alto) : null}
                    sufijo="cm"
                  />
                  <DatoResumen label="Envase" valor={form.troquelado_envase} />
                  <DatoResumen label="Dónde está" valor={envaseExtra || null} />
                </BloqueResumen>

                {/* Lo que NO está acá tampoco se cargó en pantalla: sale impreso
                    en blanco y lo llena el que está en la máquina. Decirlo evita
                    que el que firma crea que el resumen le está escondiendo algo. */}
                <p className="border-t border-[#e0e2ed] pt-3 text-[13.5px] font-semibold leading-relaxed text-[#5a5f6e]">
                  Bobinas, colores, operarios y observaciones de máquina no van acá:
                  salen impresos en blanco en la ficha y los completa la planta.
                </p>
              </div>
            </section>

            {/* ② Control de calidad */}
            <section className="ficha-seccion">
              <header>Control de calidad</header>
              <div className="ficha-cuerpo">
                <label className="block">
                  <span className="ficha-rotulo">Observaciones · opcional</span>
                  <textarea value={form.control_calidad ?? ""} rows={3}
                    placeholder="Notas de control de calidad…"
                    onChange={(e) => set("control_calidad", e.target.value)}
                    className="ficha-campo resize-none" />
                </label>
              </div>
            </section>

            {/* ③ Totales.
                Las fechas por etapa se fueron del formulario: las seis se
                cargaban a mano y ninguna se llenaba. Extrusión, impresión y
                troquelado las escribe el escaneo del QR —fecha real del paso por
                la máquina, no la que alguien recuerda al cerrar la orden— y las
                columnas siguen en la base: el formulario reenvía lo que ya
                tienen, así que editar una orden no pisa lo que marcó la planta. */}
            <section className="ficha-seccion">
              <header>Totales</header>
              <div className="ficha-cuerpo flex flex-col gap-5">
                {/* El total en pesos se fue: la orden de trabajo es un papel de
                    planta y el precio no se decide acá. La columna sigue en la
                    base y el formulario reenvía lo que ya tenga cargado, así que
                    editar una orden vieja no le borra el total. */}
                <label className="block max-w-[420px]">
                  <span className="ficha-rotulo">Cantidad de etiquetas</span>
                  <CampoCantidad value={form.cantidad ?? null} onChange={(v) => set("cantidad", v)}
                    placeholder="Ej: 100.000" className="ficha-campo" />
                </label>
                <label className="block">
                  <span className="ficha-rotulo">Observaciones generales · opcional</span>
                  <Input placeholder="Notas adicionales" value={form.observaciones ?? ""}
                    onChange={(e) => set("observaciones", e.target.value)} className="ficha-campo" />
                </label>
              </div>
            </section>
          </div>
        )
      }
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
