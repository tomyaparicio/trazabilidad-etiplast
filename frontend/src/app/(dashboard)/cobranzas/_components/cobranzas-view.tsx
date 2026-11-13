"use client"

/**
 * Pantalla de cobranzas: cuánta plata entró, cuánta es todavía una promesa y
 * cuándo se hace efectiva.
 *
 * La distinción que ordena todo: efectivo y transferencia son plata YA; un
 * cheque es plata CUANDO SE ACREDITA. Acá eso se ve en tres lugares a la vez
 * —el panel de arriba, el color del importe y el estado del cheque— y nunca se
 * suman en el mismo número.
 */

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { HandCoins, Plus, RefreshCw, Search, TriangleAlert, Wallet } from "lucide-react"
import { api } from "@/lib/api"
import type {
  Cobranza, EstadoCheque, MedioCobranza,
} from "@/lib/api/types"
import { usePermisos } from "@/components/permisos-provider"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DataTable, type ColumnDef } from "@/components/ui/data-table"
import { Input } from "@/components/ui/input"
import { PageContainer } from "@/components/ui/page-container"
import { PageHeader } from "@/components/ui/page-header"
import { Pagination } from "@/components/ui/pagination"
import { Selector } from "@/components/ui/selector"
import { ClienteBuscador } from "./cliente-buscador"
import { CobranzaFormDialog } from "./cobranza-form-dialog"
import {
  AccionesFila, DatosCheque, EstadoCelda, FilaChica, type AccionesCobranza,
} from "./cobranza-fila"
import { CobranzasResumen, type EstadoResumen } from "./cobranzas-resumen"
import {
  ESTADOS_CHEQUE, MEDIOS, MedioEtiqueta, claseImporte, fmtFecha, labelEstado, money,
} from "./cobranza-presentacion"

const PER_PAGE = 20
const CAMPO = "h-12 text-[17px] font-semibold placeholder:text-foreground/70 md:text-[17px]"
const ETIQUETA = "mb-2 block text-[13px] font-bold uppercase tracking-wider text-muted-foreground"

/**
 * ¿Este cambio de estado MUEVE PLATA?
 *
 * `acreditado` es el único estado que cuenta como plata en la cuenta, así que
 * cruzar esa línea —en cualquiera de los dos sentidos— cambia los números del
 * panel de arriba. Hay que decirlo en el aviso: si no, el que toca «Acreditado»
 * ve un «listo» y no se entera de que acaba de sumar plata al mes.
 */
const moverPlata = (desde: EstadoCheque, hacia: EstadoCheque): "entra" | "sale" | null => {
  const esPlata = (e: EstadoCheque) => e === "acreditado"
  if (esPlata(hacia) && !esPlata(desde)) return "entra"
  if (!esPlata(hacia) && esPlata(desde)) return "sale"
  return null
}

