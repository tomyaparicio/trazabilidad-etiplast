"use client"

/**
 * Una cobranza, dibujada de las dos maneras: celda de tabla y ficha de celular.
 *
 * ── POR QUÉ HAY UNA VISTA DE CELULAR ────────────────────────────────────────
 *
 * En 390 px la tabla tenía 797 px de contenido en un `overflow-x-auto` de
 * 342 px, y encima la columna del N° iba en `display: none` —no aparecía ni
 * deslizando—. Medido en el DOM: IMPORTE arrancaba en x=572 y ESTADO en
 * x=437, o sea que en un teléfono se veía el cliente y había que deslizar a
 * ciegas para enterarse de CUÁNTA PLATA ES, que es el dato de esta pantalla.
 *
 * La salida no puede ser achicar la letra: los usuarios de este ERP son gente
 * grande. Se hace lo mismo que ya resolvió `planificacion/_components/
 * tabla-recorrido.tsx`: debajo de `lg` la fila se lee EN VERTICAL, con el
 * importe como la cifra más grande de la ficha y sin perder ningún dato. Las
 * dos vistas salen del mismo `Cobranza` y comparten el chip de estado y los
 * botones, así que no hay dos lógicas que se puedan desincronizar.
 */

import { Pencil, Trash2 } from "lucide-react"
import type { Cobranza, EstadoCheque } from "@/lib/api/types"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  CLASE_ESTADO, ESTADOS_CHEQUE, MedioEtiqueta, claseImporte, datosCheque,
  fmtFecha, labelEstado, money,
} from "./cobranza-presentacion"

export type AccionesCobranza = {
  editable: boolean
  borrable: boolean
  onCambiar: (c: Cobranza, estado: EstadoCheque) => void
  onRechazar: (c: Cobranza) => void
  onEditar: (c: Cobranza) => void
  onBorrar: (c: Cobranza) => void
}

