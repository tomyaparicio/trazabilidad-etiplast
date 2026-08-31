import * as React from "react"
import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Hero de página: banda full-bleed en azul de marca (como el hero de la web),
 * con eyebrow opcional + título grande geométrico + subtítulo + acciones.
 * Va como PRIMER hijo de <PageContainer>: los -mx/-mt cancelan el padding del
 * contenedor para llegar a full-bleed y quedar pegado al top-bar.
 */
export function PageHeader({
  title,
  subtitle,
  eyebrow,
  icon: Icon,
  // Blanco por defecto: el icono va sobre el banner azul de marca.
  iconClassName = "text-white",
  actions,
  children,
  className,
}: {
  title: React.ReactNode
  subtitle?: string
  /** Etiqueta pequeña en mayúsculas sobre el título (ej. "CARTERA", "PRODUCCIÓN"). */
  eyebrow?: string
  icon?: LucideIcon
  iconClassName?: string
  actions?: React.ReactNode
  /** Contenido extra dentro de la banda del hero (ej. un buscador). */
  children?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "bg-hero relative -mx-5 -mt-5 overflow-hidden rounded-b-3xl px-5 py-8 text-white sm:-mx-8 sm:-mt-8 sm:px-8 sm:py-9 lg:-mx-10 lg:-mt-10 lg:px-10",
        className,
      )}
    >
      {/* Watermark de marca: swirl oversized sangrando por el borde derecho,
          centrado vertical y sutil — el texto respira a la izquierda. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logoSOLO.png"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute -right-[90px] top-1/2 hidden aspect-square h-[340px] w-auto -translate-y-1/2 select-none object-contain opacity-[0.08] brightness-0 invert sm:block"
      />
      <div className="relative z-10 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">{eyebrow}</p>
          )}
          <h1 className="font-display mt-2 flex items-center gap-3 text-[30px] font-semibold leading-tight tracking-tight text-white sm:text-[38px]">
            {Icon && <Icon className={cn("h-7 w-7 shrink-0", iconClassName)} strokeWidth={1.75} />}
            {title}
          </h1>
          {subtitle && <p className="mt-2 text-sm text-white/70">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2.5">{actions}</div>}
      </div>
      {children && <div className="relative z-10 mt-6">{children}</div>}
    </div>
  )
}