export function CobranzasView() {
  const { can } = usePermisos()
  const [cobranzas, setCobranzas] = useState<Cobranza[]>([])
  const [total, setTotal] = useState(0)
  // Los tres estados del panel en UN solo objeto: `datos` y `falló` se pueden
  // dar juntos (dato viejo bueno + último intento caído) y en dos `useState`
  // separados se podían pisar entre renders.
  const [resumen, setResumen] = useState<EstadoResumen>({
    datos: null, cargando: true, falló: false, mensaje: null,
  })
  const [montoTotal, setMontoTotal] = useState(0)
  const [montoEntrado, setMontoEntrado] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [clienteId, setClienteId] = useState<number | null>(null)
  const [clienteNombre, setClienteNombre] = useState<string | null>(null)
  const [medio, setMedio] = useState<MedioCobranza | "">("")
  const [chequeEstado, setChequeEstado] = useState<EstadoCheque | "">("")
  const [desde, setDesde] = useState("")
  const [hasta, setHasta] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editar, setEditar] = useState<Cobranza | null>(null)
  const [borrar, setBorrar] = useState<Cobranza | null>(null)
  const [rechazar, setRechazar] = useState<Cobranza | null>(null)

  const fetchCobranzas = useCallback(async () => {
    setLoading(true); setError(false)
    try {
      const r = await api.cobranzas.list({
        page, per_page: PER_PAGE,
        search: search.trim() || undefined,
        cliente_id: clienteId ?? undefined,
        medio: medio || undefined,
        cheque_estado: chequeEstado || undefined,
        desde: desde || undefined,
        hasta: hasta || undefined,
      })
      setCobranzas(r.data ?? [])
      setTotal(r.total ?? 0)
      setMontoTotal(r.monto_total ?? 0)
      setMontoEntrado(r.monto_entrado ?? 0)
    } catch {
      setError(true)
      setCobranzas([])
    } finally {
      setLoading(false)
    }
  }, [page, search, clienteId, medio, chequeEstado, desde, hasta])

  /**
   * El panel va aparte del listado: los números son del total, no del filtro.
   *
   * Si falla, se conserva el último dato bueno y se MARCA que falló —igual que
   * `lib/use-tablero.ts`—. Lo que no se hace nunca más es dejar `datos` en
   * `null` y que el componente dibuje ceros: en una pantalla de plata, un cero
   * inventado se lee como un dato.
   */
  const fetchResumen = useCallback(async () => {
    setResumen((r) => ({ ...r, cargando: true }))
    try {
      const datos = await api.cobranzas.resumen()
      setResumen({ datos, cargando: false, falló: false, mensaje: null })
    } catch (e) {
      setResumen((r) => ({
        ...r,
        cargando: false,
        falló: true,
        mensaje: e instanceof Error && e.message ? e.message : null,
      }))
    }
  }, [])

  // Al tipear se espera un momento: si no, cada letra es una consulta.
  useEffect(() => {
    const t = setTimeout(fetchCobranzas, search ? 300 : 0)
    return () => clearTimeout(t)
  }, [fetchCobranzas, search])

  useEffect(() => { fetchResumen() }, [fetchResumen])

  // Al cambiar cualquier filtro se vuelve a la primera página.
  useEffect(() => { setPage(1) }, [search, clienteId, medio, chequeEstado, desde, hasta])

  const recargar = () => { fetchCobranzas(); fetchResumen() }

  /** El paso atrás del «Deshacer»: vuelve el cheque al estado que tenía. */
  const volverA = async (c: Cobranza, estado: EstadoCheque) => {
    try {
      await api.cobranzas.update(c.id, { cheque_estado: estado })
      toast.success(`${c.numero}: el cheque volvió a «${labelEstado(estado)}»`)
      recargar()
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "No se pudo deshacer el cambio")
    }
  }

  /**
   * Cambiar el estado del cheque desde la ficha, SIN confirmación pero CON
   * vuelta atrás.
   *
   * POR QUÉ ASIMÉTRICO CON «RECHAZAR» Y «ELIMINAR»: acreditar es el final
   * normal y esperado de todo cheque, pasa todos los días y a veces de a
   * varios seguidos. Ponerle un cartel de confirmación a la acción más
   * frecuente de la pantalla entrena a decir que sí sin leer, y el que se
   * gasta con eso es justo el cartel de «rechazar», que es el que de verdad
   * hay que leer. Rechazar abre un reclamo contra el cliente y eliminar borra
   * el rastro: ésos sí piden confirmación.
   *
   * Pero acreditar MUEVE PLATA (suma a «Entró este mes» y saca de «En
   * cartera»), así que no puede quedar en un «listo» y nada más: el aviso dice
   * cuánta plata se movió y ofrece «Deshacer» por 12 segundos, que es la
   * reparación barata que esta acción sí necesita.
   */
  const cambiarEstado = async (c: Cobranza, estado: EstadoCheque) => {
    const anterior = c.cheque_estado ?? "en_cartera"
    try {
      await api.cobranzas.update(c.id, { cheque_estado: estado })
      const mueve = moverPlata(anterior, estado)
      toast.success(`${c.numero}: cheque ${labelEstado(estado).toLowerCase()}`, {
        description:
          mueve === "entra"
            ? `${money(c.importe)} pasan a contar como plata que entró.`
            : mueve === "sale"
              ? `${money(c.importe)} dejan de contar como plata que entró.`
              : undefined,
        duration: 12_000,
        action: { label: "Deshacer", onClick: () => { void volverA(c, anterior) } },
      })
      recargar()
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "No se pudo cambiar el estado")
    }
  }

  const confirmarRechazo = async () => {
    if (!rechazar) return
    await api.cobranzas.update(rechazar.id, { cheque_estado: "rechazado" })
    toast.success(`${rechazar.numero}: cheque rechazado`)
    setRechazar(null)
    recargar()
  }

  const confirmarBorrado = async () => {
    if (!borrar) return
    await api.cobranzas.delete(borrar.id)
    toast.success(`Cobranza ${borrar.numero} eliminada`)
    setBorrar(null)
    recargar()
  }

  const limpiarFiltros = () => {
    setSearch(""); setClienteId(null); setClienteNombre(null)
    setMedio(""); setChequeEstado(""); setDesde(""); setHasta("")
  }
  const hayFiltros =
    !!search || clienteId != null || !!medio || !!chequeEstado || !!desde || !!hasta

  /** Lo mismo que hacen la tabla y la ficha del celular, en un solo lugar. */
  const acciones: AccionesCobranza = {
    editable: can("cobranzas:editar"),
    borrable: can("cobranzas:borrar"),
    onCambiar: cambiarEstado,
    onRechazar: setRechazar,
    onEditar: (c) => { setEditar(c); setFormOpen(true) },
    onBorrar: setBorrar,
  }

  const columns: ColumnDef<Cobranza>[] = [
    // El N° y la fecha de recepción van APILADOS en una sola columna. Con
    // texto grande, una columna por dato no entraba en 1280 con el sidebar
    // abierto y el IMPORTE —que es el dato de esta pantalla— quedaba cortado
    // contra el borde derecho. (En celular no se esconde ninguna columna:
    // abajo de `lg` esta tabla no se dibuja, se dibujan fichas.)
    {
      key: "numero", header: "N° · recibido",
      skeleton: <div className="h-4 w-20 animate-pulse rounded-full bg-muted" />,
      cell: (c) => (
        <div>
          <span className="block font-mono text-[14px] font-bold text-foreground">{c.numero}</span>
          <span className="block text-[13px] text-muted-foreground">{fmtFecha(c.fecha)}</span>
        </div>
      ),
    },
    {
      key: "cliente", header: "Cliente", cellClassName: "max-w-[168px]",
      skeleton: <div className="h-4 w-32 animate-pulse rounded-full bg-muted" />,
      cell: (c) => (
        <span className="block truncate text-[15px] font-bold text-foreground">
          {c.cliente_nombre ?? "—"}
        </span>
      ),
    },
    {
      // El tope de antes (140 px) cortaba el banco aunque la tabla tuviera
      // lugar de sobra. Éste es el techo a partir del cual el dato ENVUELVE
      // —nunca se corta, ver `DatosCheque`—, y está medido: 200 px deja los
      // bancos de nombre corto en un renglón sin robarle ancho a la columna
      // de Cliente, que sí recorta. Un techo de 280 le dejaba a Cliente 122 px
      // de los 152 que tenía, o sea cambiaba un corte en silencio por otro.
      key: "medio", header: "Medio", cellClassName: "max-w-[200px]",
      skeleton: <div className="h-4 w-24 animate-pulse rounded-full bg-muted" />,
      cell: (c) => (
        <div className="min-w-0">
          <MedioEtiqueta medio={c.medio} />
          {c.medio === "cheque" && <DatosCheque cobranza={c} />}
        </div>
      ),
    },
    {
      key: "acredita", header: "Acredita",
      skeleton: <div className="h-4 w-20 animate-pulse rounded-full bg-muted" />,
      cell: (c) =>
        c.medio === "cheque" ? (
          <span className="text-[15px] font-bold text-foreground">{fmtFecha(c.cheque_fecha_pago)}</span>
        ) : (
          <span className="text-[15px] font-medium text-muted-foreground">En el acto</span>
        ),
    },
    {
      key: "estado", header: "Estado",
      skeleton: <div className="h-7 w-24 animate-pulse rounded-full bg-muted" />,
      cell: (c) => (
        <EstadoCelda
          cobranza={c}
          editable={acciones.editable}
          onCambiar={acciones.onCambiar}
          onRechazar={acciones.onRechazar}
        />
      ),
    },
    {
      key: "importe", header: "Importe", headerClassName: "text-right",
      // `whitespace-nowrap`: un importe de siete cifras se partía en dos líneas
      // («$» arriba y el número abajo), y el dato que hay que leer de un golpe
      // dejaba de leerse de un golpe.
      cellClassName: "text-right whitespace-nowrap",
      skeleton: <div className="ml-auto h-4 w-24 animate-pulse rounded-full bg-muted" />,
      cell: (c) => (
        <span className={`ed-figure block text-right text-[19px] ${claseImporte(c)}`}>
          {money(c.importe)}
        </span>
      ),
    },
    {
      key: "acciones", header: "", cellClassName: "w-[88px]",
      skeleton: <div className="ml-auto h-9 w-20 animate-pulse rounded-lg bg-muted" />,
      cell: (c) => (
        <AccionesFila
          cobranza={c}
          editable={acciones.editable}
          borrable={acciones.borrable}
          onEditar={acciones.onEditar}
          onBorrar={acciones.onBorrar}
        />
      ),
    },
  ]

  return (
    <PageContainer>
      <PageHeader
        icon={HandCoins}
        eyebrow="Comercial"
        title="Cobranzas"
        subtitle="Lo que entró de verdad, y lo que todavía es una promesa con fecha."
        actions={
          can("cobranzas:crear") ? (
            <Button
              onClick={() => { setEditar(null); setFormOpen(true) }}
              className="h-12 gap-2 rounded-xl bg-gold px-5 text-[15px] font-bold text-gold-foreground hover:bg-gold hover:brightness-95"
            >
              <Plus className="size-5" /> Nueva cobranza
            </Button>
          ) : undefined
        }
      />

      <CobranzasResumen estado={resumen} onReintentar={fetchResumen} />

      {/* Filtros fuera de la banda azul del hero: el <Selector> propio se pinta
          con los tokens del tema (texto `foreground`), y sobre el azul de marca
          en tema claro quedaría navy sobre navy. Acá va sobre `bg-card`. */}
      <section className="ed-island overflow-visible px-5 py-5 sm:px-6">
        <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
          <div>
            <label className={ETIQUETA} htmlFor="filtro-buscar">Buscar</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground" />
              <Input
                id="filtro-buscar" type="search" autoComplete="off" value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="N° de cobranza o de cheque…"
                className={`${CAMPO} pl-11`}
              />
            </div>
          </div>
          <div>
            <label className={ETIQUETA} htmlFor="filtro-cliente">Cliente</label>
            <ClienteBuscador
              id="filtro-cliente"
              value={clienteId}
              nombre={clienteNombre}
              placeholder="Todos los clientes"
              onSelect={(c) => { setClienteId(c?.id ?? null); setClienteNombre(c?.marca ?? null) }}
            />
          </div>
          <div>
            <span className={ETIQUETA}>Medio</span>
            <Selector
              opciones={[{ valor: "", label: "Todos los medios" }, ...MEDIOS]}
              valor={medio}
              onCambio={(v) => setMedio(v as MedioCobranza | "")}
              etiqueta="Filtrar por medio de pago"
              className="pt-1"
            />
          </div>
          <div>
            <span className={ETIQUETA}>Estado del cheque</span>
            <Selector
              opciones={[{ valor: "", label: "Todos los estados" }, ...ESTADOS_CHEQUE]}
              valor={chequeEstado}
              onCambio={(v) => setChequeEstado(v as EstadoCheque | "")}
              etiqueta="Filtrar por estado del cheque"
              className="pt-1"
            />
          </div>
          <div>
            <label className={ETIQUETA} htmlFor="filtro-desde">Desde</label>
            <Input id="filtro-desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={CAMPO} />
          </div>
          <div>
            <label className={ETIQUETA} htmlFor="filtro-hasta">Hasta</label>
            <Input id="filtro-hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={CAMPO} />
          </div>
        </div>
        {/* Lo que suma el listado FILTRADO: así «cuánta plata entró de este
            cliente» se contesta con los mismos filtros, sin otra pantalla.
            Los dos números van juntos a propósito — cargado NO es entrado. */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <p className="text-[14px] font-medium text-muted-foreground">
              Cargado{" "}
              <span className="text-[16px] font-bold tabular-nums text-foreground">{money(montoTotal)}</span>
            </p>
            <p className="text-[14px] font-medium text-muted-foreground">
              Ya entró{" "}
              <span className="text-[16px] font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                {money(montoEntrado)}
              </span>
            </p>
          </div>
          {hayFiltros && (
            <Button variant="outline" onClick={limpiarFiltros} className="h-11 text-[15px] font-bold">
              Limpiar filtros
            </Button>
          )}
        </div>
      </section>

      {error ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card px-6 py-16 text-center">
          <div className="rounded-2xl border border-destructive/20 bg-destructive/10 p-4 text-destructive">
            <TriangleAlert className="size-6" strokeWidth={1.5} />
          </div>
          <p className="text-[16px] font-bold text-foreground">No se pudieron cargar las cobranzas</p>
          <p className="max-w-sm text-[14px] text-muted-foreground">
            Puede que el módulo todavía no esté publicado en el servidor. Probá de nuevo en un rato.
          </p>
          <Button onClick={recargar} variant="outline" className="mt-1 h-11 gap-2 text-[15px] font-bold">
            <RefreshCw className="size-4" /> Reintentar
          </Button>
        </div>
      ) : (
        <>
          {/* Escritorio: la tabla. Debajo de `lg` no se dibuja —ver
              `cobranza-fila.tsx` para por qué no alcanza con deslizarla—. */}
          <DataTable
            className="hidden lg:block"
            columns={columns}
            data={cobranzas}
            loading={loading}
            keyExtractor={(c) => c.id}
            emptyIcon={<Wallet className="size-8 text-muted-foreground" strokeWidth={1.5} />}
            emptyTitle="Todavía no hay cobranzas"
            emptyDescription="Cargá la primera y el panel de arriba empieza a mostrar la plata que entra."
          >
            <Pagination page={page} perPage={PER_PAGE} total={total} onPageChange={setPage} />
          </DataTable>

          {/* Celular y tablet: la misma fila, leída en vertical. */}
          <div className="lg:hidden">
            {loading ? (
              <ul className="flex flex-col gap-3" aria-busy="true" aria-label="Cargando las cobranzas">
                {Array.from({ length: 6 }).map((_, i) => (
                  <li key={i} className="rounded-2xl border border-border bg-card px-4 py-4">
                    <div className="h-4 w-40 animate-pulse rounded-full bg-muted" />
                    <div className="mt-4 h-8 w-36 animate-pulse rounded-lg bg-muted" />
                    <div className="mt-4 h-3.5 w-48 animate-pulse rounded-full bg-muted" />
                  </li>
                ))}
              </ul>
            ) : cobranzas.length === 0 ? (
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl border border-border bg-card px-5 py-4 text-[15px] font-semibold text-muted-foreground">
                <Wallet aria-hidden="true" className="size-5 shrink-0" />
                <span className="font-bold text-foreground">Todavía no hay cobranzas.</span>
                Cargá la primera y el panel de arriba empieza a mostrar la plata que entra.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {cobranzas.map((c) => (
                  <FilaChica key={c.id} cobranza={c} acciones={acciones} />
                ))}
              </ul>
            )}
            <Pagination page={page} perPage={PER_PAGE} total={total} onPageChange={setPage} />
          </div>
        </>
      )}

      <CobranzaFormDialog
        open={formOpen}
        onOpenChange={(o) => { setFormOpen(o); if (!o) setEditar(null) }}
        cobranza={editar}
        onSaved={recargar}
      />

      <ConfirmDialog
        open={!!rechazar}
        onOpenChange={(o) => { if (!o) setRechazar(null) }}
        title={rechazar ? `¿Rechazaron el cheque de ${rechazar.numero}?` : "¿Rechazaron el cheque?"}
        description={
          rechazar ? (
            <>
              <span className="font-bold text-foreground">{money(rechazar.importe)}</span> dejan de contar
              como plata por entrar y pasan a reclamo. Si el cheque se acreditó, no lo marques acá.
            </>
          ) : undefined
        }
        confirmLabel="Sí, lo rechazaron"
        onConfirm={confirmarRechazo}
      />

      <ConfirmDialog
        open={!!borrar}
        onOpenChange={(o) => { if (!o) setBorrar(null) }}
        title={borrar ? `¿Eliminar la cobranza ${borrar.numero}?` : "¿Eliminar cobranza?"}
        description="No se puede deshacer. Si el cheque se rechazó, no la borres: marcala como rechazada y queda el rastro."
        confirmLabel="Eliminar"
        onConfirm={confirmarBorrado}
      />
    </PageContainer>
  )
}
