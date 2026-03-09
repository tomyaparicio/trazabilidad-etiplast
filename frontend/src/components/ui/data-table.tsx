"use client"

import { type ReactNode } from "react"
import { SearchX, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react"

export type ColumnDef<T> = {
  key: string
  header: string
  headerClassName?: string
  cellClassName?: string
  /** Skeleton placeholder mientras carga */
  skeleton?: ReactNode
  cell: (row: T) => ReactNode
  /** Si true, se puede hacer click en el header para ordenar */
  sortable?: boolean
}

type DataTableProps<T> = {
  columns: ColumnDef<T>[]
  data: T[]
  loading?: boolean
  keyExtractor: (row: T) => string | number
  onRowClick?: (row: T) => void
  emptyIcon?: ReactNode
  emptyTitle?: string
  emptyDescription?: string
  skeletonRows?: number
  className?: string
  /** Columna activa de ordenamiento */
  sortBy?: string
  /** Dirección del ordenamiento */
  sortDir?: "asc" | "desc"
  /** Callback cuando se hace click en un header sortable */
  onSort?: (key: string) => void
  /** Contenido extra renderizado dentro del card, debajo de la tabla (ej: paginación) */
  children?: ReactNode
}

export function DataTable<T,>({
  columns,
  data,
  loading,
  keyExtractor,
  onRowClick,
  emptyIcon,
  emptyTitle = "Sin resultados",
  emptyDescription = "No se encontraron registros",
  skeletonRows = 8,
  className,
  sortBy,
  sortDir,
  onSort,
  children,
}: DataTableProps<T>) {
  return (
    <div className={`bg-card/80 border border-border rounded-2xl overflow-hidden ${className ?? ""}`}>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              {columns.map((col) => {
                const isSorted = col.sortable && sortBy === col.key
                const clickable = col.sortable && !!onSort
                return (
                  <th
                    key={col.key}
                    scope="col"
                    onClick={clickable ? () => onSort!(col.key) : undefined}
                    className={`px-5 py-3.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap text-left transition-colors ${clickable ? "cursor-pointer select-none hover:text-foreground group/th" : ""} ${col.headerClassName ?? ""}`}
                  >
                    {clickable ? (
                      <span className="inline-flex items-center gap-1">
                        {col.header}
                        {isSorted ? (
                          sortDir === "asc"
                            ? <ArrowUp className="w-3 h-3 shrink-0" />
                            : <ArrowDown className="w-3 h-3 shrink-0" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 shrink-0 opacity-30 group-hover/th:opacity-70 transition-opacity" />
                        )}
                      </span>
                    ) : col.header}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: skeletonRows }).map((_, i) => (
                <tr key={i} className="border-b border-border/50 last:border-0">
                  {columns.map((col) => (
                    <td key={col.key} className="px-5 py-4">
                      {col.skeleton ?? <div className="h-3 w-24 rounded-full bg-muted animate-pulse" />}
                    </td>
                  ))}
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-5 py-20 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="rounded-2xl bg-muted/50 border border-border p-5">
                      {emptyIcon ?? <SearchX className="w-8 h-8 text-muted-foreground" strokeWidth={1.5} />}
                    </div>
                    <p className="text-muted-foreground text-sm font-medium">{emptyTitle}</p>
                    <p className="text-muted-foreground text-xs">{emptyDescription}</p>
                  </div>
                </td>
              </tr>
            ) : (
              data.map((row) => (
                <tr
                  key={keyExtractor(row)}
                  className={`border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors duration-150 group ${onRowClick ? "cursor-pointer" : ""}`}
                  onClick={() => onRowClick?.(row)}
                  tabIndex={onRowClick ? 0 : undefined}
                  onKeyDown={
                    onRowClick
                      ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onRowClick(row) } }
                      : undefined
                  }
                >
                  {columns.map((col) => (
                    <td key={col.key} className={`px-5 py-3.5 ${col.cellClassName ?? ""}`}>
                      {col.cell(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {children}
    </div>
  )
}