export function EstadoCelda({
  cobranza,
  editable,
  onCambiar,
  onRechazar,
}: {
  cobranza: Cobranza
  editable: boolean
  onCambiar: (c: Cobranza, estado: EstadoCheque) => void
  onRechazar: (c: Cobranza) => void
}) {
  // Efectivo y transferencia no tienen recorrido: la plata ya está.
  if (cobranza.medio !== "cheque") {
    return (
      <Badge
        variant="outline"
        className="px-2.5 py-1 text-[13px] font-bold border-emerald-500/35 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
      >
        Ya entró
      </Badge>
    )
  }

  const estado = cobranza.cheque_estado ?? "en_cartera"
  const ficha = (
    <Badge variant="outline" className={`px-2.5 py-1 text-[13px] font-bold ${CLASE_ESTADO[estado]}`}>
      {labelEstado(estado)}
    </Badge>
  )
  if (!editable) return ficha

  // Dos toques: se toca la ficha del estado y se elige el siguiente. Sin
  // abrir el formulario entero para mover un cheque de casillero.
  const siguientes = ESTADOS_CHEQUE.filter((e) => e.valor !== estado)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          aria-label={`Cambiar el estado del cheque (hoy: ${labelEstado(estado)})`}
          className="rounded-full outline-none transition-[filter] hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          {ficha}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[200px]">
        <DropdownMenuLabel className="text-[12px] uppercase tracking-wider text-muted-foreground">
          Pasar el cheque a
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {siguientes.map((e) => (
          <DropdownMenuItem
            key={e.valor}
            variant={e.valor === "rechazado" ? "destructive" : "default"}
            className="py-2.5 text-[15px] font-semibold"
            onSelect={() => {
              // Rechazar abre confirmación; los demás se aplican con «Deshacer»
              // en el aviso (ver `cambiarEstado` en `cobranzas-view.tsx`).
              if (e.valor === "rechazado") onRechazar(cobranza)
              else onCambiar(cobranza, e.valor)
            }}
          >
            {e.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * El N° de cheque y el banco.
 *
 * Antes iban en un solo `<p class="truncate">` dentro de una celda con
 * `max-w-[140px]` fijo, y eso cortaba el dato EN SILENCIO aunque sobrara
 * lugar: a 1440 px la tabla ni siquiera deslizaba (scrollWidth = clientWidth =
 * 1112) y 5 de 8 cheques perdían el banco — «N° 00987654 · Banco de la
 * Provincia de Córdoba» necesitaba 293 px y tenía 136.
 *
 * Ahora son dos datos sueltos en una línea que puede envolver: el N° va
 * `whitespace-nowrap` porque es un código y partirlo lo rompe; el nombre del
 * banco es prosa y envuelve entre palabras. Cuando el ancho sobra se lee en un
 * renglón, y cuando falta de verdad baja a dos — pero no se pierde nunca.
 */
export function DatosCheque({ cobranza }: { cobranza: Cobranza }) {
  const { numero, banco } = datosCheque(cobranza)
  if (!numero && !banco) return null
  return (
    <p className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 text-[13px] leading-snug text-muted-foreground">
      {numero && <span className="whitespace-nowrap">{numero}</span>}
      {numero && banco && <span aria-hidden="true">·</span>}
      {banco && <span>{banco}</span>}
    </p>
  )
}

export function AccionesFila({
  cobranza,
  editable,
  borrable,
  onEditar,
  onBorrar,
}: {
  cobranza: Cobranza
  editable: boolean
  borrable: boolean
  onEditar: (c: Cobranza) => void
  onBorrar: (c: Cobranza) => void
}) {
  if (!editable && !borrable) return null
  return (
    <div className="flex items-center justify-end gap-1">
      {editable && (
        <button
          type="button" title="Editar" aria-label={`Editar la cobranza ${cobranza.numero}`}
          onClick={(e) => { e.stopPropagation(); onEditar(cobranza) }}
          className="grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
        >
          <Pencil className="size-[18px]" />
        </button>
      )}
      {borrable && (
        <button
          type="button" title="Eliminar" aria-label={`Eliminar la cobranza ${cobranza.numero}`}
          onClick={(e) => { e.stopPropagation(); onBorrar(cobranza) }}
          className="grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-[18px]" />
        </button>
      )}
    </div>
  )
}

/**
 * La cobranza en un celular.
 *
 * El orden en que se lee: DE QUIÉN es → CUÁNTA PLATA → cómo pagó → cuándo se
 * hace efectiva → el N° de la cobranza. El importe va en `ed-figure` a 30 px,
 * que es la cifra más grande de la ficha, con el mismo color que en la tabla.
 */
export function FilaChica({ cobranza: c, acciones }: { cobranza: Cobranza; acciones: AccionesCobranza }) {
  return (
    <li className="rounded-2xl border border-border bg-card px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0 break-words text-[17px] font-extrabold leading-tight text-foreground">
          {c.cliente_nombre ?? "Sin cliente"}
        </span>
        <EstadoCelda
          cobranza={c}
          editable={acciones.editable}
          onCambiar={acciones.onCambiar}
          onRechazar={acciones.onRechazar}
        />
      </div>

      {/* La plata: el dato por el que se entra a esta pantalla. En la tabla
          quedaba a 572 px de deslizamiento; acá es lo primero que se ve. */}
      <p className={`ed-figure mt-3 text-[30px] ${claseImporte(c)}`}>{money(c.importe)}</p>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <MedioEtiqueta medio={c.medio} />
        <span className="text-[14.5px] font-semibold text-muted-foreground">
          {c.medio === "cheque"
            ? `se acredita el ${fmtFecha(c.cheque_fecha_pago)}`
            : "entra en el acto"}
        </span>
      </div>
      {c.medio === "cheque" && <DatosCheque cobranza={c} />}

      <div className="mt-3 flex items-end justify-between gap-3 border-t border-border/60 pt-3">
        <p className="min-w-0 text-[13px] font-semibold text-muted-foreground">
          <span className="font-mono font-bold text-foreground">{c.numero}</span>
          <span className="block">recibida el {fmtFecha(c.fecha)}</span>
        </p>
        <AccionesFila
          cobranza={c}
          editable={acciones.editable}
          borrable={acciones.borrable}
          onEditar={acciones.onEditar}
          onBorrar={acciones.onBorrar}
        />
      </div>
    </li>
  )
}
