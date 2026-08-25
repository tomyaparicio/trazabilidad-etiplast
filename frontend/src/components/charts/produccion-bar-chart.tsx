"use client"

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts"
import { Factory } from "lucide-react"

const COLORS = ["#292d96", "#f5eb4a", "#4f54d6", "#8a8fe0", "#1b1e75", "#b6b9d8", "#6f74e0", "#c9a500", "#3f4488", "#9a9ec8"]

export interface ProduccionPunto {
  grupo: string
  ots: number
  cantidad: number
  kg: number
}

type Metrica = "ots" | "cantidad" | "kg"

interface ProduccionBarChartProps {
  data: ProduccionPunto[]
  /** Métrica a graficar. Por defecto "cantidad". */
  metrica?: Metrica
  titulo?: string
  subtitulo?: string
}

const ETIQUETA_METRICA: Record<Metrica, string> = {
  ots: "órdenes",
  cantidad: "unidades",
  kg: "kg",
}

function CustomTooltip({
  active, payload, label, metrica,
}: {
  active?: boolean
  payload?: Array<{ value: number }>
  label?: string
  metrica: Metrica
}) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-popover border border-border text-sm px-4 py-3 rounded-xl shadow-2xl">
        <p className="font-semibold text-foreground">{label}</p>
        <p className="text-gold mt-0.5">
          {new Intl.NumberFormat("es-AR").format(payload[0]?.value)} {ETIQUETA_METRICA[metrica]}
        </p>
      </div>
    )
  }
  return null
}

export function ProduccionBarChart({
  data,
  metrica = "cantidad",
  titulo = "Producción",
  subtitulo,
}: ProduccionBarChartProps) {
  return (
    <div className="bg-card border border-border rounded-[20px] p-6 h-full shadow-[0_20px_50px_-30px_rgba(6,8,40,0.35)]">
      <div className="flex items-center gap-3 mb-6">
        <div className="rounded-xl bg-gold/10 border border-gold/20 p-2.5">
          <Factory className="w-5 h-5 text-gold" strokeWidth={1.5} />
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">{titulo}</h3>
          <p className="text-sm text-muted-foreground">
            {subtitulo ?? `Por grupo · ${ETIQUETA_METRICA[metrica]}`}
          </p>
        </div>
      </div>
      {data.length === 0 ? (
        <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">
          Sin datos para el rango seleccionado
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
            <XAxis
              type="number"
              allowDecimals={false}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              dataKey="grupo"
              type="category"
              width={110}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              content={<CustomTooltip metrica={metrica} />}
              cursor={{ fill: "var(--muted)" }}
            />
            <Bar dataKey={metrica} radius={[0, 6, 6, 0]} maxBarSize={26}>
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
