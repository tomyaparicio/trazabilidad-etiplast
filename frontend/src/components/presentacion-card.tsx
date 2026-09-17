"use client"

import { Loader2, Pencil, Trash2 } from "lucide-react"

/**
 * Cómo se dibuja una presentación en todo el ERP: panel de identidad en azul de
 * marca (código, tipo y tamaño) + grilla técnica de producción al costado.
 *
 * Fuente única: la usan la ficha del cliente y el detalle de razón social. Que
 * cada pantalla dibujara lo suyo fue lo que dejó a una mostrando `ø` y a la
 * otra el número pelado.
 */

export type PresentacionDatos = {
  nombre: string | null
  volumen_cantidad?: number | null
  volumen_unidad?: string | null
  envase: string | null
  envase_codificado?: string | null
  ubicacion?: string | null
  lamina: string | null
  alto: number | null
  cilindro: number | null
  cierre: number | null
  muestra?: string | null
  impresora?: string | null
}

/** Extrae el tamaño del nombre: "Agua x 500 ml" → "500 ml"; sin " x " → null. */
export const tamanioDesdeNombre = (n?: string | null) => {
  if (!n) return null
  const p = n.split(/\s+x\s+/i)
  return p.length > 1 ? p[p.length - 1].trim() : null
}

/** El código "P-01" con el que se nombra la presentación en toda la app. */
export const codigoPresentacion = (idx: number) => `P-${String(idx + 1).padStart(2, "0")}`

export function PresentacionCard({
  presentacion, idx, onEdit, onDelete, deleting = false, disabled = false,
}: {
  presentacion: PresentacionDatos
  idx: number
  /** Sin handlers la card es de sólo lectura y no muestra la barra de acciones. */
  onEdit?: () => void
  onDelete?: () => void
  deleting?: boolean
  disabled?: boolean
}) {
  const p = presentacion
  // El tamaño sale del nombre ("Agua x 500 cc" → "500 cc"); si no, del volumen cargado.
  const nameSize = tamanioDesdeNombre(p.nombre)
  const volSize = p.volumen_cantidad != null
    ? `${p.volumen_cantidad}${p.volumen_unidad ? ` ${p.volumen_unidad}` : ""}`
    : null
  const size = nameSize ?? volSize
  const tipo = (p.nombre || "").split(/\s+x\s+/i)[0].trim()
  const code = codigoPresentacion(idx)

  // La celda Envase va SIEMPRE y concentra sus datos: nombre + código + ubicación.
  const envaseSub = [
    { label: "Código",    value: p.envase_codificado || null },
    { label: "Ubicación", value: p.ubicacion || null },
  ]
  const specs = [
    { k: "Envase", v: p.envase || "—", sub: envaseSub },
    p.lamina    && { k: "Lámina",    v: p.lamina },
    p.alto      && { k: "Alto",      v: String(p.alto) },
    // El cilindro se expresa por DIÁMETRO → se muestra con "ø".
    p.cilindro  && { k: "Cilindro",  v: `ø ${p.cilindro}` },
    // El cierre siempre es medida INTERIOR → se muestra con "(int)".
    p.cierre    && { k: "Cierre",    v: `${p.cierre} (int)` },
    p.muestra   && { k: "Muestra",   v: p.muestra },
    p.impresora && { k: "Impresora", v: p.impresora },
  ].filter(Boolean) as { k: string; v: string; sub?: { label: string; value: string | null }[] }[]

  const conAcciones = Boolean(onEdit || onDelete)

  return (
    <div className="group relative grid grid-cols-1 overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-white/15 md:grid-cols-[220px_1fr]">
      {conAcciones && (
        <div className="absolute right-3 top-3 z-10 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          {onEdit && (
            <button type="button" onClick={onEdit} disabled={disabled}
              className="grid h-8 w-8 place-items-center rounded-lg bg-card/80 text-muted-foreground backdrop-blur-sm transition-colors hover:bg-muted/60 hover:text-foreground disabled:opacity-30">
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          {onDelete && (
            <button type="button" onClick={onDelete} disabled={deleting || disabled}
              className="grid h-8 w-8 place-items-center rounded-lg bg-card/80 text-muted-foreground backdrop-blur-sm transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-30">
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
      )}

      {/* Lead: identidad de la presentación */}
      <div
        className="relative border-b border-white/10 p-5 md:border-b-0 md:border-r"
        style={{ background: "var(--color-brand)" }}
      >
        <div className="font-mono text-[12px] font-bold tracking-[0.12em] text-white/55">{code}</div>
        {size ? (
          <>
            <div className="mt-3 text-[13.5px] font-extrabold uppercase tracking-[0.2em] text-white/85">{tipo || "Producto"}</div>
            <div className="mt-0.5 text-[40px] font-extrabold leading-[0.95] tracking-tight text-white">{size}</div>
          </>
        ) : (
          <div className="mt-3 text-2xl font-extrabold leading-tight text-white">
            {p.nombre || <span className="text-base font-normal italic text-white/40">Sin nombre</span>}
          </div>
        )}
      </div>

      {/* Specs: grilla técnica de producción */}
      {specs.length > 0 ? (
        <dl className="flex h-full flex-wrap">
          {specs.map(({ k, v, sub }, i) => (
            <div key={k} className={`flex min-w-[112px] flex-1 flex-col justify-center px-5 py-3.5 ${i > 0 ? "border-l border-border" : ""}`}>
              <dt className="font-mono text-[11.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{k}</dt>
              <dd className={`mt-1.5 text-[21px] font-extrabold tabular-nums ${v === "—" ? "text-muted-foreground/40" : "text-foreground"}`}>{v}</dd>
              {sub && (
                <div className="mt-1.5 flex flex-col gap-0.5">
                  {sub.map((s) => (
                    <div key={s.label} className="flex items-baseline gap-2">
                      <span className="font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{s.label}</span>
                      <span className={`font-mono text-[14px] font-bold tracking-wide ${s.value ? "text-gold" : "text-muted-foreground/40"}`}>{s.value || "—"}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </dl>
      ) : (
        <div className="flex items-center px-6 py-6 text-[15px] italic text-muted-foreground/40">Sin especificaciones cargadas</div>
      )}
    </div>
  )
}
