"use client"

/**
 * Cargar o editar una cobranza.
 *
 * Esto lo usa la oficina TODOS LOS DÍAS, con el cheque en la mano, así que el
 * orden de los campos sigue el orden en que se leen los datos del papel. Los
 * campos del cheque sólo existen cuando el medio es cheque: un formulario con
 * seis campos en gris que no se pueden usar es un formulario que se lee más
 * lento.
 *
 * ── POR QUÉ EL MEDIO ARRANCA EN «CHEQUE» ────────────────────────────────────
 *
 * Es el camino más largo —tres campos extra y una fecha obligatoria—, así que
 * se verificó en vez de dejarlo por inercia. En la base, 8 de las 14 cobranzas
 * cargadas son cheque (57 %) contra 3 de transferencia y 3 de efectivo, y la
 * empresa dice lo mismo: la mayoría de los clientes paga con cheque. Arrancar
 * en el medio minoritario obligaría a CAMBIARLO en el 57 % de las cargas —y a
 * completar igual los tres campos del cheque después—, que es más trabajo que
 * verlos ya abiertos.
 *
 * Lo que sí era un defecto real y se arregló acá: el formulario abría con la
 * «Fecha de pago» ya en rojo (`aria-invalid={!chequeFechaPago}`). Un campo
 * vacío que nadie tocó todavía no está mal, está vacío. Ahora el error aparece
 * cuando el usuario lo tocó y lo dejó mal, o cuando intenta guardar.
 *
 * ── DÓNDE SE MUESTRA UN ERROR DE VALIDACIÓN ─────────────────────────────────
 *
 * Al lado del campo que está mal, nunca en un aviso de la esquina: el toast
 * salía a ~1200 px del campo, el foco se quedaba en el botón «Registrar» y no
 * había ningún `aria-describedby` que atara el mensaje al campo, así que con
 * lector de pantalla no había forma de saber cuál de los seis era. Ahora el
 * mensaje va inline, atado por `aria-describedby`, y al rechazar el submit el
 * foco salta al primer campo mal — que además lo trae a la vista solo dentro
 * del área que desliza.
 */

import { useEffect, useMemo, useRef, useState, type RefObject } from "react"
import { toast } from "sonner"
import { Check, Loader2, TriangleAlert, X } from "lucide-react"
import { api } from "@/lib/api"
import type { Cobranza, EstadoCheque, MedioCobranza } from "@/lib/api/types"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Selector } from "@/components/ui/selector"
import { ClienteBuscador } from "./cliente-buscador"
import { ESTADOS_CHEQUE, MEDIOS, money } from "./cobranza-presentacion"

const hoy = () => new Date().toISOString().slice(0, 10)

/** Campos grandes: los carga gente grande, mirando un papel. */
const CAMPO = "h-12 text-[17px] font-semibold placeholder:text-foreground/70 md:text-[17px]"
const ETIQUETA = "mb-2 block text-[13px] font-bold uppercase tracking-wider text-muted-foreground"

/** Los campos que se pueden rechazar, EN EL ORDEN EN QUE SE VEN en pantalla:
 *  el foco va al primero que esté mal, y «primero» tiene que querer decir «el
 *  de más arriba», no el primero que se le ocurrió a la función de validar. */
const ORDEN_CAMPOS = ["cliente", "importe", "fecha", "cheque_fecha_pago"] as const
type CampoCobranza = (typeof ORDEN_CAMPOS)[number]
type Errores = Partial<Record<CampoCobranza, string>>

const idError = (campo: CampoCobranza) => `cob-${campo}-error`

/** El mensaje de error de un campo, pegado al campo. */
function MensajeError({
  campo,
  texto,
  arriba = false,
}: {
  campo: CampoCobranza
  texto?: string
  /** Va encima del campo en vez de debajo (ver el caso del buscador). */
  arriba?: boolean
}) {
  if (!texto) return null
  return (
    <p
      id={idError(campo)}
      role="alert"
      data-arriba={arriba || undefined}
      // `red-700` y no `text-destructive`: el token de destructive es #dc2626
      // y sobre el fondo real del diálogo en tema claro (#f6f7fb) se queda en
      // 4,51:1 — pasa AA por una centésima. Un mensaje que HAY QUE leer no
      // puede estar al borde; `red-700` lo lleva a 6,00:1 (medido en el DOM,
      // no estimado). Es además el mismo par de rojos que ya usan el importe
      // rechazado y la ficha de «Rechazados», así que el rojo de esta pantalla
      // sigue siendo uno solo.
      className={`flex items-start gap-1.5 text-[13.5px] font-bold leading-snug text-red-700 dark:text-red-300 ${
        arriba ? "mb-1.5" : "mt-1.5"
      }`}
    >
      <TriangleAlert aria-hidden="true" className="mt-px size-4 shrink-0" strokeWidth={2.2} />
      {texto}
    </p>
  )
}

