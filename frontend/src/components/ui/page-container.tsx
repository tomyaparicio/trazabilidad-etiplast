import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * Contenedor único de las páginas del dashboard: mismo ancho máximo, padding y
 * ritmo vertical en TODAS las pantallas, para que el contenido se ubique igual
 * al navegar entre módulos. Fuente única del layout de página — antes cada
 * página definía su propio max-w-[…] (1200/1360/1400) y padding a mano.
 */
export function PageContainer({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className="min-h-full w-full overflow-y-auto bg-background">
      <div className={cn("mx-auto w-full max-w-[1360px] space-y-5 p-4 sm:p-6 lg:p-8", className)}>
        {children}
      </div>
    </div>
  )
}
