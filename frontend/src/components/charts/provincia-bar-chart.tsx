"use client"

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts"
import { BarChart3 } from "lucide-react"

const COLORS = ["#6366f1", "#f5eb4a", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ec4899", "#3b82f6", "#f97316", "#14b8a6"]

interface ProvinciaBarChartProps {
  data: Array<{ nombre: string; cantidad: number }>
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[#0d0d1a] border border-white/[0.08] text-sm px-4 py-3 rounded-xl shadow-2xl">
        <p className="font-semibold text-white">{label}</p>
        <p className="text-[#f5eb4a] mt-0.5">{new Intl.NumberFormat("es-AR").format(payload[0]?.value)} clientes</p>
      </div>
    )
  }
  return null
}

export function ProvinciaBarChart({ data }: ProvinciaBarChartProps) {
  return (
    <div className="bg-[#0f0f1a]/80 border border-white/[0.06] rounded-2xl p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="rounded-xl bg-[#f5eb4a]/10 border border-[#f5eb4a]/20 p-2.5">
          <BarChart3 className="w-5 h-5 text-[#f5eb4a]" strokeWidth={1.5} />
        </div>
        <div>
          <h3 className="text-base font-semibold text-white">Top Provincias</h3>
          <p className="text-sm text-[#6b6b8a]">Distribución geográfica</p>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 20, top: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(255,255,255,0.04)" />
          <XAxis type="number" tick={{ fontSize: 11, fill: "#4a4a6a" }} axisLine={false} tickLine={false} />
          <YAxis dataKey="nombre" type="category" width={88} tick={{ fontSize: 11, fill: "#6b6b8a" }} axisLine={false} tickLine={false} />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
          <Bar dataKey="cantidad" radius={[0, 6, 6, 0]} maxBarSize={26}>
            {data.map((_, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} opacity={0.85} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
