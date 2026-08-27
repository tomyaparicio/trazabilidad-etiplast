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
  // Ancho completo (sin cap centrado) y padding uniforme, para que el <PageHeader>
  // pueda salir a full-bleed (banda azul) con -mx/-mt que cancelan este padding.
  return (
    <div className="min-h-full w-full overflow-y-auto bg-background">
      <div className={cn("w-full space-y-6 p-5 sm:p-8 lg:p-10", className)}>
        {children}
      </div>
    </div>
  )
}
