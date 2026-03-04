"use client"

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend, Label } from "recharts"
import { PieChart as PieChartIcon } from "lucide-react"

const COLORS = ["#6366f1", "#f5eb4a", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ec4899", "#3b82f6", "#f97316", "#14b8a6"]

interface RubroPieChartProps {
  data: Array<{ nombre: string; cantidad: number }>
  total?: number
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number }> }) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[#0d0d1a] border border-white/[0.08] text-sm px-4 py-3 rounded-xl shadow-2xl">
        <p className="font-semibold text-white">{payload[0]?.name}</p>
        <p className="text-[#f5eb4a] mt-0.5">{new Intl.NumberFormat("es-AR").format(payload[0]?.value)} clientes</p>
      </div>
    )
  }
  return null
}

export function RubroPieChart({ data, total }: RubroPieChartProps) {
  const nf = new Intl.NumberFormat("es-AR")

  return (
    <div className="bg-[#0f0f1a]/80 border border-white/[0.06] rounded-2xl p-6 h-full">
      <div className="flex items-center gap-3 mb-6">
        <div className="rounded-xl bg-[#6366f1]/10 border border-[#6366f1]/20 p-2.5">
          <PieChartIcon className="w-5 h-5 text-[#6366f1]" strokeWidth={1.5} />
        </div>
        <div>
          <h3 className="text-base font-semibold text-white">Distribución por Rubro</h3>
          <p className="text-sm text-[#6b6b8a]">{nf.format(data.length)} categorías activas</p>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={data}
            dataKey="cantidad"
            nameKey="nombre"
            cx="50%"
            cy="46%"
            innerRadius={70}
            outerRadius={108}
            paddingAngle={3}
            strokeWidth={0}
          >
            {data.map((_, index) => (
              <Cell key={index} fill={COLORS[index % COLORS.length]} opacity={0.9} />
            ))}
            {total != null && (
              <Label
                content={({ viewBox }) => {
                  const { cx, cy } = viewBox as { cx: number; cy: number }
                  return (
                    <g>
                      <text
                        x={cx} y={cy - 7}
                        textAnchor="middle"
                        fill="#f0f0f5"
                        fontSize={26}
                        fontWeight={700}
                      >
                        {nf.format(total)}
                      </text>
                      <text
                        x={cx} y={cy + 12}
                        textAnchor="middle"
                        fill="#6b6b8a"
                        fontSize={10}
                        letterSpacing={1}
                      >
                        CLIENTES
                      </text>
                    </g>
                  )
                }}
              />
            )}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: "12px", paddingTop: "16px" }}
            formatter={(value: string) => <span style={{ color: "#6b6b8a" }}>{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
