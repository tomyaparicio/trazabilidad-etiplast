"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"

const nf = new Intl.NumberFormat("es-AR")

/**
 * Paginación reutilizable — fuente única del patrón (antes duplicado a mano en
 * cada tabla de listado). Se auto-oculta si hay una sola página.
 */
export function Pagination({
  page,
  perPage,
  total,
  onPageChange,
}: {
  page: number
  perPage: number
  total: number
  onPageChange: (page: number) => void
}) {
  const totalPages = Math.max(1, Math.ceil(total / perPage))
  if (totalPages <= 1) return null

  const from = (page - 1) * perPage + 1
  const to = Math.min(page * perPage, total)
  const pages = Array.from({ length: Math.min(5, totalPages) }, (_, i) =>
    page <= 3 ? i + 1 : page + i - 2,
  ).filter((p) => p >= 1 && p <= totalPages)

  return (
    <nav className="flex items-center justify-between gap-3 border-t border-border px-5 py-4" aria-label="Paginación">
      <p className="text-xs text-muted-foreground">
        Mostrando{" "}
        <span className="font-medium tabular-nums text-foreground">
          {nf.format(from)}–{nf.format(to)}
        </span>{" "}
        de <span className="font-medium tabular-nums text-foreground">{nf.format(total)}</span>
      </p>
      <div className="flex gap-1.5">
        <Button
          variant="outline" size="icon" className="h-8 w-8 rounded-lg"
          onClick={() => onPageChange(page - 1)} disabled={page === 1} aria-label="Página anterior"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        {pages.map((p) => (
          <Button
            key={p} variant="outline" size="icon"
            className={`h-8 w-8 rounded-lg text-xs tabular-nums ${p === page ? "border-brand/30 bg-brand/10 font-semibold text-brand dark:border-primary-200/30 dark:bg-primary-200/15 dark:text-primary-200" : ""}`}
            onClick={() => onPageChange(p)} aria-current={p === page ? "page" : undefined}
          >
            {p}
          </Button>
        ))}
        <Button
          variant="outline" size="icon" className="h-8 w-8 rounded-lg"
          onClick={() => onPageChange(page + 1)} disabled={page === totalPages} aria-label="Página siguiente"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </nav>
  )
}
