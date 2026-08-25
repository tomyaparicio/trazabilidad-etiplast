"use client"

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts"
import { Clock } from "lucide-react"
import type { TiempoEtapa } from "@/lib/api/types"

export type { TiempoEtapa }

const COLORS = ["#6366f1", "#8b5cf6", "#06b6d4", "#f59e0b"]

interface TiemposEtapaChartProps {
  etapas: TiempoEtapa[]
  /** Si el backend reporta que no hay datos de fechas suficientes. */
  disponible: boolean
}

function CustomTooltip({
  active, payload, label,
}: {
  active?: boolean
  payload?: Array<{ value: number; payload: TiempoEtapa }>
  label?: string
}) {
  if (active && payload && payload.length) {
    const muestras = payload[0]?.payload?.muestras ?? 0
    return (
      <div className="bg-popover border border-border text-sm px-4 py-3 rounded-xl shadow-2xl">
        <p className="font-semibold text-foreground">{label}</p>
        <p className="text-gold mt-0.5">
          {new Intl.NumberFormat("es-AR").format(payload[0]?.value)} días promedio
        </p>
        <p className="text-muted-foreground text-xs mt-0.5">
          {muestras} {muestras === 1 ? "orden" : "órdenes"}
        </p>
      </div>
    )
  }
  return null
}

export function TiemposEtapaChart({ etapas, disponible }: TiemposEtapaChartProps) {
  // Sólo etapas con muestras y promedio válido.
  const data = etapas.filter((e) => e.muestras > 0 && e.dias_promedio !== null)

  return (
    <div className="bg-card/80 border border-border rounded-2xl p-6 h-full">
      <div className="flex items-center gap-3 mb-6">
        <div className="rounded-xl bg-chart-3/10 border border-chart-3/20 p-2.5">
          <Clock className="w-5 h-5 text-chart-3" strokeWidth={1.5} />
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">Tiempos entre etapas</h3>
          <p className="text-sm text-muted-foreground">Días promedio por transición</p>
        </div>
      </div>

      {!disponible || data.length === 0 ? (
        <div className="h-[300px] flex flex-col items-center justify-center text-center px-6">
          <Clock className="w-8 h-8 text-muted-foreground mb-3" strokeWidth={1.5} />
          <p className="text-sm text-muted-foreground">
            No hay suficientes fechas de etapas registradas para calcular tiempos.
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Cargá las fechas de extrusión, impresión, troquelado y entrega en las órdenes.
          </p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data} margin={{ left: 4, right: 16, top: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="etapa"
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
              interval={0}
              angle={-12}
              textAnchor="end"
              height={56}
            />
            <YAxis
              allowDecimals
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
              width={32}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "var(--muted)" }} />
            <Bar dataKey="dias_promedio" radius={[6, 6, 0, 0]} maxBarSize={56}>
              {data.map((_, index) => (
                <Cell key={index} fill={COLORS[index % COLORS.length]} opacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
