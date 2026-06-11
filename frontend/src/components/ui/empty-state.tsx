"use client"

import { type ReactNode } from "react"

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

/**
 * Estado vacío reutilizable: ícono + título + descripción + acción opcional.
 * Estilo del tema (card translúcida, ícono en cápsula muted).
 */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card/80 px-6 py-16 text-center ${className ?? ""}`}
    >
      {icon && (
        <div className="rounded-2xl border border-border bg-muted/50 p-5 text-muted-foreground">
          {icon}
        </div>
      )}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && (
        <p className="max-w-sm text-xs text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}
