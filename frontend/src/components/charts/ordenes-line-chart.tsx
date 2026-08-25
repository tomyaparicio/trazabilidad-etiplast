"use client"

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts"
import { TrendingUp } from "lucide-react"

export interface OrdenesSeriePunto {
  mes: string // "YYYY-MM"
  cantidad: number
}

interface OrdenesLineChartProps {
  data: OrdenesSeriePunto[]
}

const MESES_CORTOS = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
]

/** "2026-06" -> "Jun '26" */
function etiquetaMes(clave: string): string {
  const [anio, mes] = clave.split("-")
  const idx = Number(mes) - 1
  const nombre = MESES_CORTOS[idx] ?? clave
  return `${nombre} '${(anio ?? "").slice(2)}`
}

function CustomTooltip({
  active, payload, label,
}: {
  active?: boolean
  payload?: Array<{ value: number }>
  label?: string
}) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-popover border border-border text-sm px-4 py-3 rounded-xl shadow-2xl">
        <p className="font-semibold text-foreground">{etiquetaMes(label ?? "")}</p>
        <p className="text-gold mt-0.5">
          {new Intl.NumberFormat("es-AR").format(payload[0]?.value)} órdenes
        </p>
      </div>
    )
  }
  return null
}

export function OrdenesLineChart({ data }: OrdenesLineChartProps) {
  return (
    <div className="bg-card border border-border rounded-[20px] p-6 h-full shadow-[0_20px_50px_-30px_rgba(6,8,40,0.35)]">
      <div className="flex items-center gap-3 mb-6">
        <div className="rounded-xl bg-chart-1/10 border border-chart-1/20 p-2.5">
          <TrendingUp className="w-5 h-5 text-chart-1" strokeWidth={1.5} />
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">Órdenes en el tiempo</h3>
          <p className="text-sm text-muted-foreground">OTs creadas por mes</p>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ left: 4, right: 16, top: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="mes"
            tickFormatter={etiquetaMes}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={16}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
            width={32}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: "var(--muted)" }} />
          <Line
            type="monotone"
            dataKey="cantidad"
            stroke="var(--chart-1)"
            strokeWidth={2.5}
            dot={{ r: 3, fill: "var(--chart-1)", strokeWidth: 0 }}
            activeDot={{ r: 5, fill: "var(--chart-1)" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
