"use client"

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts"
import { BarChart3 } from "lucide-react"

const COLORS = ["#292d96", "#f5eb4a", "#4f54d6", "#8a8fe0", "#1b1e75", "#b6b9d8", "#6f74e0", "#c9a500", "#3f4488", "#9a9ec8"]

interface ProvinciaBarChartProps {
  data: Array<{ nombre: string; cantidad: number  }>
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-popover border border-border text-sm px-4 py-3 rounded-xl shadow-2xl">
        <p className="font-semibold text-foreground">{label}</p>
        <p className="text-gold mt-0.5">{new Intl.NumberFormat("es-AR").format(payload[0]?.value)} clientes</p>
      </div>
    )
  }
  return null
}

export function ProvinciaBarChart({ data }: ProvinciaBarChartProps) {
  return (
    <div className="bg-card border border-border rounded-[20px] p-6 shadow-[0_20px_50px_-30px_rgba(6,8,40,0.35)]">
      <div className="flex items-center gap-3 mb-6">
        <div className="rounded-xl bg-gold/10 border border-gold/20 p-2.5">
          <BarChart3 className="w-5 h-5 text-gold" strokeWidth={1.5} />
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">Top Provincias</h3>
          <p className="text-sm text-muted-foreground">Distribución geográfica</p>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 20, top: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
          <XAxis type="number" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
          <YAxis dataKey="nombre" type="category" width={88} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "var(--muted)" }} />
          <Bar dataKey="cantidad" radius={[0, 6, 6, 0]} maxBarSize={26}>
            {data.map((_, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} opacity={0.85} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
