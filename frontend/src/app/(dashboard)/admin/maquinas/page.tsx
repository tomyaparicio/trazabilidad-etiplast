"use client"

import { useEffect, useState, useCallback } from "react"
import { PageContainer } from "@/components/ui/page-container"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import { PageHeader } from "@/components/ui/page-header"
import { DataTable, type ColumnDef } from "@/components/ui/data-table"
import { EmptyState } from "@/components/ui/empty-state"
import { Cog, Plus, Pencil, Trash2, Loader2, AlertTriangle } from "lucide-react"

type TipoMaquina = "impresion" | "extrusion" | "troquelado"

interface MaquinaRow {
  id: number
  nombre: string
  tipo: string
  activa: boolean
  /** Espacios de color de la hoja de papel de esta impresora. */
  ficha_colores: number | null
  /** Cuál de las dos hojas de papel imprime. `null` = la de film. */
  ficha_tipo: FichaTipo
}

type FichaTipo = "film" | "autoadhesiva" | null

const TIPOS: { value: TipoMaquina; label: string }[] = [
  { value: "impresion", label: "Impresión" },
  { value: "extrusion", label: "Extrusión" },
  { value: "troquelado", label: "Troquelado" },
]

/**
 * Las dos hojas de papel.
 *
 * NO es «cuántos colores»: es QUÉ HOJA, porque el proceso no es el mismo.
 * Venus y ReinaFlex extruden el film acá adentro, así que su hoja arranca por
 * EXTRUSIÓN. La autoadhesiva compra el material en bobina —OPP blanco, papel—
 * y no tiene nada que extrudar: su hoja arranca por MATERIAL, suma barniz y
 * laminación, y termina pidiendo el troquel en alto×largo y hacia dónde se
 * bobina.
 */
const HOJAS: { value: Exclude<FichaTipo, null>; label: string; ayuda: string }[] = [
  { value: "film", label: "Film (extrusión)",
    ayuda: "Arranca por extrusión: ancho, color, espesor y kilos por bobina. Es la de Venus y ReinaFlex." },
  { value: "autoadhesiva", label: "Autoadhesiva",
    ayuda: "Arranca por material comprado (OPP, papel). Suma barniz y laminación, y el troquel va en alto × largo." },
]

function labelTipo(t: string) {
  return TIPOS.find((x) => x.value === t)?.label ?? t
}

