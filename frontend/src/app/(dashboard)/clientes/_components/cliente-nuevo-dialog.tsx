"use client"

/**
 * Alta de cliente por PASOS (wizard).
 * Diseño aprobado: 5 pasos con letras grandes para usuarios mayores,
 * una pregunta por pantalla, trío de envase destacado y paso final de
 * revisión antes de crear. Header azul de marca + progreso dorado.
 */

import { useCallback, useState, useEffect, useRef } from "react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import type { Cliente, Filtros, RazonSocial } from "@/types/database"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import {
  Plus, Loader2, X, Check, ChevronLeft, ChevronRight,
  Building2, MapPin, Phone, Package, ClipboardCheck,
  type LucideIcon,
} from "lucide-react"

// ── Campos que viajan al backend (alta plana) ────────────────────────────────
const CAMPOS_INSERT = [
  "id_cliente","marca","rubro","razon_social","razon_social_id","domicilio","localidad","provincia","pais",
  "cuit","telefono","producto","volumen_cantidad","volumen_unidad","lamina","muestra","alto","cilindro","cierre",
  "envase","envase_codificado","ubicacion","observaciones","transporte","transporte_domicilio","transporte_localidad",
]

const INITIAL_FORM: Record<string, string | number | null> = {
  id_cliente: "", marca: "", rubro: "", razon_social: "", razon_social_id: null,
  domicilio: "", localidad: "", provincia: "", pais: "Argentina",
  cuit: "", telefono: "",
  producto: "", volumen_cantidad: "", volumen_unidad: "", lamina: "", muestra: "",
  alto: "", cilindro: "", cierre: "",
  envase: "", envase_codificado: "", ubicacion: "",
  observaciones: "", transporte: "", transporte_domicilio: "", transporte_localidad: "",
}

// ── Pasos del wizard ─────────────────────────────────────────────────────────
const PASOS: { key: string; label: string; pregunta: string; sub: string; icon: LucideIcon }[] = [
  { key: "cliente",      label: "Cliente",      pregunta: "¿Quién es el cliente?",     sub: "Lo mínimo para arrancar: la marca. El resto se puede completar después.", icon: Building2 },
  { key: "ubicacion",    label: "Ubicación",    pregunta: "¿Dónde está?",              sub: "Domicilio y localización del cliente.",                                    icon: MapPin },
  { key: "contacto",     label: "Contacto",     pregunta: "¿Cómo lo contactamos?",     sub: "Teléfono, transporte con el que trabaja y notas.",                         icon: Phone },
  { key: "presentacion", label: "Presentación", pregunta: "¿Qué le producimos?",       sub: "La primera presentación. Después podés agregar más desde la ficha.",       icon: Package },
  { key: "revisar",      label: "Revisar",      pregunta: "Revisá y creá",             sub: "Un vistazo final. Tocá “Editar” en una tarjeta para volver a ese paso.",   icon: ClipboardCheck },
]

/** Razón social con la que arranca el alta, cuando se entra desde su ficha
 *  ("Agregar marca"). Preseleccionarla es lo que evita que el usuario intente
 *  crear una segunda razón social con el mismo N° de cliente. */
export type RazonSocialInicial = {
  id: number
  razon_social: string
  cuit?: string | null
  numero?: number | null
}

interface ClienteNuevoDialogProps {
  open: boolean
  onClose: () => void
  onCreated: (cliente: Cliente) => void
  filtros: Filtros
  razonSocialInicial?: RazonSocialInicial | null
}

// ── Selector de razón social (buscar o crear) ────────────────────────────────
/** Lo mínimo de una razón social para volver a elegirla sin buscarla. */
export type RazonSocialElegida = Pick<RazonSocial, "id" | "razon_social" | "cuit" | "numero">

const normalizar = (t: string) => t.trim().toLowerCase()