export function CobranzaFormDialog({
  open,
  onOpenChange,
  cobranza,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  cobranza: Cobranza | null
  onSaved: () => void
}) {
  const [clienteId, setClienteId] = useState<number | null>(null)
  const [clienteNombre, setClienteNombre] = useState<string | null>(null)
  const [fecha, setFecha] = useState(hoy())
  const [medio, setMedio] = useState<MedioCobranza>("cheque")
  const [importe, setImporte] = useState("")
  const [observaciones, setObservaciones] = useState("")
  const [chequeNumero, setChequeNumero] = useState("")
  const [chequeBanco, setChequeBanco] = useState("")
  const [chequeFechaPago, setChequeFechaPago] = useState("")
  const [chequeEstado, setChequeEstado] = useState<EstadoCheque>("en_cartera")
  const [saving, setSaving] = useState(false)
  const [errores, setErrores] = useState<Errores>({})

  const refCliente = useRef<HTMLInputElement>(null)
  const refImporte = useRef<HTMLInputElement>(null)
  const refFecha = useRef<HTMLInputElement>(null)
  const refChequeFechaPago = useRef<HTMLInputElement>(null)
  const refs: Record<CampoCobranza, RefObject<HTMLInputElement | null>> = {
    cliente: refCliente,
    importe: refImporte,
    fecha: refFecha,
    cheque_fecha_pago: refChequeFechaPago,
  }

  useEffect(() => {
    if (!open) return
    setErrores({}) // cada apertura arranca limpia: nada está mal todavía
    if (cobranza) {
      setClienteId(cobranza.cliente_id)
      setClienteNombre(cobranza.cliente_nombre ?? null)
      setFecha(cobranza.fecha ?? hoy())
      setMedio(cobranza.medio ?? "cheque")
      setImporte(cobranza.importe != null ? String(cobranza.importe) : "")
      setObservaciones(cobranza.observaciones ?? "")
      setChequeNumero(cobranza.cheque_numero ?? "")
      setChequeBanco(cobranza.cheque_banco ?? "")
      setChequeFechaPago(cobranza.cheque_fecha_pago ?? "")
      setChequeEstado(cobranza.cheque_estado ?? "en_cartera")
    } else {
      setClienteId(null); setClienteNombre(null)
      setFecha(hoy()); setMedio("cheque"); setImporte(""); setObservaciones("")
      setChequeNumero(""); setChequeBanco(""); setChequeFechaPago(""); setChequeEstado("en_cartera")
    }
  }, [open, cobranza])

  const esCheque = medio === "cheque"
  const importeNum = useMemo(() => Number(importe.replace(",", ".")), [importe])

  /** Se olvida el error de un campo en cuanto el usuario lo toca. */
  const limpiar = (campo: CampoCobranza) =>
    setErrores((e) => (e[campo] ? { ...e, [campo]: undefined } : e))

  const revisar = (): Errores => {
    const e: Errores = {}
    if (!clienteId) e.cliente = "Elegí de qué cliente es la cobranza."
    if (!Number.isFinite(importeNum) || importeNum <= 0) e.importe = "El importe tiene que ser mayor a cero."
    if (!fecha) e.fecha = "Poné la fecha en que se recibió."
    // Un cheque sin fecha de pago no se puede agendar, y agendarlo es la razón
    // de ser de esta pantalla.
    if (esCheque && !chequeFechaPago) e.cheque_fecha_pago = "Un cheque necesita su fecha de pago."
    return e
  }

  const guardar = async () => {
    if (saving) return
    const malos = revisar()
    const primero = ORDEN_CAMPOS.find((c) => malos[c])
    if (primero) {
      setErrores(malos)
      // El foco va al campo, no se queda en el botón: además de decir CUÁL es,
      // el navegador lo trae a la vista dentro del área que desliza.
      refs[primero].current?.focus()
      return
    }
    setErrores({})

    setSaving(true)
    try {
      const body = {
        cliente_id: clienteId,
        fecha,
        medio,
        importe: importeNum,
        observaciones: observaciones.trim() || null,
        // Se mandan siempre: así, si una cobranza en cheque pasa a
        // transferencia, los datos del cheque quedan BORRADOS y no a medias.
        cheque_numero: esCheque ? (chequeNumero.trim() || null) : null,
        cheque_banco: esCheque ? (chequeBanco.trim() || null) : null,
        cheque_fecha_pago: esCheque ? chequeFechaPago : null,
        cheque_estado: esCheque ? chequeEstado : null,
      }
      if (cobranza) await api.cobranzas.update(cobranza.id, body)
      else await api.cobranzas.create(body)
      toast.success(cobranza ? "Cobranza actualizada" : "Cobranza registrada")
      onSaved()
      onOpenChange(false)
    } catch (e) {
      // El error del SERVIDOR sí va al aviso: no es de ningún campo en
      // particular y no hay a qué pegarlo.
      toast.error(e instanceof Error && e.message ? e.message : "No se pudo guardar la cobranza")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!saving) onOpenChange(o) }}>
      <DialogContent showCloseButton={false} className="w-[95vw] max-w-[680px] gap-0 overflow-hidden p-0">
        <div className="bg-brand relative overflow-hidden px-6 py-5 text-white sm:px-7">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logoSOLO.png" alt="" aria-hidden
            className="pointer-events-none absolute -right-8 -top-8 h-36 w-36 select-none object-contain opacity-[0.12] brightness-0 invert"
          />
          <div className="relative flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11.5px] font-extrabold uppercase tracking-[0.22em] text-white/75">
                {cobranza ? "Editar cobranza" : "Nueva cobranza"}
              </p>
              <DialogTitle className="font-brand mt-1 text-[26px] leading-tight text-white">
                {cobranza ? cobranza.numero : "Registrar lo que entró"}
              </DialogTitle>
              <DialogDescription className="sr-only">
                Formulario de cobranza: cliente, fecha, medio de pago e importe
              </DialogDescription>
            </div>
            <button
              type="button" onClick={() => onOpenChange(false)} aria-label="Cerrar"
              className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/25 bg-white/10 text-white transition-colors hover:bg-white/20"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-6 py-6 sm:px-7">
          <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-6">
            <div className="sm:col-span-6">
              <label className={ETIQUETA} htmlFor="cob-cliente">Cliente</label>
              {/* ARRIBA del campo, al revés que los demás: el buscador abre su
                  lista de clientes justo debajo (absolute, `top-full`), y al
                  llevarle el foco —que es lo que hace el submit rechazado— la
                  lista se desplegaba ENCIMA del mensaje y lo tapaba. Un
                  mensaje tapado no existe. Pegado al rótulo se lee igual de
                  cerca y no hay nada que lo pise. */}
              <MensajeError campo="cliente" texto={errores.cliente} arriba />
              <ClienteBuscador
                id="cob-cliente"
                inputRef={refCliente}
                invalido={!!errores.cliente}
                descritoPor={errores.cliente ? idError("cliente") : undefined}
                value={clienteId}
                nombre={clienteNombre}
                onSelect={(c) => {
                  setClienteId(c?.id ?? null); setClienteNombre(c?.marca ?? null)
                  if (c) limpiar("cliente")
                }}
              />
            </div>

            <div className="sm:col-span-2">
              <label className={ETIQUETA} htmlFor="cob-importe">Importe</label>
              <Input
                id="cob-importe" ref={refImporte} type="number" step="0.01" min="0" inputMode="decimal"
                value={importe}
                onChange={(e) => { setImporte(e.target.value); limpiar("importe") }}
                aria-invalid={!!errores.importe || undefined}
                aria-describedby={errores.importe ? idError("importe") : undefined}
                placeholder="0,00" className={CAMPO}
              />
              <MensajeError campo="importe" texto={errores.importe} />
            </div>
            <div className="sm:col-span-2">
              <label className={ETIQUETA} htmlFor="cob-fecha">Fecha en que se recibió</label>
              <Input
                id="cob-fecha" ref={refFecha} type="date" value={fecha}
                onChange={(e) => { setFecha(e.target.value); limpiar("fecha") }}
                aria-invalid={!!errores.fecha || undefined}
                aria-describedby={errores.fecha ? idError("fecha") : undefined}
                className={CAMPO}
              />
              <MensajeError campo="fecha" texto={errores.fecha} />
            </div>
            <div className="sm:col-span-2">
              {/* <span> y no <label>: el Selector es un combobox propio (botón +
                  listbox), no un control nativo al que un `for` pueda apuntar;
                  su nombre accesible va por `etiqueta`. */}
              <span className={ETIQUETA}>Medio de pago</span>
              <Selector
                opciones={MEDIOS.map((m) => ({ valor: m.valor, label: m.label }))}
                valor={medio}
                onCambio={(v) => {
                  setMedio(v as MedioCobranza)
                  // Al salir de «cheque», la fecha de pago deja de ser
                  // obligatoria: el error que quedaba colgado ya no aplica.
                  if (v !== "cheque") limpiar("cheque_fecha_pago")
                }}
                etiqueta="Medio de pago"
                className="pt-1"
              />
            </div>

            {esCheque && (
              <>
                <div className="sm:col-span-6">
                  <div className="ed-hair" />
                  <p className="mt-4 text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
                    Datos del cheque
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <label className={ETIQUETA} htmlFor="cob-cheque-num">N° de cheque</label>
                  <Input
                    id="cob-cheque-num" value={chequeNumero} autoComplete="off"
                    onChange={(e) => setChequeNumero(e.target.value)}
                    placeholder="Sin número" className={CAMPO}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={ETIQUETA} htmlFor="cob-cheque-banco">Banco</label>
                  <Input
                    id="cob-cheque-banco" value={chequeBanco} autoComplete="off"
                    onChange={(e) => setChequeBanco(e.target.value)}
                    placeholder="Banco emisor" className={CAMPO}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={ETIQUETA} htmlFor="cob-cheque-pago">
                    Fecha de pago <span className="text-destructive">*</span>
                  </label>
                  <Input
                    id="cob-cheque-pago" ref={refChequeFechaPago} type="date" value={chequeFechaPago}
                    onChange={(e) => { setChequeFechaPago(e.target.value); limpiar("cheque_fecha_pago") }}
                    // El error aparece recién cuando el campo se tocó y se
                    // dejó vacío. Antes era `aria-invalid={!chequeFechaPago}`
                    // y el formulario abría ya en rojo con todo sin tocar.
                    onBlur={() => {
                      if (!chequeFechaPago) {
                        setErrores((x) => ({ ...x, cheque_fecha_pago: "Un cheque necesita su fecha de pago." }))
                      }
                    }}
                    aria-invalid={!!errores.cheque_fecha_pago || undefined}
                    aria-describedby={errores.cheque_fecha_pago ? idError("cheque_fecha_pago") : undefined}
                    className={CAMPO}
                  />
                  <MensajeError campo="cheque_fecha_pago" texto={errores.cheque_fecha_pago} />
                </div>
                <div className="sm:col-span-3">
                  <span className={ETIQUETA}>Estado del cheque</span>
                  <Selector
                    opciones={ESTADOS_CHEQUE.map((e) => ({ valor: e.valor, label: e.label }))}
                    valor={chequeEstado}
                    onCambio={(v) => setChequeEstado(v as EstadoCheque)}
                    etiqueta="Estado del cheque"
                    className="pt-1"
                  />
                </div>
                <div className="sm:col-span-3 flex items-end">
                  <p className="text-[13.5px] font-medium leading-snug text-muted-foreground">
                    Hasta que no esté <span className="font-bold text-foreground">acreditado</span>,
                    el importe no cuenta como plata que entró.
                  </p>
                </div>
              </>
            )}

            {/* Lo que se va a guardar, en grande: el único número que importa. */}
            <div className="sm:col-span-6 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-card px-5 py-4">
              <span className="ed-eyebrow text-[12px]">
                {esCheque ? "Entra cuando se acredite" : "Entra ahora"}
              </span>
              <span
                className={`ed-figure text-[28px] ${
                  esCheque ? "text-amber-800 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-300"
                }`}
              >
                {money(Number.isFinite(importeNum) ? importeNum : 0)}
              </span>
            </div>

            <div className="sm:col-span-6">
              <label className={ETIQUETA} htmlFor="cob-obs">Observaciones</label>
              {/* `bg-muted` y no el hex que trae <Input>: mismo gris de campo, pero por token. */}
              <textarea
                id="cob-obs" value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={2}
                placeholder="Notas de la cobranza…"
                className="w-full resize-none rounded-[10px] border-[1.5px] border-input bg-muted px-3 py-2.5 text-[16px] font-medium outline-none transition-[color,box-shadow,background-color] placeholder:text-foreground/70 focus-visible:border-ring focus-visible:bg-card focus-visible:ring-4 focus-visible:ring-ring/15 dark:bg-white/[0.04]"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 border-t border-border px-6 py-4 sm:px-7">
          <button
            type="button" onClick={() => onOpenChange(false)} disabled={saving}
            className="h-12 rounded-xl border-[1.5px] border-border px-5 text-[15px] font-extrabold text-foreground transition-colors hover:bg-muted/40 disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            type="button" onClick={guardar} disabled={saving}
            className="inline-flex h-12 items-center gap-2 rounded-xl bg-gold px-6 text-[15px] font-extrabold text-gold-foreground transition-[filter] hover:brightness-95 disabled:opacity-60"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            {cobranza ? "Guardar cambios" : "Registrar cobranza"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
