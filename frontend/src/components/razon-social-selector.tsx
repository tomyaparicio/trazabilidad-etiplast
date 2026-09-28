"use client"

/**
 * Buscador de razón social: buscar una del catálogo o crearla.
 *
 * Es UNO solo para toda la app (alta de cliente, ficha y borrado de razones
 * sociales). Había dos copias y la vieja, la de la ficha, guardaba la empresa
 * elegida antes aunque en pantalla ya se leyera otra: se arreglaba en una y la
 * otra seguía rota.
 *
 * «Crear» es por donde entraron los duplicados de producción («Megaton» y
 * «Megaton SAS», «Isacer» e «Isacer SAS»): la búsqueda filtra con ILIKE %texto%,
 * así que el nombre con la sociedad al final no encuentra a la que ya existe.
 * Por eso acá, antes de crear, se pregunta «¿es alguna de estas?» (/similares) y
 * ninguna respuesta que llega tarde puede pisar lo que el usuario eligió después.
 */

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Loader2, Plus } from "lucide-react"
import { api } from "@/lib/api"
import type { RazonSocial, RazonSocialSimilar } from "@/types/database"
import { Input } from "@/components/ui/input"

/** Lo mínimo de una razón social para volver a elegirla sin buscarla. */
export type RazonSocialElegida = Pick<RazonSocial, "id" | "razon_social" | "cuit" | "numero">

/** Qué decirle al usuario cuando quiere seguir con texto escrito sin haber
 *  elegido ninguna. Uno solo, para que diga lo mismo en todas las pantallas. */
export const AVISO_RAZON_SOCIAL_PENDIENTE =
  "Elegí la razón social de la lista o tocá «Crear». Si no tiene, borrá el texto."

/** El mismo nombre salvo mayúsculas y espacios de más: en pantalla se lee igual.
 *  Es la regla con la que el backend rechaza un nombre repetido, y por eso se
 *  comparte con las otras pantallas que crean razones sociales: si acá fuera más
 *  laxa, se ofrecería «crearla igual» para algo que el servidor rechaza siempre. */
export const claveNombre = (t: string) => t.trim().replace(/\s+/g, " ").toLowerCase()

// Estilos: el grande es el del alta (letra grande para usuarios mayores); el
// compacto, el de la ficha, donde convive con campos chicos.
const ESTILOS = {
  normal: {
    input: "h-14 rounded-xl border-[1.5px] bg-input border-border text-[17px] font-semibold text-foreground placeholder:font-normal placeholder:text-muted-foreground focus-visible:border-gold focus-visible:ring-gold/15",
    lista: "mt-1.5 max-h-60",
    item: "",
    nombre: "text-[15px] font-semibold text-foreground",
    cuit: "text-[12.5px] text-muted-foreground",
    crear: "py-3 text-[15px] font-semibold",
    icono: "w-4 h-4",
  },
  compacto: {
    input: "h-9 rounded-lg bg-input border-border text-sm focus-visible:border-gold/40 focus-visible:ring-gold/10",
    lista: "mt-1 max-h-52",
    item: "text-sm",
    nombre: "font-semibold text-foreground",
    cuit: "text-xs text-muted-foreground",
    crear: "py-2.5 text-sm",
    icono: "w-3.5 h-3.5",
  },
}

/** Lo que muestra la lista: SIEMPRE junto al texto del que salió (`de`). Sin eso
 *  no se sabe si lo que se ve es de lo que está escrito ahora o de dos teclas
 *  atrás, y «Crear» aparecía encima de resultados viejos. */
type Busqueda = { de: string | null; estado: "ok" | "error"; items: RazonSocial[] }