export function RazonSocialSelector({
  value,
  valorRs,
  onChange,
  excluirId,
  onCrear,
  listaEnLinea = false,
}: {
  value: string
  /** La razón social que ya está elegida al montar (p. ej. al volver a este paso).
   *  Con ella, si se borra una letra y se vuelve a escribir, se recupera la MISMA
   *  empresa: buscarla por nombre podía no encontrarla o traer otra homónima. */
  valorRs?: RazonSocialElegida | null
  onChange: (id: number | null, razonSocial: string, cuit?: string | null, numero?: number | null) => void
  /** No la ofrece entre los resultados (p. ej. la misma razón social que se está borrando). */
  excluirId?: number
  /** Si se pasa, «Crear» sólo avisa el nombre en vez de darla de alta ya: quien
   *  la usa decide cuándo crearla (p. ej. recién al confirmar un borrado). */
  onCrear?: (nombre: string) => void
  /** La lista de resultados ocupa lugar debajo del campo en vez de flotar. Para
   *  usarlo dentro de algo que se desplaza (un cartel con scroll), donde la lista
   *  flotante quedaba recortada y no se veía. */
  listaEnLinea?: boolean
}) {
  const [query, setQuery] = useState(value)
  const [results, setResults] = useState<RazonSocial[]>([])
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const listaRef = useRef<HTMLDivElement>(null)
  // Lo último elegido. Si el texto se aleja de su nombre, la elección deja de
  // valer: si no, se borraba el texto, se escribía otra empresa y el formulario
  // seguía guardando la primera, que ya no estaba en pantalla. Lo soltado se
  // recuerda para devolverlo si vuelve a escribir exactamente ese nombre.
  type Eleccion = { nombre: string; rs?: RazonSocialElegida; nueva?: boolean }
  const elegido = useRef<Eleccion | null>(
    valorRs ? { nombre: value || valorRs.razon_social, rs: valorRs } : value ? { nombre: value } : null)
  const soltado = useRef<Eleccion | null>(null)

  useEffect(() => {
    if (!open) return
    const t = setTimeout(async () => {
      const res = await api.razonessociales.list({ search: query, per_page: 15 })
      setResults(res.data)
    }, 250)
    return () => clearTimeout(t)
  }, [query, open])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    // En línea, la lista ocupa lugar: si se cierra al APRETAR el mouse, todo lo de
    // abajo sube antes de soltarlo y el clic cae en otro lado (el botón «No,
    // volver» no respondía al primer clic). Se cierra recién con el clic completo.
    const evento = listaEnLinea ? "click" : "mousedown"
    document.addEventListener(evento, handler)
    return () => document.removeEventListener(evento, handler)
  }, [listaEnLinea])

  const handleSelect = (rs: RazonSocial) => {
    setQuery(rs.razon_social)
    setOpen(false)
    elegido.current = { nombre: rs.razon_social, rs }
    onChange(rs.id, rs.razon_social, rs.cuit, rs.numero)
  }

  const handleCreate = async () => {
    if (!query.trim() || creating) return
    if (onCrear) {
      const nombre = query.trim()
      setQuery(nombre)
      setOpen(false)
      elegido.current = { nombre, nueva: true }
      onCrear(nombre)
      return
    }
    setCreating(true)
    try {
      const rs = await api.razonessociales.create({ razon_social: query.trim() })
      setOpen(false)
      elegido.current = { nombre: rs.razon_social, rs }
      onChange(rs.id, rs.razon_social, rs.cuit, rs.numero)
      toast.success("Razón social creada")
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "No se pudo crear la razón social")
    } finally {
      setCreating(false)
    }
  }

  const visibles = excluirId == null ? results : results.filter((r) => r.id !== excluirId)
  const listaAbierta = open && (visibles.length > 0 || query.trim() !== "")

  // En línea, la lista puede quedar debajo de lo visible: se la trae a la vista.
  useEffect(() => {
    if (listaEnLinea && listaAbierta) listaRef.current?.scrollIntoView({ block: "nearest" })
  }, [listaEnLinea, listaAbierta, visibles.length])
  const exactMatch = results.some(
    (r) => r.razon_social.toLowerCase() === query.trim().toLowerCase()
  )

  return (
    <div ref={ref} className="relative">
      <Input
        type="text"
        autoComplete="off"
        value={query}
        placeholder="Buscar o crear…"
        onFocus={() => {
          setOpen(true)
          api.razonessociales.list({ per_page: 15 }).then((r) => setResults(r.data))
        }}
        onChange={(e) => {
          const texto = e.target.value
          setQuery(texto)
          setOpen(true)
          const actual = elegido.current
          // Espacios o mayúsculas de más no la sueltan: se ve igual en pantalla.
          if (actual && normalizar(texto) !== normalizar(actual.nombre)) {
            soltado.current = actual
            elegido.current = null
            onChange(null, "")
            return
          }
          const previo = soltado.current
          if (!actual && previo && normalizar(texto) === normalizar(previo.nombre)) {
            // Borró una letra y la volvió a escribir: la elección vuelve a valer.
            // Sólo con la empresa en mano; nunca adivinándola por el nombre.
            const rs = previo.rs
            if (rs) {
              elegido.current = { nombre: texto, rs }
              onChange(rs.id, rs.razon_social, rs.cuit, rs.numero)
              return
            }
            if (previo.nueva && onCrear) {
              elegido.current = { nombre: texto, nueva: true }
              onCrear(texto.trim())
              return
            }
          }
          if (!texto) onChange(null, "")
        }}
        className="h-14 rounded-xl border-[1.5px] bg-input border-border text-[17px] font-semibold text-foreground placeholder:font-normal placeholder:text-muted-foreground focus-visible:border-gold focus-visible:ring-gold/15"
      />
      {listaAbierta && (
        <div
          ref={listaRef}
          className={`${listaEnLinea ? "relative" : "absolute z-50 left-0 right-0 top-full"} mt-1.5 bg-popover border border-border rounded-xl shadow-xl overflow-hidden max-h-60 overflow-y-auto`}
        >
          {visibles.map((rs) => (
            <button
              key={rs.id}
              type="button"
              onMouseDown={() => handleSelect(rs)}
              className="w-full text-left px-4 py-2.5 hover:bg-muted/50 flex flex-col gap-0.5"
            >
              <span className="text-[15px] font-semibold text-foreground">{rs.razon_social}</span>
              {rs.cuit && <span className="text-[12.5px] text-muted-foreground">{rs.cuit}</span>}
            </button>
          ))}
          {!exactMatch && query.trim() && (
            <button
              type="button"
              onMouseDown={handleCreate}
              disabled={creating}
              className="w-full text-left px-4 py-3 hover:bg-emerald-500/10 text-[15px] font-semibold text-emerald-400 flex items-center gap-2 border-t border-border"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Crear &ldquo;{query.trim()}&rdquo;
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Bloques de UI reutilizables ──────────────────────────────────────────────
const LABEL_CLS = "block text-[13px] font-bold uppercase tracking-[0.06em] text-muted-foreground mb-2"
const INPUT_CLS = "h-14 rounded-xl border-[1.5px] bg-input border-border text-[17px] font-semibold text-foreground placeholder:font-normal placeholder:text-muted-foreground focus-visible:border-gold focus-visible:ring-gold/15"

function Etiqueta({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <label className={LABEL_CLS}>
      {children}
      {hint && <span className="ml-1.5 font-semibold normal-case tracking-normal text-muted-foreground/70">· {hint}</span>}
    </label>
  )
}

export function ClienteNuevoDialog({ open, onClose, onCreated, filtros, razonSocialInicial }: ClienteNuevoDialogProps) {
  // Formulario inicial, ya con la razón social si se entró desde su ficha. El N°
  // de cliente sale de la entidad legal: lo comparten todas sus marcas.
  const formInicial = useCallback((): Record<string, string | number | null> => (
    razonSocialInicial
      ? {
          ...INITIAL_FORM,
          razon_social_id: razonSocialInicial.id,
          razon_social:    razonSocialInicial.razon_social,
          cuit:            razonSocialInicial.cuit ?? null,
          ...(razonSocialInicial.numero != null ? { id_cliente: razonSocialInicial.numero } : {}),
        }
      : { ...INITIAL_FORM }
  ), [razonSocialInicial])

  const [paso, setPaso] = useState(0)
  // Dirección del último movimiento: avanzar → entra desde la derecha; volver → desde la izquierda.
  const [dir, setDir] = useState<1 | -1>(1)
  const [formData, setFormData] = useState<Record<string, string | number | null>>(formInicial)
  // Lo que la empresa elegida completó sola (CUIT y datos de sus otras marcas),
  // con el valor que puso. Al cambiar o soltar la empresa se saca lo que siga
  // igual: si no, la marca se guardaba con el CUIT o la dirección de otra.
  const autoInicial = useCallback((): Record<string, string> =>
    razonSocialInicial?.cuit ? { cuit: razonSocialInicial.cuit } : {}, [razonSocialInicial])
  const autocompletado = useRef<Record<string, string>>(autoInicial())
  // La empresa elegida entera: el buscador se vuelve a montar cada vez que se
  // vuelve a este paso, y con sólo el nombre no podía recuperar la misma.
  const empresaInicial = useCallback((): RazonSocialElegida | null => razonSocialInicial
    ? { id: razonSocialInicial.id, razon_social: razonSocialInicial.razon_social,
        cuit: razonSocialInicial.cuit ?? null, numero: razonSocialInicial.numero ?? null }
    : null, [razonSocialInicial])
  const [empresaElegida, setEmpresaElegida] = useState<RazonSocialElegida | null>(empresaInicial)
  const [saving, setSaving] = useState(false)
  // Envase fuera del catálogo → input libre en lugar del select.
  const [envaseLibre, setEnvaseLibre] = useState(false)

  const irA = (n: number) => {
    setDir(n >= paso ? 1 : -1)
    setPaso(n)
  }

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setFormData((prev) => ({ ...prev, [k]: e.target.value || null }))
  const val = (k: string) => String(formData[k] ?? "")

  /** Trae lo que las otras marcas de la empresa ya comparten (domicilio,
   *  teléfono, transporte) y completa SÓLO los campos vacíos: lo que el usuario
   *  ya escribió no se pisa nunca. */
  const precargarDeLaEmpresa = useCallback(async (rsId: number) => {
    try {
      const d = await api.razonessociales.get(rsId)
      const comunes = (d as { datos_comunes?: Record<string, string | null> }).datos_comunes
      if (!comunes) return
      setFormData((prev) => {
        // Llegó tarde: mientras cargaba, eligió otra empresa o la soltó.
        if (prev.razon_social_id !== rsId) return prev
        const copiados: string[] = []
        const siguiente = { ...prev }
        for (const [campo, valor] of Object.entries(comunes)) {
          if (!valor) continue
          if (String(prev[campo] ?? "").trim() !== "") continue   // ya lo escribió
          if (campo === "pais" && String(prev.pais ?? "") === "Argentina") continue
          siguiente[campo] = valor
          autocompletado.current[campo] = valor
          copiados.push(campo)
        }
        if (copiados.length) {
          toast.success(`Se completaron ${copiados.length} dato(s) de las otras marcas de esta empresa`)
        }
        return siguiente
      })
    } catch {
      // Si falla, el alta sigue: es una ayuda, no un requisito.
    }
  }, [])
  const filled = (k: string) => val(k).trim() !== ""

  const handleOpen = (isOpen: boolean) => {
    if (!isOpen) {
      onClose()
      setFormData(formInicial())
      autocompletado.current = autoInicial()
      setEmpresaElegida(empresaInicial())
      setPaso(0)
      setEnvaseLibre(false)
    }
  }

  // La marca es obligatoria: se valida al salir del paso 1 y al crear.
  const marcaOk = () => {
    if (String(formData.marca ?? "").trim()) return true
    toast.error("La marca es obligatoria")
    setPaso(0)
    return false
  }

  const avanzar = () => {
    if (paso === 0 && !marcaOk()) return
    irA(Math.min(paso + 1, PASOS.length - 1))
  }

  const handleSave = async () => {
    if (saving || !marcaOk()) return
    setSaving(true)
    try {
      const numericFields = ["id_cliente", "alto", "cilindro", "cierre", "volumen_cantidad", "razon_social_id"]
      const insert: Record<string, unknown> = {}
      CAMPOS_INSERT.forEach((campo) => {
        let v = formData[campo] ?? null
        if (v === "" || v === null) {
          if (campo === "pais") insert[campo] = "Argentina"
          return
        }
        if (numericFields.includes(campo)) v = Number(v)
        insert[campo] = v
      })
      if (!("id_cliente" in insert) || insert.id_cliente === "") delete insert.id_cliente

      const created = await api.clientes.create(insert)
      onCreated(created as Cliente)
      toast.success("Cliente creado correctamente")
      handleOpen(false)
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "No se pudo crear el cliente")
    } finally {
      setSaving(false)
    }
  }

  const esUltimo = paso === PASOS.length - 1
  const { pregunta, sub } = PASOS[paso]

  // Al cambiar de paso, el cuerpo vuelve arriba (el contenido nuevo anima con eti-emerge).
  const bodyRef = useRef<HTMLDivElement>(null)
  useEffect(() => { bodyRef.current?.scrollTo({ top: 0 }) }, [paso])

  // Resumen: "valor o —" con estilo apagado para vacíos.
  const Sum = ({ children, vacio }: { children?: React.ReactNode; vacio?: boolean }) => (
    <span className={`text-right text-[16.5px] font-extrabold ${vacio ? "text-muted-foreground/40 font-semibold" : "text-foreground"}`}>
      {children}
    </span>
  )
  const sumVal = (k: string) => (filled(k) ? <Sum>{val(k)}</Sum> : <Sum vacio>—</Sum>)

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent showCloseButton={false} className="w-[95vw] max-w-[1080px] max-h-[92vh] overflow-hidden flex flex-col gap-0 p-0 bg-card border-border shadow-2xl">

        {/* ── Header azul de marca + stepper ── */}
        <div
          className="relative shrink-0 overflow-hidden px-7 pt-6 text-white sm:px-9"
          style={{ background: "var(--color-brand)" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logoSOLO.png" alt="" aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-52 w-52 select-none object-contain opacity-[0.12] brightness-0 invert" />

          <div className="relative flex items-start justify-between gap-4">
            <div>
              <p className="text-[11.5px] font-extrabold uppercase tracking-[0.22em] text-white/65">Alta de cliente</p>
              <DialogTitle className="font-brand mt-1 text-[32px] lowercase leading-none tracking-tight text-white">Nuevo cliente</DialogTitle>
              <DialogDescription className="sr-only">Asistente por pasos para dar de alta un cliente</DialogDescription>
            </div>
            <button
              type="button"
              onClick={() => handleOpen(false)}
              aria-label="Cerrar"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/25 bg-white/10 text-white transition-colors hover:bg-white/20"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Stepper: barra + número + nombre, clickeable */}
          <div className="relative mt-5 flex gap-1.5">
            {PASOS.map((s, i) => {
              const done = i < paso
              const act = i === paso
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => { if (i > 0 && !String(formData.marca ?? "").trim()) { toast.error("La marca es obligatoria"); return } irA(i) }}
                  className="flex flex-1 flex-col gap-2.5 px-1 pb-4 text-left"
                >
                  <span className={`h-[5px] rounded-full ${act ? "bg-gold" : done ? "bg-gold/50" : "bg-white/20"}`} />
                  <span className={`flex items-center gap-2 text-[14px] font-extrabold ${act ? "text-white" : done ? "text-white/80" : "text-white/50"}`}>
                    <span className={`grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full border-2 text-[13px] ${
                      act ? "border-gold bg-gold text-gold-foreground" : done ? "border-gold/60 bg-gold/20 text-gold" : "border-white/35"
                    }`}>
                      {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                    </span>
                    <span className="hidden sm:inline">{s.label}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Cuerpo del paso (key={paso} remonta el contenido → anima la entrada) ── */}
        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-7 py-7 sm:px-9">
          <div key={paso} className={`animate-in fade-in duration-300 ${dir === 1 ? "slide-in-from-right-8" : "slide-in-from-left-8"}`}>
          <h2 className="font-display text-[24px] font-bold leading-tight text-foreground">{pregunta}</h2>
          <p className="mb-6 mt-1 text-[16px] text-muted-foreground">{sub}</p>

          {/* PASO 1 · Cliente */}
          {paso === 0 && (
            <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-6">
              <div className="sm:col-span-4">
                <Etiqueta hint="obligatoria">Marca</Etiqueta>
                <Input autoFocus autoComplete="off" value={val("marca")} onChange={set("marca")} placeholder="Ej: Agua Clara" className={INPUT_CLS} />
              </div>
              {/* El N° de cliente NO se pide acá: es de la razón social y lo
                  comparten todas sus marcas. Elegirla es lo que lo define. */}
              <div className="sm:col-span-2">
                <Etiqueta hint="buscar o crear">Razón Social</Etiqueta>
                <RazonSocialSelector
                  value={val("razon_social")}
                  valorRs={formData.razon_social_id != null ? empresaElegida : null}
                  onChange={(id, rs, cuit, numero) => {
                    setEmpresaElegida(id != null ? { id, razon_social: rs, cuit: cuit ?? null, numero: numero ?? null } : null)
                    const puestoPorLaAnterior = autocompletado.current
                    autocompletado.current = cuit ? { cuit } : {}
                    setFormData((prev) => {
                      const siguiente = { ...prev }
                      // Lo que completó la empresa anterior y nadie tocó, se saca.
                      for (const [campo, valor] of Object.entries(puestoPorLaAnterior)) {
                        if (String(prev[campo] ?? "") === valor) siguiente[campo] = INITIAL_FORM[campo] ?? ""
                      }
                      return {
                        ...siguiente,
                        razon_social_id: id,
                        razon_social: rs,
                        // Sólo pisa el CUIT si la empresa REALMENTE tiene uno: 326
                        // de 400 razones sociales no lo tienen cargado, y con la
                        // versión anterior elegirlas borraba el que ya habías escrito.
                        ...(cuit ? { cuit } : {}),
                        // Al soltar la empresa (o elegir una sin N°) se vacía: si no,
                        // quedaba el número de la anterior y el alta chocaba con ella.
                        id_cliente: numero ?? "",
                      }
                    })
                    if (id) precargarDeLaEmpresa(id)
                  }}
                />
              </div>
              <div className="sm:col-span-3">
                <Etiqueta>Rubro</Etiqueta>
                <Input list="wiz-rubros" autoComplete="off" value={val("rubro")} onChange={set("rubro")} placeholder="Ej: Agua" className={INPUT_CLS} />
                <datalist id="wiz-rubros">{filtros.rubros.map((r) => <option key={r} value={r} />)}</datalist>
              </div>
              <div className="sm:col-span-3">
                <Etiqueta>CUIT</Etiqueta>
                <Input autoComplete="off" value={val("cuit")} onChange={set("cuit")} placeholder="30-12345678-9" className={INPUT_CLS} />
              </div>
              <div className="sm:col-span-6 rounded-xl border-[1.5px] border-dashed border-border px-5 py-4 text-[15px] text-muted-foreground">
                💡 Con solo la <span className="font-bold text-gold">Marca</span> ya podés crear el cliente. Nada más es obligatorio.
              </div>
            </div>
          )}

          {/* PASO 2 · Ubicación */}
          {paso === 1 && (
            <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-6">
              <div className="sm:col-span-6">
                <Etiqueta>Domicilio</Etiqueta>
                <Input autoFocus autoComplete="off" value={val("domicilio")} onChange={set("domicilio")} placeholder="Calle y número" className={INPUT_CLS} />
              </div>
              <div className="sm:col-span-2">
                <Etiqueta>Localidad</Etiqueta>
                <Input autoComplete="off" value={val("localidad")} onChange={set("localidad")} className={INPUT_CLS} />
              </div>
              <div className="sm:col-span-2">
                <Etiqueta>Provincia</Etiqueta>
                <Input list="wiz-provincias" autoComplete="off" value={val("provincia")} onChange={set("provincia")} className={INPUT_CLS} />
                <datalist id="wiz-provincias">{filtros.provincias.map((p) => <option key={p} value={p} />)}</datalist>
              </div>
              <div className="sm:col-span-2">
                <Etiqueta>País</Etiqueta>
                <Input autoComplete="off" value={val("pais")} onChange={set("pais")} className={INPUT_CLS} />
              </div>
            </div>
          )}

          {/* PASO 3 · Contacto */}
          {paso === 2 && (
            <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-6">
              <div className="sm:col-span-3">
                <Etiqueta>Teléfono</Etiqueta>
                <Input autoFocus autoComplete="off" value={val("telefono")} onChange={set("telefono")} placeholder="(0351) 15619-3029" className={INPUT_CLS} />
              </div>
              <div className="sm:col-span-3">
                <Etiqueta>Transporte</Etiqueta>
                <Input autoComplete="off" value={val("transporte")} onChange={set("transporte")} placeholder="Ej: Retira personalmente" className={INPUT_CLS} />
              </div>
              <div className="sm:col-span-3">
                <Etiqueta hint="opcional">Domicilio del transporte</Etiqueta>
                <Input autoComplete="off" value={val("transporte_domicilio")} onChange={set("transporte_domicilio")} className={INPUT_CLS} />
              </div>
              <div className="sm:col-span-3">
                <Etiqueta hint="opcional">Localidad del transporte</Etiqueta>
                <Input autoComplete="off" value={val("transporte_localidad")} onChange={set("transporte_localidad")} className={INPUT_CLS} />
              </div>
              <div className="sm:col-span-6">
                <Etiqueta>Notas</Etiqueta>
                <textarea
                  value={val("observaciones")}
                  onChange={set("observaciones")}
                  placeholder="Observaciones del cliente…"
                  className="h-28 w-full resize-none rounded-xl border-[1.5px] border-border bg-input px-4 py-3.5 text-[17px] font-semibold text-foreground outline-none placeholder:font-normal placeholder:text-muted-foreground focus:border-gold focus:ring-2 focus:ring-gold/15"
                />
              </div>
            </div>
          )}

          {/* PASO 4 · Presentación */}
          {paso === 3 && (
            <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-6">
              <div className="sm:col-span-3">
                <Etiqueta>Producto</Etiqueta>
                <Input autoFocus autoComplete="off" value={val("producto")} onChange={set("producto")} placeholder="Ej: Agua x 500 cc" className={INPUT_CLS} />
              </div>
              <div className="sm:col-span-1">
                <Etiqueta>Volumen</Etiqueta>
                <Input type="number" inputMode="numeric" autoComplete="off" value={val("volumen_cantidad")} onChange={set("volumen_cantidad")} placeholder="500" className={INPUT_CLS} />
              </div>
              <div className="sm:col-span-2">
                <Etiqueta>Unidad</Etiqueta>
                <div className="flex gap-2">
                  {["ml", "lt"].map((u) => {
                    const activa = val("volumen_unidad") === u
                    return (
                      <button
                        key={u}
                        type="button"
                        onClick={() => setFormData((prev) => ({ ...prev, volumen_unidad: activa ? null : u }))}
                        className={`h-14 flex-1 rounded-xl border-[1.5px] text-[17px] font-extrabold transition-colors ${
                          activa
                            ? "border-gold bg-gold/15 text-gold"
                            : "border-border bg-input text-muted-foreground hover:border-border hover:text-foreground"
                        }`}
                      >
                        {u}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Trío de envase destacado */}
              <div className="sm:col-span-6 rounded-2xl border border-border bg-secondary/40 p-5">
                <p className="mb-4 text-[13px] font-extrabold uppercase tracking-[0.16em] text-gold">★ Envase</p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <Etiqueta>Tipo de envase</Etiqueta>
                    {!envaseLibre ? (
                      <>
                        <Select
                          value={(filtros.envases ?? []).includes(val("envase")) ? val("envase") : ""}
                          onChange={(e) => {
                            if (e.target.value === "__otro__") {
                              setEnvaseLibre(true)
                              setFormData((prev) => ({ ...prev, envase: null }))
                            } else {
                              setFormData((prev) => ({ ...prev, envase: e.target.value || null }))
                            }
                          }}
                          className="h-14 rounded-xl border-[1.5px] border-border bg-input text-[17px] font-semibold text-foreground focus-visible:border-gold focus-visible:ring-gold/15 md:text-[17px]"
                        >
                          <option value="" style={{ color: "#0b0d1e", backgroundColor: "#fff" }}>Elegir…</option>
                          {(filtros.envases ?? []).map((e) => (
                            <option key={e} value={e} style={{ color: "#0b0d1e", backgroundColor: "#fff" }}>{e}</option>
                          ))}
                          <option value="__otro__" style={{ color: "#0b0d1e", backgroundColor: "#fff" }}>✏️ Otro (escribir)…</option>
                        </Select>
                      </>
                    ) : (
                      <div className="flex gap-2">
                        <Input autoFocus autoComplete="off" value={val("envase")} onChange={set("envase")} placeholder="Nombre del envase" className={INPUT_CLS} />
                        <button
                          type="button"
                          onClick={() => { setEnvaseLibre(false); setFormData((prev) => ({ ...prev, envase: null })) }}
                          title="Volver a la lista"
                          className="h-14 shrink-0 rounded-xl border-[1.5px] border-border px-4 text-[14px] font-extrabold text-muted-foreground transition-colors hover:text-foreground"
                        >
                          Lista
                        </button>
                      </div>
                    )}
                  </div>
                  <div>
                    <Etiqueta>Código</Etiqueta>
                    <Input autoComplete="off" value={val("envase_codificado")} onChange={set("envase_codificado")} placeholder="STAR-260395" className={INPUT_CLS} />
                  </div>
                  <div>
                    <Etiqueta>Ubicación</Etiqueta>
                    <Input autoComplete="off" value={val("ubicacion")} onChange={set("ubicacion")} placeholder="A-3" className={INPUT_CLS} />
                  </div>
                </div>
              </div>

              <div className="sm:col-span-2">
                <Etiqueta>Lámina</Etiqueta>
                <Input list="wiz-laminas" autoComplete="off" value={val("lamina")} onChange={set("lamina")} placeholder="Blco 24" className={INPUT_CLS} />
                <datalist id="wiz-laminas">{(filtros.laminas ?? []).map((l) => <option key={l} value={l} />)}</datalist>
              </div>
              <div className="sm:col-span-1">
                <Etiqueta>Alto</Etiqueta>
                <Input type="number" inputMode="numeric" list="wiz-altos" autoComplete="off" value={val("alto")} onChange={set("alto")} className={INPUT_CLS} />
                <datalist id="wiz-altos">{(filtros.altos ?? []).map((a) => <option key={a} value={a} />)}</datalist>
              </div>
              <div className="sm:col-span-1">
                <Etiqueta>Cilindro (ø)</Etiqueta>
                <Input type="number" inputMode="numeric" list="wiz-cilindros" autoComplete="off" value={val("cilindro")} onChange={set("cilindro")} className={INPUT_CLS} />
                <datalist id="wiz-cilindros">{(filtros.cilindros ?? []).map((c) => <option key={c} value={c} />)}</datalist>
              </div>
              <div className="sm:col-span-1">
                <Etiqueta>Cierre (int)</Etiqueta>
                <Input type="number" inputMode="numeric" autoComplete="off" value={val("cierre")} onChange={set("cierre")} className={INPUT_CLS} />
              </div>
            </div>
          )}

          {/* PASO 5 · Revisar */}
          {paso === 4 && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* Identidad */}
              <div className="flex items-center gap-4 rounded-2xl border border-gold/35 bg-gold/[0.06] px-5 py-4 lg:col-span-2">
                <div className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-xl bg-gold text-[24px] font-black text-gold-foreground">
                  {(val("marca") || "?")[0]?.toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[24px] font-bold leading-tight text-foreground">{val("marca") || "Sin marca"}</p>
                  <p className="truncate text-[14.5px] font-semibold text-muted-foreground">
                    {[val("razon_social") || null, filled("cuit") ? `CUIT ${val("cuit")}` : null, filled("rubro") ? `Rubro ${val("rubro")}` : null, filled("id_cliente") ? `N° ${val("id_cliente")}` : null].filter(Boolean).join(" · ") || "Completá los datos que falten desde la ficha"}
                  </p>
                </div>
              </div>

              {/* Ubicación */}
              <div className="rounded-2xl border border-border bg-secondary/40 p-5">
                <div className="mb-2.5 flex items-baseline justify-between">
                  <h3 className="text-[13px] font-extrabold uppercase tracking-[0.1em] text-muted-foreground">📍 Ubicación</h3>
                  <button type="button" onClick={() => irA(1)} className="text-[13px] font-extrabold text-gold hover:brightness-110">Editar</button>
                </div>
                {[["Domicilio", "domicilio"], ["Localidad", "localidad"], ["Provincia", "provincia"], ["País", "pais"]].map(([l, k]) => (
                  <div key={k} className="flex items-baseline justify-between gap-4 border-b border-dashed border-border py-2 text-[15px] last:border-b-0">
                    <span className="font-bold text-muted-foreground">{l}</span>{sumVal(k)}
                  </div>
                ))}
              </div>

              {/* Contacto */}
              <div className="rounded-2xl border border-border bg-secondary/40 p-5">
                <div className="mb-2.5 flex items-baseline justify-between">
                  <h3 className="text-[13px] font-extrabold uppercase tracking-[0.1em] text-muted-foreground">📞 Contacto</h3>
                  <button type="button" onClick={() => irA(2)} className="text-[13px] font-extrabold text-gold hover:brightness-110">Editar</button>
                </div>
                {[["Teléfono", "telefono"], ["Transporte", "transporte"], ["Notas", "observaciones"]].map(([l, k]) => (
                  <div key={k} className="flex items-baseline justify-between gap-4 border-b border-dashed border-border py-2 text-[15px] last:border-b-0">
                    <span className="font-bold text-muted-foreground">{l}</span>{sumVal(k)}
                  </div>
                ))}
              </div>

              {/* Presentación */}
              <div className="rounded-2xl border border-border bg-secondary/40 p-5 lg:col-span-2">
                <div className="mb-2.5 flex items-baseline justify-between">
                  <h3 className="text-[13px] font-extrabold uppercase tracking-[0.1em] text-muted-foreground">📦 Presentación</h3>
                  <button type="button" onClick={() => irA(3)} className="text-[13px] font-extrabold text-gold hover:brightness-110">Editar</button>
                </div>
                <div className="flex items-baseline justify-between gap-4 border-b border-dashed border-border py-2 text-[15px]">
                  <span className="font-bold text-muted-foreground">Producto</span>
                  {filled("producto") ? <Sum>{val("producto")}{filled("volumen_cantidad") ? ` · ${val("volumen_cantidad")} ${val("volumen_unidad")}`.trimEnd() : ""}</Sum> : <Sum vacio>—</Sum>}
                </div>
                <div className="flex items-baseline justify-between gap-4 border-b border-dashed border-border py-2 text-[15px]">
                  <span className="font-bold text-muted-foreground">Envase</span>
                  {filled("envase") || filled("envase_codificado") || filled("ubicacion") ? (
                    <span className="text-right text-[16.5px] font-extrabold text-foreground">
                      {val("envase") || "—"}
                      {(filled("envase_codificado") || filled("ubicacion")) && (
                        <span className="text-gold"> · {[val("envase_codificado") || null, filled("ubicacion") ? `Ubic. ${val("ubicacion")}` : null].filter(Boolean).join(" · ")}</span>
                      )}
                    </span>
                  ) : <Sum vacio>—</Sum>}
                </div>
                <div className="flex items-baseline justify-between gap-4 py-2 text-[15px]">
                  <span className="font-bold text-muted-foreground">Especificaciones</span>
                  {filled("lamina") || filled("alto") || filled("cilindro") || filled("cierre") ? (
                    <Sum>
                      {[
                        filled("lamina") ? `Lámina ${val("lamina")}` : null,
                        filled("alto") ? `Alto ${val("alto")}` : null,
                        filled("cilindro") ? `Cil. ø ${val("cilindro")}` : null,
                        filled("cierre") ? `Cierre ${val("cierre")} (int)` : null,
                      ].filter(Boolean).join(" · ")}
                    </Sum>
                  ) : <Sum vacio>—</Sum>}
                </div>
              </div>
            </div>
          )}
          </div>
        </div>

        {/* ── Footer de navegación ── */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border px-7 py-4 sm:px-9">
          <span className="text-[15px] font-extrabold text-muted-foreground">
            Paso <span className="text-foreground">{paso + 1}</span> de {PASOS.length}
          </span>
          <div className="flex flex-wrap items-center gap-2.5">
            {paso > 0 && !esUltimo && (
              <button type="button" onClick={avanzar} className="h-[52px] rounded-xl px-4 text-[15.5px] font-extrabold text-muted-foreground transition-colors hover:text-foreground">
                Omitir este paso
              </button>
            )}
            <button
              type="button"
              onClick={() => irA(Math.max(paso - 1, 0))}
              disabled={paso === 0}
              className="inline-flex h-[52px] items-center gap-2 rounded-xl border-[1.5px] border-border px-6 text-[16.5px] font-extrabold text-foreground transition-colors hover:bg-muted/40 disabled:pointer-events-none disabled:opacity-35"
            >
              <ChevronLeft className="h-5 w-5" /> Atrás
            </button>
            {!esUltimo ? (
              <button type="button" onClick={avanzar} className="inline-flex h-[52px] items-center gap-2 rounded-xl bg-gold px-7 text-[16.5px] font-extrabold text-gold-foreground transition hover:brightness-95">
                Continuar <ChevronRight className="h-5 w-5" />
              </button>
            ) : (
              <button type="button" onClick={handleSave} disabled={saving} className="inline-flex h-[52px] items-center gap-2 rounded-xl bg-gold px-7 text-[16.5px] font-extrabold text-gold-foreground transition hover:brightness-95 disabled:opacity-60">
                {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />} Crear cliente
              </button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
