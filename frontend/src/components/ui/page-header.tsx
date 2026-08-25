import * as React from "react"
import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Encabezado de página estándar del dashboard: barra de acento de marca + título
 * (con ícono opcional) + subtítulo, y acciones opcionales a la derecha.
 * Fuente única del patrón — antes duplicado en cada página con `bg-brand`.
 */
export function PageHeader({
  title,
  subtitle,
  icon: Icon,
  iconClassName = "text-brand",
  actions,
  className,
}: {
  title: string
  subtitle?: string
  icon?: LucideIcon
  /** Color del ícono (default: text-brand; auditoría usa text-gold). */
  iconClassName?: string
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div className="flex items-center gap-3">
        <div className="h-6 w-1 shrink-0 rounded-full bg-brand" />
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold text-foreground">
            {Icon && <Icon className={cn("h-5 w-5", iconClassName)} />}
            {title}
          </h2>
          {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}