// ─── Crear / Editar dialog ────────────────────────────────────────────────────
function MaquinaFormDialog({
  maquina,
  onClose,
  onSaved,
}: {
  maquina: MaquinaRow | null
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!maquina
  const [nombre, setNombre] = useState(maquina?.nombre ?? "")
  const [tipo, setTipo] = useState<TipoMaquina>((maquina?.tipo as TipoMaquina) || "impresion")
  const [activa, setActiva] = useState(maquina?.activa ?? true)
  /* Texto y no number: vacío tiene que poder distinguirse de 0, y un `number`
     controlado convierte "" en NaN apenas se borra el último dígito. */
  const [colores, setColores] = useState(
    maquina?.ficha_colores != null ? String(maquina.ficha_colores) : "",
  )
  /* `null` en la base significa «la de film», que es la que el sistema venía
     imprimiendo para todas. Acá se muestra elegida para que el que edita VEA
     cuál le va a salir, en vez de un desplegable en blanco que no dice nada. */
  const [hoja, setHoja] = useState<Exclude<FichaTipo, null>>(
    maquina?.ficha_tipo ?? "film",
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const n = nombre.trim()
    if (!n) return
    setLoading(true)
    setError("")
    try {
      /* LA HOJA Y LOS COLORES SÓLO VIAJAN SI LA MÁQUINA ES UNA IMPRESORA, y
         cuando no lo es la clave NO SE MANDA — que no es lo mismo que mandarla
         en null.

         Antes se mandaban en null, y eso BORRABA el dato sin avisar: bastaba
         que el select «Tipo» se moviera sin querer —una flecha del teclado con
         el foco puesto, la rueda del mouse— para que «Impresora Autoadhesiva»
         perdiera su hoja al guardar. El formulario no decía que había una hoja
         cargada, la fila dejaba de mostrarla, y al volver a poner Impresión el
         desplegable aparecía en «film». La autoadhesiva volvía a imprimir la
         hoja de film, con la sección de extrusión que esa máquina no hace, y
         no se autocuraba: la migración que siembra el valor ya está anotada y
         no vuelve a correr.

         El PUT usa `exclude_unset`, así que omitir la clave significa «no
         toques eso». Cambiar el tipo deja de ser una forma de perder datos. */
      const hojaYColores =
        tipo === "impresion"
          ? {
              ficha_colores: colores.trim() !== "" ? Number(colores) : null,
              ficha_tipo: hoja as FichaTipo,
            }
          : {}
      if (isEdit) {
        await api.admin.maquinas.update(maquina.id, {
          nombre: n, tipo, activa, ...hojaYColores,
        })
      } else {
        await api.admin.maquinas.create({ nombre: n, tipo, ...hojaYColores })
      }
      toast.success(isEdit ? "Máquina actualizada" : "Máquina creada")
      onSaved()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al guardar"
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !loading) onClose() }}>
      <DialogContent showCloseButton={!loading} className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar máquina" : "Nueva máquina"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Las máquinas de tipo Impresión aparecen al asignar productos de clientes."
              : "Las de tipo Impresión se usan en la pestaña Productos del cliente."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 mb-1.5">Nombre</label>
            <Input autoFocus placeholder="Ej. Flexo 6 colores" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 mb-1.5">Tipo</label>
            <Select aria-label="Tipo de máquina" value={tipo} onChange={(e) => setTipo(e.target.value as TipoMaquina)}>
              {TIPOS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </Select>
          </div>
          {/* CUÁL de las dos hojas imprime. Va ANTES que los colores a
              propósito: es la pregunta grande —qué estructura tiene la ficha—
              y la de los colores es un detalle adentro de esa estructura. */}
          {tipo === "impresion" && (
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 mb-1.5">
                Hoja de la orden de trabajo
              </label>
              <Select
                aria-label="Hoja de la orden de trabajo"
                value={hoja}
                onChange={(e) => setHoja(e.target.value as Exclude<FichaTipo, null>)}
              >
                {HOJAS.map((h) => (
                  <option key={h.value} value={h.value}>{h.label}</option>
                ))}
              </Select>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {HOJAS.find((h) => h.value === hoja)?.ayuda}
              </p>
            </div>
          )}
          {/* La hoja de papel. Sólo tiene sentido en una impresora: la orden de
              trabajo de ReinaFlex trae ocho espacios de color y la de las otras
              no son iguales, así que el número vive acá —lo carga la empresa— y
              la ficha impresa lo lee. Vacío = la ficha usa su valor por defecto. */}
          {tipo === "impresion" && (
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 mb-1.5">
                Colores de la hoja
              </label>
              <Input
                type="number" min={1} max={12} placeholder="Ej. 8"
                value={colores}
                onChange={(e) => setColores(e.target.value)}
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                Cuántos espacios de color trae la orden de trabajo impresa de esta
                máquina. Si se deja vacío, la ficha usa 6.
              </p>
            </div>
          )}
          {isEdit && (
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input type="checkbox" checked={activa} onChange={(e) => setActiva(e.target.checked)} className="rounded border-border" />
              Activa
            </label>
          )}
          {error && <p className="text-sm text-red-400">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>Cancelar</Button>
            <Button type="submit" disabled={loading || !nombre.trim()}>
              {loading && <Loader2 className="size-4 animate-spin" />}
              {isEdit ? "Guardar" : "Crear"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Sacar del catálogo: el cartel ────────────────────────────────────────────
/**
 * EL CARTEL QUE NO ESTABA. Antes acá había un `ConfirmDialog` que decía «se
 * eliminará» y avisaba de una sola consecuencia: que los productos quedaban sin
 * impresora. Callaba la grave — `plan_produccion.maquina_id` es `ON DELETE
 * CASCADE`, así que borrar la máquina BORRABA los pases de producción, que son
 * el registro de por qué máquina pasó cada orden.
 *
 * Pasó en producción y no hay backup. Ahora el diálogo pregunta primero qué se
 * lleva puesto, lo dice con números, y obliga a decir a dónde pasan los
 * productos antes de dejar seguir.
 */
function EliminarMaquinaDialog({
  maquina,
  onClose,
  onDeleted,
}: {
  maquina: MaquinaRow
  onClose: () => void
  onDeleted: () => void
}) {
  const [uso, setUso] = useState<{
    productos: number
    pases: number
    destinos: { id: number; nombre: string }[]
  } | null>(null)
  const [destino, setDestino] = useState("")
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    let vigente = true
    api.admin.maquinas
      .uso(maquina.id)
      .then((u) => { if (vigente) { setUso(u); setCargando(false) } })
      .catch((e) => {
        if (!vigente) return
        setError(e instanceof Error ? e.message : "No se pudo averiguar quién la usa")
        setCargando(false)
      })
    return () => { vigente = false }
  }, [maquina.id])

  const hayProductos = (uso?.productos ?? 0) > 0
  const hayPases     = (uso?.pases ?? 0) > 0
  // Con pases NO se borra: se da de baja. El botón tiene que decir lo que hace.
  const etiqueta     = hayPases ? "Dar de baja" : "Eliminar"
  const sinDestino   = hayProductos && !destino

  const confirmar = async () => {
    if (guardando || sinDestino) return
    setGuardando(true); setError("")
    try {
      const r = await api.admin.maquinas.delete(maquina.id, destino ? Number(destino) : null)
      toast.success(
        r.dada_de_baja
          ? `${maquina.nombre} quedó dada de baja (tiene ${r.pases} pases de producción)`
          : `${maquina.nombre} eliminada`,
      )
      onDeleted()
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo sacar del catálogo")
      setGuardando(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !guardando) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sacar {maquina.nombre} del catálogo</DialogTitle>
          <DialogDescription>
            {cargando ? "Viendo quién la usa…" : "Esto es lo que se lleva puesto."}
          </DialogDescription>
        </DialogHeader>

        {cargando ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Cargando…
          </div>
        ) : (
          <div className="flex flex-col gap-4 py-1">
            {/* Lo que NO se puede reasignar, y por qué. Va primero: es lo que
                de verdad se pierde si alguien insiste en borrar. */}
            {hayPases && (
              <div className="flex gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
                <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-700 dark:text-amber-400" strokeWidth={2.2} />
                <div className="text-sm">
                  <p className="font-bold text-foreground">
                    Esta máquina NO se puede eliminar.
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    Tiene <span className="font-bold text-foreground">{uso?.pases} pase(s) de producción</span>:
                    órdenes que ya pasaron por ella. Borrarla los borraría, y ése es el
                    registro de por dónde pasó cada pedido. Se va a <span className="font-bold text-foreground">dar de baja</span>:
                    deja de aparecer para elegir y el historial queda intacto.
                  </p>
                </div>
              </div>
            )}

            {hayProductos ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-muted-foreground">
                  <span className="font-bold text-foreground">{uso?.productos} producto(s)</span> se
                  imprimen en {maquina.nombre}. No quedan sin impresora: decí a cuál pasan.
                </p>
                <label className="flex flex-col gap-1.5 text-sm font-semibold text-foreground">
                  Pasan a
                  <Select value={destino} onChange={(e) => setDestino(e.target.value)}>
                    <option value="">Elegí una máquina…</option>
                    {uso?.destinos.map((d) => (
                      <option key={d.id} value={d.id}>{d.nombre}</option>
                    ))}
                  </Select>
                </label>
                {uso?.destinos.length === 0 && (
                  <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                    No hay otra máquina activa del mismo tipo para pasarlos. Creá una primero.
                  </p>
                )}
              </div>
            ) : (
              !hayPases && (
                <p className="text-sm text-muted-foreground">
                  No la usa ningún producto ni tiene pases de producción. Se elimina y listo.
                </p>
              )
            )}

            {error && <p className="text-sm font-semibold text-red-500">{error}</p>}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={guardando}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant={hayPases ? "default" : "destructive"}
            onClick={confirmar}
            disabled={cargando || guardando || sinDestino}
          >
            {guardando && <Loader2 className="size-4 animate-spin" />}
            {etiqueta}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function AdminMaquinasPage() {
  const [maquinas, setMaquinas] = useState<MaquinaRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [filtroTipo, setFiltroTipo] = useState<"" | TipoMaquina>("")
  const [formMaquina, setFormMaquina] = useState<MaquinaRow | null | undefined>(undefined)
  const [deleteMaquina, setDeleteMaquina] = useState<MaquinaRow | null>(null)

  const fetchMaquinas = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const data = await api.admin.maquinas.list(filtroTipo || undefined)
      setMaquinas(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar máquinas")
    } finally {
      setLoading(false)
    }
  }, [filtroTipo])

  useEffect(() => { fetchMaquinas() }, [fetchMaquinas])

  const columns: ColumnDef<MaquinaRow>[] = [
    {
      key: "nombre",
      header: "Nombre",
      cell: (r) => <span className="text-sm font-medium text-foreground">{r.nombre}</span>,
    },
    {
      key: "tipo",
      header: "Tipo",
      /* En las impresoras se dice también QUÉ HOJA sale, porque es el dato que
         alguien viene a verificar acá: la ficha impresa cambia de estructura
         según esto y, sin verlo en la lista, hay que abrir cada máquina de a
         una para saber cuál quedó con cuál. */
      cell: (r) => (
        <span className="text-sm text-muted-foreground">
          {labelTipo(r.tipo)}
          {r.tipo === "impresion" && (
            <span className="block text-xs text-muted-foreground/70">
              Hoja {r.ficha_tipo === "autoadhesiva" ? "autoadhesiva" : "de film"}
              {r.ficha_colores != null && ` · ${r.ficha_colores} colores`}
            </span>
          )}
        </span>
      ),
    },
    {
      key: "activa",
      header: "Estado",
      cell: (r) => (
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${r.activa ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10" : "border-border text-muted-foreground bg-muted/30"}`}>
          {r.activa ? "Activa" : "Inactiva"}
        </span>
      ),
    },
    {
      key: "acciones",
      header: "",
      headerClassName: "text-right",
      cellClassName: "text-right",
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Editar máquina"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => setFormMaquina(r)}
          >
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Eliminar máquina"
            className="text-muted-foreground hover:text-red-400"
            onClick={() => setDeleteMaquina(r)}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      ),
    },
  ]

  return (
    <PageContainer>
      <PageHeader
        icon={Cog}
        iconClassName="text-violet-400"
        title="Máquinas"
        subtitle={`${maquinas.length} registro${maquinas.length === 1 ? "" : "s"}${filtroTipo ? ` · ${labelTipo(filtroTipo)}` : ""}`}
        actions={
          <Button onClick={() => setFormMaquina(null)} className="h-11 gap-2 rounded-xl bg-gold px-4 text-sm font-semibold text-gold-foreground hover:bg-gold hover:brightness-95">
            <Plus className="w-4 h-4" />
            Nueva máquina
          </Button>
        }
      />

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={filtroTipo === "" ? "default" : "outline"}
          size="sm"
          className={filtroTipo === "" ? "bg-brand" : ""}
          onClick={() => setFiltroTipo("")}
        >
          Todas
        </Button>
        {TIPOS.map((t) => (
          <Button
            key={t.value}
            type="button"
            variant={filtroTipo === t.value ? "default" : "outline"}
            size="sm"
            className={filtroTipo === t.value ? "bg-brand" : ""}
            onClick={() => setFiltroTipo(t.value)}
          >
            {t.label}
          </Button>
        ))}
      </div>

      {error ? (
        <EmptyState
          icon={<AlertTriangle className="w-8 h-8" strokeWidth={1.5} />}
          title="No se pudieron cargar las máquinas"
          description={error}
          action={<Button variant="outline" size="sm" onClick={fetchMaquinas}>Reintentar</Button>}
        />
      ) : (
        <DataTable
          columns={columns}
          data={maquinas}
          loading={loading}
          keyExtractor={(r) => r.id}
          emptyIcon={<Cog className="w-8 h-8 text-muted-foreground" strokeWidth={1.5} />}
          emptyTitle="Sin máquinas"
          emptyDescription={
            filtroTipo
              ? `No hay máquinas de tipo ${labelTipo(filtroTipo)}. Creá una con "Nueva máquina".`
              : 'No hay máquinas cargadas. Creá una con "Nueva máquina".'
          }
        />
      )}

      {formMaquina !== undefined && (
        <MaquinaFormDialog
          maquina={formMaquina}
          onClose={() => setFormMaquina(undefined)}
          onSaved={fetchMaquinas}
        />
      )}
      {deleteMaquina && (
        <EliminarMaquinaDialog
          maquina={deleteMaquina}
          onClose={() => setDeleteMaquina(null)}
          onDeleted={fetchMaquinas}
        />
      )}
    </PageContainer>
  )
}