export function RazonSocialSelector({
  value,
  valorRs,
  onChange,
  excluirId,
  onCrear,
  listaEnLinea = false,
  compacto = false,
  onPendiente,
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
  /** Versión chica, para formularios de campos chicos (la ficha del cliente). */
  compacto?: boolean
  /** Avisa `true` cuando en el campo hay texto pero ninguna razón social elegida
   *  (ni de la lista ni una «nueva» con «Crear»), y `false` cuando se elige una o
   *  el campo queda vacío. Sin esto, quien guarda no se entera: el texto que se
   *  ve en pantalla no es lo que se guarda (se guarda «sin razón social»). */
  onPendiente?: (pendiente: boolean) => void
}) {
  const [query, setQuery] = useState(value)
  // `de: null` = todavía no se buscó nada. Arrancar como si los resultados fueran
  // del texto que hay haría aparecer «Crear» antes de la primera búsqueda.
  const [busqueda, setBusqueda] = useState<Busqueda>({ de: null, estado: "ok", items: [] })
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [consultando, setConsultando] = useState(false)
  // Las que pueden ser la misma empresa, preguntadas al tocar «Crear». Van con el
  // nombre que se preguntó: si sigue escribiendo, dejan de tener que ver.
  const [similares, setSimilares] = useState<{ de: string; items: RazonSocialSimilar[] } | null>(null)
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
  // Lo último avisado por onPendiente: se avisa sólo cuando cambia, no en cada tecla.
  // Arranca en false: al montar, el texto que haya es el de lo ya elegido.
  const pendienteAvisado = useRef(false)
  // Cuál fue la última búsqueda pedida y la última decisión tomada. Las respuestas
  // vuelven en cualquier orden: las viejas se tiran en vez de pisar lo de ahora.
  const ultimaBusqueda = useRef(0)
  const ultimaDecision = useRef(0)
  // Si el diálogo se cerró mientras iba y venía un pedido, no se toca más nada.
  const montado = useRef(true)
  useEffect(() => {
    montado.current = true
    return () => { montado.current = false }
  }, [])

  const avisarPendiente = (texto: string) => {
    const pendiente = texto.trim() !== "" && elegido.current == null
    if (pendiente === pendienteAvisado.current) return
    pendienteAvisado.current = pendiente
    onPendiente?.(pendiente)
  }

  useEffect(() => {
    if (!open) return
    const texto = query
    const t = setTimeout(async () => {
      const mia = ++ultimaBusqueda.current
      // También al abrir con el campo vacío: así el listado sin filtro es una
      // búsqueda más y no puede pisar a la que sí tiene texto (antes la pedía el
      // onFocus por su cuenta y llegaba después, borrando lo filtrado).
      const parametros = texto.trim() ? { search: texto, per_page: 15 } : { per_page: 15 }
      try {
        const res = await api.razonessociales.list(parametros)
        if (!montado.current || mia !== ultimaBusqueda.current) return
        setBusqueda({ de: texto, estado: "ok", items: res.data })
      } catch {
        if (!montado.current || mia !== ultimaBusqueda.current) return
        // Sin saber qué hay cargado no se puede ofrecer «Crear»: se avisa y listo.
        setBusqueda({ de: texto, estado: "error", items: [] })
      }
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

  // Mientras se pregunta o se crea, la pantalla no acepta cambiar de decisión.
  const ocupado = creating || consultando

  const handleSelect = (rs: RazonSocialElegida) => {
    // Con un alta en curso NO se cambia de empresa: la que se está creando se
    // guarda igual, así que cambiar acá dejaría en la base una razón social con
    // su N° consumido que nadie pidió. Los items ya van deshabilitados: esto es
    // el cinturón por si entra un clic igual (tecla, doble clic, etc.).
    if (ocupado) return
    // Elegir es una decisión: lo que esté creándose desde antes ya no vale.
    ultimaDecision.current++
    setQuery(rs.razon_social)
    setOpen(false)
    setSimilares(null)
    elegido.current = { nombre: rs.razon_social, rs }
    onChange(rs.id, rs.razon_social, rs.cuit, rs.numero)
    avisarPendiente(rs.razon_social)
  }

  /** Da de alta la razón social (o avisa el nombre, en el modo `onCrear`).
   *  `crearIgual` es el «no, es otra empresa» después de ver las parecidas. */
  const crear = async (nombre: string, crearIgual: boolean) => {
    const mia = ++ultimaDecision.current
    if (onCrear) {
      setQuery(nombre)
      setOpen(false)
      setSimilares(null)
      elegido.current = { nombre, nueva: true }
      onCrear(nombre)
      avisarPendiente(nombre)
      return
    }
    setCreating(true)
    try {
      const rs = await api.razonessociales.create({
        razon_social: nombre,
        ...(crearIgual ? { crear_igual: true } : {}),
      })
      // Si mientras se guardaba el usuario eligió otra empresa (o se cerró la
      // pantalla), esta alta ya no manda: quedaría elegida una que no se ve.
      // Pero la razón social YA quedó creada, con su N° consumido: callarlo deja
      // una empresa de la que nadie se entera. Se avisa y se dice dónde borrarla.
      if (!montado.current || mia !== ultimaDecision.current) {
        const otra = montado.current ? elegido.current?.nombre : null
        const dondeBorrarla = "Si no la querías, borrala desde Administración › Razones sociales."
        toast.warning(
          otra && claveNombre(otra) !== claveNombre(rs.razon_social)
            ? `Se creó «${rs.razon_social}», pero quedó elegida «${otra}». ${dondeBorrarla}`
            : `Se creó «${rs.razon_social}» igual. ${dondeBorrarla}`)
        return
      }
      setQuery(rs.razon_social)
      setOpen(false)
      setSimilares(null)
      elegido.current = { nombre: rs.razon_social, rs }
      onChange(rs.id, rs.razon_social, rs.cuit, rs.numero)
      avisarPendiente(rs.razon_social)
      toast.success("Razón social creada")
    } catch (e) {
      if (!montado.current || mia !== ultimaDecision.current) return
      // Acá llega el aviso del backend cuando ya existe una con ese nombre.
      toast.error(e instanceof Error && e.message ? e.message : "No se pudo crear la razón social")
    } finally {
      if (montado.current) setCreating(false)
    }
  }

  const handleCreate = async () => {
    const nombre = query.trim()
    if (!nombre || creating || consultando) return
    setConsultando(true)
    let parecidas: RazonSocialSimilar[] = []
    try {
      const encontradas = await api.razonessociales.similares(nombre)
      if (!montado.current || query.trim() !== nombre) return
      // La que se está borrando no se ofrece: elegirla no sería ir a ningún lado.
      parecidas = excluirId == null ? encontradas : encontradas.filter((r) => r.id !== excluirId)
    } catch {
      // Si la consulta falla, se crea como antes: trabar el alta por no poder
      // preguntar sería peor que un duplicado, que al menos se puede arreglar.
      if (!montado.current || query.trim() !== nombre) return
    } finally {
      if (montado.current) setConsultando(false)
    }
    if (parecidas.length) {
      setSimilares({ de: nombre, items: parecidas })
      setOpen(true)
      return
    }
    await crear(nombre, false)
  }

  const visibles = excluirId == null ? busqueda.items : busqueda.items.filter((r) => r.id !== excluirId)
  // ¿Lo que se ve es de lo que está escrito AHORA? Si no, todavía se está buscando.
  const alDia = busqueda.de === query
  // Lo preguntado sigue en pie mientras no cambie lo escrito.
  const pregunta = similares && similares.de === query.trim() ? similares : null
  // Sobre TODO lo que trajo la búsqueda, incluida la excluida: si el nombre exacto
  // ya está tomado, crear otro igual no se ofrece ni siquiera al borrar.
  const exactMatch = alDia && busqueda.items.some((r) => claveNombre(r.razon_social) === claveNombre(query))
  // «Crear» sólo con la búsqueda terminada y sin nada pendiente: ofrecerlo sobre
  // resultados viejos es justo como se crearon los duplicados.
  const puedeCrear = alDia && busqueda.estado === "ok" && query.trim() !== "" && !exactMatch
  const listaAbierta = open && (visibles.length > 0 || query.trim() !== "")

  // En línea, la lista puede quedar debajo de lo visible: se la trae a la vista.
  useEffect(() => {
    if (listaEnLinea && listaAbierta) listaRef.current?.scrollIntoView({ block: "nearest" })
  }, [listaEnLinea, listaAbierta, visibles.length, pregunta])

  const estilo = compacto ? ESTILOS.compacto : ESTILOS.normal

  return (
    <div ref={ref} className="relative">
      <Input
        type="text"
        autoComplete="off"
        value={query}
        placeholder="Buscar o crear…"
        // Mientras se pregunta o se crea no se puede escribir: si cambiaba el texto
        // en ese rato, al terminar quedaba elegida la creada aunque en pantalla
        // dijera otra.
        readOnly={ocupado}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          const texto = e.target.value
          setQuery(texto)
          setOpen(true)
          // Lo que se preguntó era sobre otro nombre.
          setSimilares(null)
          const actual = elegido.current
          // Espacios o mayúsculas de más no la sueltan: se ve igual en pantalla.
          if (actual && claveNombre(texto) !== claveNombre(actual.nombre)) {
            soltado.current = actual
            elegido.current = null
            onChange(null, "")
            avisarPendiente(texto)
            return
          }
          const previo = soltado.current
          if (!actual && previo && claveNombre(texto) === claveNombre(previo.nombre)) {
            // Borró una letra y la volvió a escribir: la elección vuelve a valer.
            // Sólo con la empresa en mano; nunca adivinándola por el nombre.
            const rs = previo.rs
            if (rs) {
              elegido.current = { nombre: texto, rs }
              onChange(rs.id, rs.razon_social, rs.cuit, rs.numero)
              avisarPendiente(texto)
              return
            }
            if (previo.nueva && onCrear) {
              elegido.current = { nombre: texto, nueva: true }
              onCrear(texto.trim())
              avisarPendiente(texto)
              return
            }
          }
          if (!texto) onChange(null, "")
          avisarPendiente(texto)
        }}
        className={estilo.input}
      />
      {listaAbierta && (
        <div
          ref={listaRef}
          className={`${listaEnLinea ? "relative" : "absolute z-50 left-0 right-0 top-full"} ${estilo.lista} bg-popover border border-border rounded-xl shadow-xl overflow-hidden overflow-y-auto`}
        >
          {/* Con algo en curso la lista queda quieta, igual que el campo: elegir
              otra no cancela el guardado, sólo dejaría creada una que no se ve.
              Se dice por qué, que si no la lista parece colgada. */}
          {ocupado && (
            <p className={`px-4 py-2.5 bg-muted/40 border-b border-border text-muted-foreground flex items-center gap-2 ${estilo.item}`}>
              <Loader2 className={`${estilo.icono} animate-spin`} />
              {creating ? "Guardando… esperá a que termine." : "Revisando si ya está cargada…"}
            </p>
          )}
          {pregunta ? (
            <>
              {/* Antes de crear: lo que ya existe y puede ser la misma empresa. */}
              <p className={`px-4 py-2.5 bg-muted/40 border-b border-border font-bold text-foreground ${estilo.item}`}>
                ¿Es alguna de estas?
              </p>
              {pregunta.items.map((rs) => (
                <button
                  key={rs.id}
                  type="button"
                  onMouseDown={() => handleSelect(rs)}
                  disabled={ocupado}
                  className={`w-full text-left px-4 py-2.5 hover:bg-muted/50 flex flex-col gap-0.5 disabled:opacity-50 disabled:hover:bg-transparent ${estilo.item}`}
                >
                  <span className={estilo.nombre}>{rs.razon_social}</span>
                  <span className={estilo.cuit}>
                    {rs.numero != null ? `N° ${rs.numero}` : "Sin N°"}
                    {" · "}
                    {rs.cantidad_marcas === 1 ? "1 marca" : `${rs.cantidad_marcas} marcas`}
                    {rs.cuit ? ` · ${rs.cuit}` : ""}
                  </span>
                </button>
              ))}
              <button
                type="button"
                onMouseDown={() => crear(pregunta.de, true)}
                disabled={ocupado}
                className={`w-full text-left px-4 hover:bg-emerald-500/10 text-emerald-400 flex items-center gap-2 border-t border-border ${estilo.crear}`}
              >
                {creating ? <Loader2 className={`${estilo.icono} animate-spin`} /> : <Plus className={estilo.icono} />}
                No, es otra empresa: crear &ldquo;{pregunta.de}&rdquo;
              </button>
            </>
          ) : (
            <>
              {visibles.map((rs) => (
                <button
                  key={rs.id}
                  type="button"
                  onMouseDown={() => handleSelect(rs)}
                  disabled={ocupado}
                  className={`w-full text-left px-4 py-2.5 hover:bg-muted/50 flex flex-col gap-0.5 disabled:opacity-50 disabled:hover:bg-transparent ${estilo.item}`}
                >
                  <span className={estilo.nombre}>{rs.razon_social}</span>
                  {rs.cuit && <span className={estilo.cuit}>{rs.cuit}</span>}
                </button>
              ))}
              {!alDia && query.trim() !== "" && (
                <p className={`px-4 py-2.5 text-muted-foreground flex items-center gap-2 ${estilo.item}`}>
                  <Loader2 className={`${estilo.icono} animate-spin`} /> Buscando…
                </p>
              )}
              {alDia && busqueda.estado === "error" && (
                <p className={`px-4 py-2.5 text-destructive ${estilo.item}`}>
                  No se pudo buscar. Revisá la conexión y probá de nuevo.
                </p>
              )}
              {puedeCrear && (
                <button
                  type="button"
                  onMouseDown={handleCreate}
                  disabled={ocupado}
                  className={`w-full text-left px-4 hover:bg-emerald-500/10 text-emerald-400 flex items-center gap-2 border-t border-border ${estilo.crear}`}
                >
                  {ocupado ? <Loader2 className={`${estilo.icono} animate-spin`} /> : <Plus className={estilo.icono} />}
                  Crear &ldquo;{query.trim()}&rdquo;
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
