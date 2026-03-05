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
      <div className="bg-popover border border-border text-sm px-4 py-3 rounded-xl shadow-2xl">
        <p className="font-semibold text-foreground">{payload[0]?.name}</p>
        <p className="text-gold mt-0.5">{new Intl.NumberFormat("es-AR").format(payload[0]?.value)} clientes</p>
      </div>
    )
  }
  return null
}

export function RubroPieChart({ data, total }: RubroPieChartProps) {
  const nf = new Intl.NumberFormat("es-AR")

  return (
    <div className="bg-card/80 border border-border rounded-2xl p-6 h-full">
      <div className="flex items-center gap-3 mb-6">
        <div className="rounded-xl bg-chart-1/10 border border-chart-1/20 p-2.5">
          <PieChartIcon className="w-5 h-5 text-chart-1" strokeWidth={1.5} />
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">Distribución por Rubro</h3>
          <p className="text-sm text-muted-foreground">{nf.format(data.length)} categorías activas</p>
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
                        fill="var(--foreground)"
                        fontSize={26}
                        fontWeight={700}
                      >
                        {nf.format(total)}
                      </text>
                      <text
                        x={cx} y={cy + 12}
                        textAnchor="middle"
                        fill="var(--muted-foreground)"
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
            formatter={(value: string) => <span className="text-muted-foreground">{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
