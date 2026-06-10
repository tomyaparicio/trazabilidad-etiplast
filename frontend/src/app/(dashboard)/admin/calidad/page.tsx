"use client"

import { ClipboardCheck } from "lucide-react"

export default function CalidadPage() {
  return (
    <div className="p-6 lg:p-8 space-y-5 max-w-[1200px] mx-auto">
      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <div className="w-1 h-6 rounded-full bg-[#1a1866]" />
        <div>
          <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-[#1a1866]" />
            Control de Calidad
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Plantillas de control de calidad por etapa
          </p>
        </div>
      </div>

      <div className="bg-card/80 border border-border rounded-2xl p-10 flex flex-col items-center justify-center text-center">
        <ClipboardCheck className="w-8 h-8 text-muted-foreground mb-3" strokeWidth={1.5} />
        <p className="text-sm text-muted-foreground">
          Módulo en construcción — disponible en breve
        </p>
      </div>
    </div>
  )
}
