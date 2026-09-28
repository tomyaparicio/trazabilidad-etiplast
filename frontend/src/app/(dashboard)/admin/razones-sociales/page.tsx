"use client"

import React, { useEffect, useState, useCallback, useRef } from "react"
import { PageContainer } from "@/components/ui/page-container"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { ApiError } from "@/lib/api/client"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/ui/page-header"
import { DataTable, type ColumnDef } from "@/components/ui/data-table"
import { ClienteNuevoDialog } from "@/app/(dashboard)/clientes/_components/cliente-nuevo-dialog"
import { RazonSocialSelector, claveNombre } from "@/components/razon-social-selector"
import type { Filtros, RazonSocialSimilar } from "@/types/database"
import Link from "next/link"
import { tamanioDesdeNombre } from "@/components/presentacion-card"
import { EmptyState } from "@/components/ui/empty-state"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import {
  Building2, Plus, Pencil, Loader2,
  Search, Boxes, AlertCircle, Eye, Trash2, X,
  ChevronLeft, ChevronRight, RefreshCw,
} from "lucide-react"

const PER_PAGE = 30
const FILTROS_VACIOS: Filtros = {
  rubros: [], provincias: [], envases: [], razones_sociales: [],
  laminas: [], ubicaciones: [], altos: [], cilindros: [],
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface RazonSocialRow {
  id: number
  numero: number | null
  razon_social: string
  cuit: string | null
  domicilio: string | null
  localidad: string | null
  provincia: string | null
  pais: string | null
  telefono: string | null
  transporte: string | null
  transporte_domicilio: string | null
  transporte_localidad: string | null
  cantidad_marcas: number
  created_at: string | null
}

interface Producto {
  id: number
  nombre: string | null
  volumen_cantidad: number | null
  volumen_unidad: string | null
  lamina: string | null
  alto: number | null
  cilindro: number | null
  cierre: number | null
  envase: string | null
}

interface MarcaDetalle {
  id: number
  id_cliente: number | null
  marca: string | null
  rubro: string | null
  productos: Producto[]
}

interface RazonSocialDetalle extends RazonSocialRow {
  marcas: MarcaDetalle[]
}

// ─── Rubro colors ────────────────────────────────────────────────────────────
const RUBRO_COLOR: Record<string, string> = {
  Agua:             "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  "Jugos-Gaseosas": "bg-orange-500/10 text-orange-400 border-orange-500/20",
  Limpieza:         "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  Agroquimicos:     "bg-red-500/10 text-red-400 border-red-500/20",
  Aceite:           "bg-amber-500/10 text-amber-400 border-amber-500/20",
}
const rubroColor = (r?: string | null) =>
  RUBRO_COLOR[r ?? ""] ?? "bg-muted/50 text-muted-foreground border-border"

/** El tamaño es lo que identifica una presentación de un vistazo:
 *  "Agua x 500 ml" → "500 ml". Sin " x " se muestra el nombre entero. */
function resumenPresentacion(p: Producto) {
  const delNombre = tamanioDesdeNombre(p.nombre)
  const delVolumen = p.volumen_cantidad != null
    ? `${p.volumen_cantidad}${p.volumen_unidad ? ` ${p.volumen_unidad}` : ""}`
    : null
  return delNombre ?? delVolumen ?? p.nombre ?? "—"
}

/** Campo del bloque "Datos de la empresa". */
function CampoRS({ label, value, onChange, full = false }: {
  label: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  full?: boolean
}) {
  return (
    <div className={`space-y-1.5 ${full ? "col-span-2" : ""}`}>
      <label className="block text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">{label}</label>
      <Input value={value} onChange={onChange}
        className="h-9 rounded-lg border-border bg-input text-sm focus-visible:border-gold/40 focus-visible:ring-gold/10" />
    </div>
  )
}

// ─── Detail dialog ────────────────────────────────────────────────────────────
function DetalleMarcasDialog({
  rs, onClose, onEdit, onAgregarMarca,
}: {
  rs: RazonSocialRow
  onClose: () => void
  onEdit: () => void
  onAgregarMarca: () => void
}) {
  const [data, setData] = useState<RazonSocialDetalle | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState("")

  const fetchDetalle = useCallback(() => {
    setLoading(true)
    setFetchError("")
    api.razonessociales.get(rs.id)
      .then((d) => setData(d as RazonSocialDetalle))
      .catch((e) => setFetchError(e instanceof Error ? e.message : "Error al cargar"))
      .finally(() => setLoading(false))
  }, [rs.id])

  useEffect(() => { fetchDetalle() }, [fetchDetalle])

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent
        showCloseButton={false}
        // Radix enfoca el primer elemento al abrir y eso dejaba el "Editar"
        // resaltado con su anillo de foco, como si estuviera apretado. El foco
        // se queda en el diálogo: Escape y el tabulado siguen funcionando.
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="flex max-h-[88vh] w-[95vw] max-w-[1100px] flex-col overflow-hidden border-border bg-card p-0"
      >

        {/* Cabecera: mismo lenguaje que el banner de las páginas — azul de marca,
            redondeado abajo, identidad grande y acciones a la derecha. */}
        <div className="bg-hero relative shrink-0 overflow-hidden rounded-b-3xl px-7 pb-7 pt-7 text-white">
          <Building2 aria-hidden className="pointer-events-none absolute -right-6 -top-10 size-48 text-white/[0.06]" strokeWidth={0.8} />
          <div className="relative flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/55">Entidad legal</p>
              <DialogTitle className="mt-1.5 font-display text-[30px] font-bold leading-[1.05] tracking-tight text-white">
                {rs.razon_social}
              </DialogTitle>
              <DialogDescription asChild>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-baseline gap-1.5 rounded-lg border border-white/20 bg-white/10 px-2.5 py-1">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/60">CUIT</span>
                    <span className="font-mono text-[13px] font-bold tabular-nums text-white">{rs.cuit || "—"}</span>
                  </span>
                  <span className="inline-flex items-baseline gap-1.5 rounded-lg border border-white/20 bg-white/10 px-2.5 py-1">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/60">N° Cliente</span>
                    <span className="font-mono text-[13px] font-bold tabular-nums text-white">{rs.numero ?? "—"}</span>
                  </span>
                  <span className="inline-flex items-center rounded-lg border border-white/20 bg-white/10 px-2.5 py-1 text-[13px] font-semibold text-white">
                    {rs.cantidad_marcas} marca{rs.cantidad_marcas !== 1 ? "s" : ""}
                  </span>
                </div>
              </DialogDescription>
            </div>
            {/* Editar y cerrar son un par: misma altura, mismo lenguaje. El anillo
                de foco del Button base es lavanda y sobre el azul se ve como un
                borde doble mal dibujado — se reemplaza por uno blanco. */}
            <div className="flex shrink-0 items-center gap-2">
              {/* Sin esta acción el usuario terminaba creando otra razón social
                  con el mismo N° de cliente, porque era el único camino visible. */}
              <Button
                onClick={onAgregarMarca}
                className="h-10 gap-2 rounded-xl border border-white/25 bg-white/10 px-4 text-sm font-semibold text-white hover:bg-white/20 focus-visible:border-white/60 focus-visible:ring-2 focus-visible:ring-white/30"
              >
                <Plus className="size-4" />Agregar marca
              </Button>
              <Button
                onClick={onEdit}
                className="h-10 gap-2 rounded-xl border border-white/25 bg-white/10 px-4 text-sm font-semibold text-white hover:bg-white/20 focus-visible:border-white/60 focus-visible:ring-2 focus-visible:ring-white/30"
              >
                <Pencil className="size-4" />Editar
              </Button>
              <DialogClose
                aria-label="Cerrar"
                className="grid size-10 place-items-center rounded-xl border border-white/25 bg-white/10 text-white transition-colors hover:bg-white/20 focus-visible:border-white/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
              >
                <X className="size-[18px]" />
              </DialogClose>
            </div>
          </div>
        </div>

        {/* Cuerpo: esto responde "¿qué marcas hace esta empresa?". La ficha
            técnica completa vive en el cliente — desde acá se salta a ella. */}
        <div className="flex-1 overflow-y-auto px-7 py-6">
          {loading ? (
            <div className="flex items-center justify-center gap-3 py-16 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />Cargando marcas…
            </div>
          ) : fetchError ? (
            <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
              <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
                <AlertCircle className="size-4 shrink-0" />{fetchError}
              </div>
              <Button variant="outline" size="sm" onClick={fetchDetalle} className="gap-1.5">
                <RefreshCw className="size-3.5" />Reintentar
              </Button>
            </div>
          ) : !data || data.marcas.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
              <div className="flex size-14 items-center justify-center rounded-2xl border border-border bg-muted/30">
                <Boxes className="size-7 opacity-30" strokeWidth={1.5} />
              </div>
              <p className="text-sm font-medium">Sin marcas vinculadas</p>
              <p className="text-xs text-muted-foreground/60">Las marcas se vinculan desde la ficha del cliente</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {data.marcas.map((marca) => (
                <Link
                  key={marca.id}
                  href={`/clientes/${marca.id}`}
                  className="group flex flex-col rounded-xl border border-border bg-muted/10 p-5 transition-colors hover:border-primary/40 hover:bg-muted/30"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-display text-[21px] font-bold leading-tight tracking-tight text-foreground">
                      {marca.marca || <span className="italic text-muted-foreground">Sin nombre</span>}
                    </h3>
                    {marca.rubro && (
                      <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${rubroColor(marca.rubro)}`}>
                        {marca.rubro}
                      </span>
                    )}
                  </div>

                  <p className="mt-1 font-mono text-[11.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    {marca.productos.length === 0
                      ? "sin presentaciones"
                      : `${marca.productos.length} presentacio${marca.productos.length === 1 ? "n" : "nes"}`}
                  </p>

                  {/* Los tamaños alcanzan para saber qué le hacemos a esta marca. */}
                  {marca.productos.length > 0 && (
                    <div className="mt-3.5 flex flex-wrap gap-1.5">
                      {marca.productos.map((prod) => (
                        <span
                          key={prod.id}
                          className="rounded-lg border border-border bg-card px-2.5 py-1 text-[13px] font-semibold text-foreground"
                        >
                          {resumenPresentacion(prod)}
                        </span>
                      ))}
                    </div>
                  )}

                  <span className="mt-4 inline-flex items-center gap-1 text-[12px] font-semibold text-muted-foreground transition-colors group-hover:text-primary-300">
                    Ver ficha completa <ChevronRight className="size-3.5" />
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Borrar ───────────────────────────────────────────────────────────────────
/** Destino de las marcas: una razón social existente, o una nueva que el backend
 *  crea recién al confirmar (así no queda suelta si se cancela, y se queda con el
 *  N° y los datos de la que se borra). */
type DestinoMarcas =
  | { tipo: "existente"; id: number; razon_social: string; numero: number | null }
  | { tipo: "nueva"; razon_social: string }

/** Qué pasa con las marcas de la razón social que se borra. */
type OpcionMarcas = "desvincular" | "mover" | "borrar"

type Historial = { ordenes: number; remitos: number; facturas: number; presupuestos: number }

const cuenta = (n: number, singular: string, plural: string) => `${n} ${n === 1 ? singular : plural}`

/** Una opción grande y clara. Es un radio de verdad (oculto a la vista): las
 *  flechas cambian de opción y el grupo es una sola parada del tabulador. */
function OpcionCard({ nombre, activa, peligro = false, titulo, detalle, onElegir }: {
  nombre: string
  activa: boolean
  peligro?: boolean
  titulo: string
  detalle: React.ReactNode
  onElegir: () => void
}) {
  const borde = activa
    ? peligro ? "border-red-500/50 bg-red-500/10" : "border-gold/60 bg-gold/10"
    : "border-border bg-muted/20 hover:bg-muted/40"
  return (
    <label
      // relative: el radio oculto queda dentro de la tarjeta y, al elegir con las
      // flechas, la tarjeta se desplaza a la vista.
      className={`relative flex w-full cursor-pointer items-start gap-3 rounded-xl border-[1.5px] px-4 py-3 text-left transition-colors has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-gold/40 ${borde}`}
    >
      <input type="radio" name={nombre} checked={activa} onChange={onElegir} className="sr-only" />
      <span aria-hidden className={`mt-1 grid size-[18px] shrink-0 place-items-center rounded-full border-2 ${
        activa ? (peligro ? "border-red-400" : "border-gold") : "border-muted-foreground/50"}`}>
        {activa && <span className={`size-2 rounded-full ${peligro ? "bg-red-400" : "bg-gold"}`} />}
      </span>
      <span className="min-w-0">
        <span className={`block text-[15px] font-bold ${peligro && activa ? "text-red-400" : "text-foreground"}`}>{titulo}</span>
        <span className="mt-0.5 block text-[13.5px] leading-snug text-muted-foreground">{detalle}</span>
      </span>
    </label>
  )
}

/** Si tiene marcas, alguien tiene que decidir qué pasa con ellas antes de borrarla:
 *  quedan sin razón social (lo más seguro, viene elegido), pasan a otra, o se borran. */
function BorrarRazonSocialDialog({ rs, onClose, onBorrada }: {
  rs: RazonSocialRow
  onClose: () => void
  onBorrada: () => void
}) {
  // Las marcas se consultan al abrir: el conteo de la fila puede estar viejo si
  // alguien sumó o movió una marca desde que se cargó la lista. Si la consulta
  // falla no se adivina: sin saber si tiene marcas no se puede borrar.
  const [marcas, setMarcas]         = useState<{ id: number; marca: string }[] | null>(null)
  const [historial, setHistorial]   = useState<Historial | null>(null)
  const [errorCarga, setErrorCarga] = useState(false)
  const [intento, setIntento]       = useState(0)
  const [opcion, setOpcion]         = useState<OpcionMarcas>("desvincular")
  const [destino, setDestino]       = useState<DestinoMarcas | null>(null)
  const [entiendo, setEntiendo]     = useState(false)

  useEffect(() => {
    api.razonessociales.get(rs.id)
      .then((d) => {
        setMarcas(d.marcas.map((m) => ({ id: m.id, marca: m.marca || "Sin nombre" })))
        setHistorial(d.historial ?? null)
        setErrorCarga(false)
      })
      .catch(() => setErrorCarga(true))
  }, [rs.id, intento])

  // Al recargar se desmonta todo el bloque de opciones: se suelta lo elegido para
  // que no quede un destino o un «Entiendo» que ya no se ven en pantalla.
  const recargar = () => {
    setMarcas(null); setErrorCarga(false); setDestino(null); setEntiendo(false)
    setIntento((n) => n + 1)
  }
  // Al salir de «pasar a otra» se suelta el destino: el buscador se desmonta y al
  // volver aparece vacío, así que no puede quedar elegida una que no se ve.
  const elegir = (o: OpcionMarcas) => {
    setOpcion(o)
    setEntiendo(false)
    if (o !== "mover") setDestino(null)
  }

  const cargando    = marcas === null && !errorCarga
  const cantidad    = marcas?.length ?? 0
  const tieneMarcas = cantidad > 0
  const plural      = cantidad !== 1
  const nombres     = (marcas ?? []).map((m) => m.marca)

  // El N° es de la razón social: las marcas toman el del destino, salvo que no
  // tenga (una nueva nunca tiene): ahí heredan el de la que se borra.
  const numeroFinal = !destino ? null
    : destino.tipo === "existente" ? (destino.numero ?? rs.numero)
    : rs.numero

  const confirmLabel = marcas === null ? "Borrar"
    : !tieneMarcas ? "Sí, borrar"
    : opcion === "mover" ? `Pasar ${plural ? "marcas" : "marca"} y borrar`
    : opcion === "borrar" ? "Borrar todo"
    : "Borrar razón social"

  const confirmDisabled = marcas === null || (tieneMarcas && (
    (opcion === "mover" && !destino) || (opcion === "borrar" && (!entiendo || !historial))))

  // Lo que el aviso mostró. El servidor sólo borra si sigue siendo exactamente eso:
  // si mientras tanto cambió una marca (por id) o se cargó una orden, lo rechaza.
  const confirmado = historial && marcas
    ? [
        marcas.map((m) => m.id).sort((a, b) => a - b).join("-"),
        historial.ordenes, historial.remitos, historial.facturas, historial.presupuestos,
      ].join(",")
    : undefined

  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => { if (!o) onClose() }}
      onOpenAutoFocus={(e) => e.preventDefault()}
      title="¿Borrar esta razón social?"
      description={
        <>
          Vas a borrar <span className="font-semibold text-foreground">«{rs.razon_social}»</span>
          {rs.numero != null && <> (N° {rs.numero})</>}.
          {marcas?.length === 0 && <> No tiene marcas asociadas.</>}
          <span className="font-semibold text-foreground"> No se puede deshacer.</span>
        </>
      }
      confirmLabel={confirmLabel}
      cancelLabel="No, volver"
      confirmDisabled={confirmDisabled}
      onConfirm={async () => {
        try {
          const res = await api.razonessociales.delete(rs.id,
            !tieneMarcas ? undefined
            : opcion === "desvincular" ? { marcas: "desvincular" }
            : opcion === "borrar" ? { marcas: "borrar", confirmado }
            : destino?.tipo === "existente" ? { moverA: destino.id }
            : { nueva: destino?.razon_social })
          // El aviso cuenta lo que hizo el servidor, no lo que se vio al abrir.
          const n = res?.marcas ?? 0
          const marcasTxt = cuenta(n, "marca", "marcas")
          toast.success(
            n > 0 && res?.accion === "mover" && res.destino
              ? `«${rs.razon_social}» borrada · ${marcasTxt} ${n === 1 ? "pasó" : "pasaron"} a «${res.destino.razon_social}»`
            : n > 0 && res?.accion === "desvincular"
              ? `«${rs.razon_social}» borrada · ${marcasTxt} ${n === 1 ? "quedó" : "quedaron"} sin razón social`
            : n > 0 && res?.accion === "borrar"
              ? `«${rs.razon_social}» borrada junto con ${marcasTxt}`
            : `«${rs.razon_social}» borrada`)
          onBorrada()
        } catch (e) {
          // Si alguien le sumó marcas mientras tanto, el servidor lo rechaza:
          // se vuelven a traer para que aparezca qué hacer con ellas.
          recargar()
          throw e
        }
      }}
    >
      {cargando && (
        <p className="flex items-center gap-2 text-[14px] text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />Revisando sus marcas…
        </p>
      )}
      {errorCarga && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3">
          <p className="text-[14px] font-semibold text-foreground">No se pudieron revisar sus marcas.</p>
          <Button variant="outline" size="sm" onClick={recargar} className="h-9 gap-1.5 rounded-lg">
            <RefreshCw className="size-3.5" />Reintentar
          </Button>
        </div>
      )}
      {tieneMarcas && (
        <div className="space-y-3">
          <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
            <p className="text-[13px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
              Tiene {cuenta(cantidad, "marca", "marcas")}
            </p>
            {nombres.length > 0 && (
              <p className="mt-1 text-[15px] font-semibold text-foreground">{nombres.join(" · ")}</p>
            )}
          </div>

          <p className="text-[15px] font-semibold text-foreground">¿Qué hacemos con {plural ? "sus marcas" : "su marca"}?</p>
          <div role="radiogroup" aria-label="Qué hacer con las marcas" className="space-y-2">
            <OpcionCard
              nombre={`marcas-${rs.id}`}
              activa={opcion === "desvincular"}
              onElegir={() => elegir("desvincular")}
              titulo={plural ? "Dejarlas sin razón social" : "Dejarla sin razón social"}
              detalle={<>
                {plural ? "Siguen" : "Sigue"} igual{rs.numero != null && <>, con el N° {rs.numero}</>} y con sus datos.
                Después {plural ? "les" : "le"} podés asignar una desde la ficha del cliente.
              </>}
            />
            <OpcionCard
              nombre={`marcas-${rs.id}`}
              activa={opcion === "mover"}
              onElegir={() => elegir("mover")}
              titulo={plural ? "Pasarlas a otra razón social" : "Pasarla a otra razón social"}
              detalle={<>{plural ? "Toman" : "Toma"} el N° de la empresa que elijas.</>}
            />
            <OpcionCard
              nombre={`marcas-${rs.id}`}
              activa={opcion === "borrar"}
              peligro
              onElegir={() => elegir("borrar")}
              titulo={plural ? "Borrar las marcas también" : "Borrar la marca también"}
              detalle={<>Se {plural ? "borran" : "borra"} {plural ? "las marcas" : "la marca"} con su historial.</>}
            />
          </div>

          {opcion === "mover" && (
            <div>
              <RazonSocialSelector
                value=""
                excluirId={rs.id}
                listaEnLinea
                onChange={(id, razonSocial, _cuit, numero) =>
                  setDestino(id == null ? null : { tipo: "existente", id, razon_social: razonSocial, numero: numero ?? null })}
                onCrear={(nombre) => setDestino({ tipo: "nueva", razon_social: nombre })}
              />
              {/* El destino se nombra siempre: es lo que se confirma, y no puede
                  depender de lo que haya quedado escrito en el buscador. */}
              {destino && (
                <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
                  {plural ? "Pasan" : "Pasa"} a{" "}
                  <span className="font-bold text-foreground">«{destino.razon_social}»</span>
                  {destino.tipo === "nueva" && <> (se crea al confirmar)</>}
                  {numeroFinal != null && (
                    <> con el <span className="font-bold text-foreground">N° {numeroFinal}</span></>
                  )}
                  {numeroFinal != null && (destino.tipo === "nueva" || destino.numero == null) && (
                    <>, el de «{rs.razon_social}»</>
                  )}
                  .{" "}
                  {destino.tipo === "nueva"
                    ? <>Se lleva también el CUIT, la dirección y el teléfono de «{rs.razon_social}».</>
                    : <>Si a «{destino.razon_social}» le falta el CUIT, la dirección o el teléfono, los toma de «{rs.razon_social}».</>}
                </p>
              )}
            </div>
          )}

          {opcion === "borrar" && (
            <div className="space-y-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
              <p className="text-[14px] font-bold text-foreground">Esto se pierde para siempre:</p>
              <ul className="list-disc space-y-0.5 pl-5 text-[14px] text-foreground">
                <li>{cuenta(cantidad, "marca", "marcas")}, con sus presentaciones</li>
                {historial && historial.ordenes > 0 && <li>{cuenta(historial.ordenes, "orden de trabajo", "órdenes de trabajo")}</li>}
                {historial && historial.remitos > 0 && <li>{cuenta(historial.remitos, "remito", "remitos")}</li>}
                {historial && historial.presupuestos > 0 && <li>{cuenta(historial.presupuestos, "presupuesto", "presupuestos")}</li>}
              </ul>
              {historial && historial.facturas > 0 && (
                <p className="text-[14px] text-foreground">
                  {historial.facturas === 1 ? "La factura no se borra" : `Las ${historial.facturas} facturas no se borran`},
                  pero {historial.facturas === 1 ? "queda" : "quedan"} <span className="font-bold">sin cliente</span>:
                  no se va a saber de quién {historial.facturas === 1 ? "era" : "eran"}.
                </p>
              )}
              <label className="flex cursor-pointer items-center gap-2.5 pt-1 text-[14px] font-semibold text-foreground">
                <input
                  type="checkbox"
                  checked={entiendo}
                  onChange={(e) => setEntiendo(e.target.checked)}
                  className="size-[18px] accent-red-500"
                />
                Entiendo que no se puede recuperar
              </label>
            </div>
          )}
        </div>
      )}
    </ConfirmDialog>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function RazonesSocialesPage() {
  const [rows, setRows]           = useState<RazonSocialRow[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState("")
  const [search, setSearch]       = useState("")
  const [page, setPage]           = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal]         = useState(0)
  const [viewRS, setViewRS]       = useState<RazonSocialRow | null>(null)
  const [nuevoOpen, setNuevoOpen] = useState(false)
  const [editRS, setEditRS]       = useState<RazonSocialRow | null>(null)
  // Alta de cliente con la razón social ya elegida, desde su propia ficha.
  const [marcaPara, setMarcaPara]  = useState<RazonSocialRow | null>(null)
  const [borrarRS, setBorrarRS]    = useState<RazonSocialRow | null>(null)
  const [filtros, setFiltros]      = useState<Filtros>(FILTROS_VACIOS)

  useEffect(() => {
    api.dashboard.filtros().then(setFiltros).catch(() => {})
  }, [])
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchRows = useCallback(async (q: string, p: number) => {
    setLoading(true); setError("")
    try {
      const res = await api.razonessociales.list({ search: q || undefined, page: p, per_page: PER_PAGE })
      setRows(res.data as RazonSocialRow[])
      setTotal(res.total)
      setTotalPages(res.total_pages)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchRows(search, page) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = (v: string) => {
    setSearch(v)
    setPage(1)
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => fetchRows(v, 1), 350)
  }

  const goToPage = (p: number) => {
    setPage(p)
    fetchRows(search, p)
  }

  const retry = () => fetchRows(search, page)

  const handleCreated = () => {
    setNuevoOpen(false)
    fetchRows(search, 1)
    setPage(1)
  }

  const handleUpdated = (rs: RazonSocialRow) => {
    setRows((prev) => prev.map((r) => (r.id === rs.id ? rs : r)))
    setEditRS(null)
    if (viewRS?.id === rs.id) setViewRS(rs)
  }

  /** En el alta dijo que la empresa que quería crear es una que ya está cargada:
   *  se cierra el alta y se le abre esa, así no tiene que ir a buscarla a mano
   *  (que es justo lo que no encontraba, y por eso estaba creando otra). */
  const abrirExistente = async (s: RazonSocialSimilar) => {
    setNuevoOpen(false)
    const enLaTabla = rows.find((r) => r.id === s.id)
    if (enLaTabla) { setViewRS(enLaTabla); return }
    try {
      const detalle = await api.razonessociales.get(s.id)
      setViewRS(detalle as RazonSocialDetalle)
    } catch {
      // Sin la ficha no hay qué abrir: al menos se deja la tabla filtrada por su
      // nombre, que es donde tiene que seguir.
      toast.info(`«${s.razon_social}»${s.numero != null ? ` (N° ${s.numero})` : ""} ya está cargada. La buscamos en la lista.`)
      handleSearch(s.razon_social)
    }
  }

  // Genera los números de página a mostrar (máx 7 botones)
  const pageNumbers = (() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
    if (page <= 4) return [1, 2, 3, 4, 5, "…", totalPages]
    if (page >= totalPages - 3) return [1, "…", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages]
    return [1, "…", page - 1, page, page + 1, "…", totalPages]
  })()

  const columns: ColumnDef<RazonSocialRow>[] = [
    {
      key: "numero",
      header: "N°",
      cellClassName: "whitespace-nowrap text-sm font-mono text-muted-foreground",
      cell: (rs) => rs.numero ?? <span className="text-muted-foreground/30">—</span>,
    },
    {
      key: "razon_social",
      header: "Razón Social",
      cell: (rs) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-muted/50 border border-border flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
            {rs.razon_social[0]?.toUpperCase()}
          </div>
          <span className="text-sm font-semibold text-foreground">{rs.razon_social}</span>
        </div>
      ),
    },
    {
      key: "cuit",
      header: "CUIT",
      cellClassName: "text-sm text-muted-foreground font-mono",
      cell: (rs) => rs.cuit || <span className="text-muted-foreground/30 text-xs">—</span>,
    },
    {
      key: "marcas",
      header: "Marcas",
      cell: (rs) => (
        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${
          rs.cantidad_marcas > 0
            ? "bg-violet-500/10 text-violet-400 border-violet-500/20"
            : "bg-muted/50 text-muted-foreground border-border"
        }`}>
          {rs.cantidad_marcas}
        </span>
      ),
    },
    {
      key: "acciones",
      header: "Acciones",
      headerClassName: "text-right",
      cellClassName: "text-right",
      cell: (rs) => (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setViewRS(rs)}
            className="h-8 rounded-lg text-xs gap-1.5 border-border text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            <Eye className="w-3.5 h-3.5" />Ver marcas
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditRS(rs)}
            className="h-8 rounded-lg text-xs gap-1.5 border-border text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            <Pencil className="w-3.5 h-3.5" />Editar
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setBorrarRS(rs)}
            title="Borrar razón social"
            aria-label="Borrar razón social"
            className="h-8 w-8 rounded-lg border-border p-0 text-muted-foreground hover:bg-red-500/10 hover:text-red-400"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      ),
    },
  ]

  return (
    <PageContainer>

      {/* Header */}
      <PageHeader
        title="Razones Sociales"
        subtitle={loading ? "Cargando…" : `${total.toLocaleString("es-AR")} entidades legales`}
        actions={
          <Button
            onClick={() => setNuevoOpen(true)}
            className="h-11 gap-2 rounded-xl bg-gold px-4 text-sm font-semibold text-gold-foreground hover:bg-gold hover:brightness-95"
          >
            <Plus className="w-4 h-4" />Nueva razón social
          </Button>
        }
      />

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Buscar por nombre, CUIT o número…"
          className="pl-9 h-10 rounded-xl bg-input border-border focus-visible:border-gold/40 focus-visible:ring-gold/10"
        />
      </div>

      {/* Tabla / Error */}
      {error ? (
        <EmptyState
          icon={<AlertCircle className="w-8 h-8" strokeWidth={1.5} />}
          title="No se pudieron cargar las razones sociales"
          description={error}
          action={
            <Button variant="outline" size="sm" onClick={retry} className="gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" />
              Reintentar
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          loading={loading}
          skeletonRows={PER_PAGE}
          keyExtractor={(r) => r.id}
          emptyIcon={<Building2 className="w-8 h-8 text-muted-foreground" strokeWidth={1.5} />}
          emptyTitle={search ? "Sin resultados para esa búsqueda" : "Sin razones sociales registradas"}
          emptyDescription={search ? "Probá con otro nombre, CUIT o número." : "Todavía no se registraron razones sociales."}
        >
          {/* Pagination footer */}
          {!loading && totalPages > 1 && (
            <div className="flex items-center justify-between gap-4 px-5 py-3.5 border-t border-border bg-muted/10 flex-wrap">

              {/* Info */}
              <p className="text-xs text-muted-foreground whitespace-nowrap">
                Página <span className="font-semibold text-foreground">{page}</span> de{" "}
                <span className="font-semibold text-foreground">{totalPages}</span>
                {" · "}{total.toLocaleString("es-AR")} registros
              </p>

              {/* Controles */}
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => goToPage(page - 1)}
                  disabled={page === 1}
                  aria-label="Página anterior"
                  className="h-8 w-8 p-0 rounded-lg border-border text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>

                {pageNumbers.map((n, i) =>
                  n === "…" ? (
                    <span key={`ellipsis-${i}`} className="w-8 text-center text-xs text-muted-foreground">…</span>
                  ) : (
                    <Button
                      key={n}
                      variant="outline"
                      size="sm"
                      onClick={() => goToPage(n as number)}
                      className={`h-8 w-8 p-0 rounded-lg text-xs border-border transition-colors ${
                        page === n
                          ? "bg-gold/10 text-gold border-gold/30 font-bold hover:bg-gold/15"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted"
                      }`}
                    >
                      {n}
                    </Button>
                  )
                )}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => goToPage(page + 1)}
                  disabled={page === totalPages}
                  aria-label="Página siguiente"
                  className="h-8 w-8 p-0 rounded-lg border-border text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </DataTable>
      )}

      {/* Detail dialog */}
      {viewRS && (
        <DetalleMarcasDialog
          rs={viewRS}
          onClose={() => setViewRS(null)}
          onEdit={() => { setEditRS(viewRS); setViewRS(null) }}
          onAgregarMarca={() => { setMarcaPara(viewRS); setViewRS(null) }}
        />
      )}

      {/* Borrar: irreversible, se confirma nombrando la razón social */}
      {borrarRS && (
        <BorrarRazonSocialDialog
          rs={borrarRS}
          onClose={() => setBorrarRS(null)}
          onBorrada={() => {
            // Si era la única fila de la última página, se vuelve a la anterior:
            // si no, quedaba «Página 3 de 2» con la tabla vacía.
            const destinoPagina = rows.length === 1 && page > 1 ? page - 1 : page
            setPage(destinoPagina)
            fetchRows(search, destinoPagina)
          }}
        />
      )}

      {/* Alta de marca con la razón social preseleccionada */}
      {marcaPara && (
        <ClienteNuevoDialog
          open
          filtros={filtros}
          razonSocialInicial={{
            id: marcaPara.id,
            razon_social: marcaPara.razon_social,
            cuit: marcaPara.cuit,
            numero: marcaPara.numero,
          }}
          onClose={() => setMarcaPara(null)}
          onCreated={() => {
            toast.success(`Marca agregada a ${marcaPara.razon_social}`)
            setMarcaPara(null)
            fetchRows(search, page)   // el contador de marcas quedó viejo
          }}
        />
      )}

      {/* Create / Edit dialog */}
      <RSDialog
        open={nuevoOpen}
        onClose={() => setNuevoOpen(false)}
        onSaved={handleCreated}
        onElegirExistente={abrirExistente}
      />
      {editRS && (
        <RSDialog
          open
          rs={editRS}
          onClose={() => setEditRS(null)}
          onSaved={handleUpdated}
        />
      )}
    </PageContainer>
  )
}

// ─── Create / Edit dialog ─────────────────────────────────────────────────────
function RSDialog({
  open, rs, onClose, onSaved, onElegirExistente,
}: {
  open: boolean
  rs?: RazonSocialRow
  onClose: () => void
  onSaved: (rs: RazonSocialRow) => void
  /** Sólo en el alta: el usuario dijo que la empresa que quería crear ya estaba
   *  cargada. La pantalla cierra el alta y le abre esa. */
  onElegirExistente?: (rs: RazonSocialSimilar) => void
}) {
  const isEdit = !!rs
  const desde = (r?: RazonSocialRow) => ({
    razon_social: r?.razon_social ?? "", cuit: r?.cuit ?? "",
    numero: r?.numero != null ? String(r.numero) : "",
    domicilio: r?.domicilio ?? "", localidad: r?.localidad ?? "", provincia: r?.provincia ?? "", pais: r?.pais ?? "", telefono: r?.telefono ?? "", transporte: r?.transporte ?? "", transporte_domicilio: r?.transporte_domicilio ?? "", transporte_localidad: r?.transporte_localidad ?? "",
  })
  const [form, setForm] = useState(desde(rs))
  const [saving, setSaving] = useState(false)
  const [consultando, setConsultando] = useState(false)
  const [error, setError] = useState("")
  // Las que pueden ser la misma empresa, preguntadas al tocar «Crear». Van con el
  // nombre que se preguntó: si lo cambia, dejan de tener que ver.
  const [similares, setSimilares] = useState<{ de: string; items: RazonSocialSimilar[] } | null>(null)

  useEffect(() => {
    setForm(desde(rs))
    setError("")
    setSimilares(null)
  }, [rs?.id, open])

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const nombre = form.razon_social.trim()
  // Lo preguntado sigue en pie mientras no cambie el nombre escrito.
  const pregunta = similares && claveNombre(similares.de) === claveNombre(nombre) ? similares : null
  // Con el MISMO nombre exacto el servidor no crea otra ni confirmando: nadie
  // podría distinguirlas en la lista. Ahí no se ofrece «crearla igual».
  const yaExisteIgual = !!pregunta?.items.some((s) => claveNombre(s.razon_social) === claveNombre(nombre))
  const ocupado = saving || consultando

  /** Las que pueden ser la misma empresa. `null` = no se pudo preguntar; ahí se
   *  crea igual, que trabar el alta por no poder preguntar es peor que un
   *  duplicado, que al menos después se arregla. */
  const pedirSimilares = async (n: string): Promise<RazonSocialSimilar[] | null> => {
    setConsultando(true)
    try {
      return await api.razonessociales.similares(n)
    } catch {
      return null
    } finally {
      setConsultando(false)
    }
  }

  const guardar = async (crearIgual: boolean) => {
    setSaving(true); setError("")
    try {
      // numero vacío = "sin número" (null), no "no lo toques": la pantalla
      // muestra el valor actual, así que lo que se ve es lo que se guarda.
      const numero = form.numero.trim() ? Number(form.numero) : null
      const body = {
        razon_social: nombre,
        cuit: form.cuit.trim() || undefined,
        numero,
        domicilio: form.domicilio.trim() || null, localidad: form.localidad.trim() || null, provincia: form.provincia.trim() || null, pais: form.pais.trim() || null, telefono: form.telefono.trim() || null, transporte: form.transporte.trim() || null, transporte_domicilio: form.transporte_domicilio.trim() || null, transporte_localidad: form.transporte_localidad.trim() || null,
      }
      const saved = isEdit
        ? await api.razonessociales.update(rs!.id, body)
        : await api.razonessociales.create({ ...body, ...(crearIgual ? { crear_igual: true } : {}) })
      toast.success(isEdit ? "Razón social actualizada" : "Razón social creada")
      setSimilares(null)
      onSaved(saved as RazonSocialRow)
    } catch (err) {
      const msg = err instanceof Error && err.message ? err.message : "No se pudo guardar la razón social"
      // 409 del alta: el servidor dice que ya hay una que puede ser la misma
      // empresa. Puede pasar aunque se haya preguntado (alguien la cargó en el
      // medio, o la consulta falló): se pregunta acá en vez de dejar un error que
      // pide confirmar algo que la pantalla no tendría dónde confirmar.
      if (!isEdit && !crearIgual && err instanceof ApiError && err.status === 409) {
        const parecidas = await pedirSimilares(nombre)
        // Si entre ellas está la del nombre exacto, no hay nada que confirmar:
        // vale el aviso del servidor, que dice que la elija de la lista.
        const hayIgual = (parecidas ?? []).some((s) => claveNombre(s.razon_social) === claveNombre(nombre))
        if (parecidas?.length && !hayIgual) {
          setSimilares({ de: nombre, items: parecidas })
          setError("")
          return
        }
      }
      setError(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nombre) { setError("La razón social es requerida"); return }
    if (ocupado || pregunta) return
    // En el alta se pregunta ANTES de crear: el buscador de arriba filtra por
    // texto, así que escribiendo «Aguas del Sur SRL» la «Aguas del Sur SA» que ya
    // está no aparece y el único camino visible es crear otra. Por ahí entraron
    // los duplicados de producción.
    if (!isEdit) {
      const parecidas = await pedirSimilares(nombre)
      if (parecidas?.length) {
        setSimilares({ de: nombre, items: parecidas })
        setError("")
        return
      }
    }
    await guardar(false)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !ocupado) onClose() }}>
      <DialogContent className="sm:max-w-[560px] max-h-[88vh] overflow-y-auto bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Building2 className="w-5 h-5 text-gold" />
            {isEdit ? "Editar razón social" : "Nueva razón social"}
          </DialogTitle>
          <DialogDescription>
            {isEdit ? `Editando: ${rs!.razon_social}` : "Completá los datos de la entidad legal."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">{error}</div>
          )}

          {/* Antes de crear: lo que ya está cargado y puede ser la misma empresa.
              Es la misma pregunta que hace el buscador de razón social; sin ella
              esta pantalla chocaba contra el 409 del servidor sin forma de
              contestarlo, y «Aguas del Sur SRL» no se podía dar de alta. */}
          {pregunta && (
            <div className="space-y-2.5 rounded-xl border-[1.5px] border-gold/50 bg-gold/10 px-4 py-3.5">
              <p className="text-[16px] font-bold text-foreground">¿Es alguna de estas?</p>
              <p className="text-[14px] leading-snug text-muted-foreground">
                {pregunta.items.length === 1
                  ? "Ya hay una razón social cargada que puede ser la misma empresa."
                  : "Ya hay razones sociales cargadas que pueden ser la misma empresa."}
                {" "}Si es esa, elegila y te abrimos su ficha.
              </p>
              <div className="space-y-1.5">
                {pregunta.items.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onElegirExistente?.(s)}
                    disabled={ocupado}
                    className="flex w-full flex-col gap-0.5 rounded-lg border border-border bg-card px-3.5 py-2.5 text-left transition-colors hover:border-gold/60 hover:bg-muted/40 disabled:opacity-50"
                  >
                    <span className="text-[15px] font-semibold text-foreground">{s.razon_social}</span>
                    <span className="text-[13px] text-muted-foreground">
                      {s.numero != null ? `N° ${s.numero}` : "Sin N°"}
                      {" · "}
                      {s.cantidad_marcas === 1 ? "1 marca" : `${s.cantidad_marcas} marcas`}
                      {s.cuit ? ` · ${s.cuit}` : ""}
                    </span>
                  </button>
                ))}
              </div>
              {yaExisteIgual ? (
                <p className="text-[14px] font-semibold leading-snug text-foreground">
                  Con ese mismo nombre no se puede crear otra: nadie podría distinguirlas en la lista.
                  Elegila de arriba, o cambiale el nombre.
                </p>
              ) : (
                <Button
                  type="button"
                  onClick={() => guardar(true)}
                  disabled={ocupado}
                  className="h-11 w-full gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-[15px] font-semibold text-emerald-400 hover:bg-emerald-500/20"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  No, es otra empresa: crearla igual
                </Button>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Razón Social <span className="text-red-400">*</span>
            </label>
            <Input autoFocus value={form.razon_social} onChange={set("razon_social")} placeholder="Aguas del Sur SA"
              className="h-10 rounded-xl bg-input border-border focus-visible:border-gold/40 focus-visible:ring-gold/15" />
          </div>

          <div className="space-y-1.5">
            <label className="block text-[11px] font-medium text-muted-foreground uppercase tracking-wider">N° de Cliente</label>
            <Input value={form.numero} onChange={set("numero")} inputMode="numeric" placeholder="226"
              className="h-10 rounded-xl bg-input border-border focus-visible:border-gold/40 focus-visible:ring-gold/15 font-mono tabular-nums" />
            <p className="text-[11px] leading-snug text-muted-foreground">
              Lo comparten todas las marcas de esta razón social y es el número con el que se las busca.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[11px] font-medium text-muted-foreground uppercase tracking-wider">CUIT</label>
            <Input value={form.cuit} onChange={set("cuit")} placeholder="30-12345678-9"
              className="h-10 rounded-xl bg-input border-border focus-visible:border-gold/40 focus-visible:ring-gold/15 font-mono" />
          </div>

          {/* Datos de la empresa: los heredan todas sus marcas, salvo las que
              tengan el suyo propio cargado. */}
          <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Datos de la empresa
              <span className="ml-1.5 normal-case tracking-normal text-muted-foreground/70">
                · los heredan sus marcas
              </span>
            </p>
            <div className="grid grid-cols-2 gap-3">
              <CampoRS label="Domicilio" value={form.domicilio} onChange={set("domicilio")} full />
              <CampoRS label="Localidad" value={form.localidad} onChange={set("localidad")} />
              <CampoRS label="Provincia" value={form.provincia} onChange={set("provincia")} />
              <CampoRS label="País" value={form.pais} onChange={set("pais")} />
              <CampoRS label="Teléfono" value={form.telefono} onChange={set("telefono")} />
              <CampoRS label="Transporte" value={form.transporte} onChange={set("transporte")} full />
              <CampoRS label="Dom. transporte" value={form.transporte_domicilio} onChange={set("transporte_domicilio")} />
              <CampoRS label="Loc. transporte" value={form.transporte_localidad} onChange={set("transporte_localidad")} />
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={ocupado} className="rounded-xl border-border">Cancelar</Button>
            {/* Con la pregunta en pantalla se contesta ahí: este botón volvería a
                preguntar lo mismo. Cambiar el nombre la saca y lo reactiva. */}
            <Button type="submit" disabled={ocupado || !nombre || !!pregunta}
              className="rounded-xl bg-gold/10 hover:bg-gold/20 text-gold border border-gold/25 gap-2">
              {ocupado && <Loader2 className="w-4 h-4 animate-spin" />}
              {consultando ? "Revisando…" : isEdit ? "Guardar cambios" : "Crear"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
