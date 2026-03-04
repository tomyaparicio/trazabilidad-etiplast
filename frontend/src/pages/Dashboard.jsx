import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import {
  Users,
  Tags,
  MapPin,
  Globe,
  Loader2,
  TrendingUp,
  BarChart3,
  PieChart as PieChartIcon,
} from 'lucide-react'

const COLORS = ['#3b82f6', '#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ec4899', '#64748b', '#f97316', '#14b8a6']

function StatCard({ icon: Icon, label, value, trend, color }) {
  return (
    <div className={`stat rounded-2xl shadow-sm border border-base-200 bg-base-100 hover:shadow-md transition-shadow`}>
      <div className="stat-figure text-primary">
        <div className={`rounded-xl p-3 ${color}`}>
          <Icon className="size-6" strokeWidth={1.5} aria-hidden />
        </div>
      </div>
      <div className="stat-title text-base-content/70 font-medium">{label}</div>
      <div className="stat-value text-2xl tabular-nums">{value}</div>
      {trend && (
        <div className="stat-desc text-success flex items-center gap-1 mt-1">
          <TrendingUp className="size-3.5" />
          {trend}
        </div>
      )}
    </div>
  )
}

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-base-300 text-base-content text-sm px-4 py-3 rounded-xl shadow-xl border border-base-200">
        <p className="font-semibold">{label || payload[0]?.name}</p>
        <p className="text-base-content/80 mt-0.5">
          {new Intl.NumberFormat('es-AR').format(payload[0]?.value)} clientes
        </p>
      </div>
    )
  }
  return null
}

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchStats = async () => {
    setError(null)
    setLoading(true)
    try {
      const { data, error: err } = await supabase.rpc('get_dashboard_stats')
      if (err) throw err
      setStats(data)
    } catch (err) {
      console.error('Error cargando estadísticas:', err)
      setError(err?.message || err?.error_description || String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStats()
  }, [])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4" aria-live="polite">
        <Loader2 className="size-10 text-primary animate-spin" aria-hidden />
        <p className="text-base-content/60 font-medium">Cargando estadísticas…</p>
        <div className="flex gap-1">
          <span className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 p-6">
        <div className="rounded-full bg-error/10 p-4">
          <BarChart3 className="size-10 text-error" aria-hidden />
        </div>
        <p className="text-error font-medium text-center" role="alert">
          Error al cargar las estadísticas.
        </p>
        {error && (
          <div className="bg-base-200 rounded-lg p-4 max-w-md text-left">
            <p className="text-sm font-mono text-base-content/80 break-all">{error}</p>
            <p className="text-xs text-base-content/60 mt-2">
              ¿Ejecutaste el archivo supabase_setup.sql en Supabase (SQL Editor)?
            </p>
          </div>
        )}
        <button
          type="button"
          onClick={fetchStats}
          className="btn btn-primary btn-sm"
        >
          Reintentar
        </button>
      </div>
    )
  }

  const nf = new Intl.NumberFormat('es-AR')

  return (
    <div className="p-6 lg:p-8 space-y-8 max-w-[1280px] mx-auto">
      {/* Stats */}
      <section aria-labelledby="stats-heading">
        <h2 id="stats-heading" className="sr-only">Resumen de estadísticas</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
          <StatCard
            label="Total Clientes"
            value={nf.format(stats.total_clientes)}
            color="bg-primary/15 text-primary"
            icon={Users}
          />
          <StatCard
            label="Rubros Activos"
            value={nf.format(stats.rubros.length)}
            color="bg-secondary/15 text-secondary"
            icon={Tags}
          />
          <StatCard
            label="Provincias"
            value={nf.format(stats.provincias.length)}
            color="bg-accent/15 text-accent"
            icon={MapPin}
          />
          <StatCard
            label="País"
            value="Argentina"
            color="bg-success/15 text-success"
            icon={Globe}
          />
        </div>
      </section>

      {/* Charts */}
      <section className="grid grid-cols-1 xl:grid-cols-2 gap-6" aria-labelledby="charts-heading">
        <h2 id="charts-heading" className="sr-only">Gráficos de distribución</h2>

        <div className="card bg-base-100 shadow-sm border border-base-200 overflow-hidden">
          <div className="card-body">
            <div className="flex items-center gap-3 mb-4">
              <div className="rounded-lg bg-primary/10 p-2">
                <PieChartIcon className="size-5 text-primary" strokeWidth={1.5} aria-hidden />
              </div>
              <div>
                <h3 className="card-title text-lg" style={{ textWrap: 'balance' }}>Distribución por Rubro</h3>
                <p className="text-sm text-base-content/60">{nf.format(stats.rubros.length)} categorías activas</p>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie
                  data={stats.rubros}
                  dataKey="cantidad"
                  nameKey="nombre"
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={100}
                  paddingAngle={3}
                  strokeWidth={0}
                >
                  {stats.rubros.map((_, index) => (
                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: '12px' }} formatter={(value) => <span className="text-base-content/70">{value}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card bg-base-100 shadow-sm border border-base-200 overflow-hidden">
          <div className="card-body">
            <div className="flex items-center gap-3 mb-4">
              <div className="rounded-lg bg-secondary/10 p-2">
                <BarChart3 className="size-5 text-secondary" strokeWidth={1.5} aria-hidden />
              </div>
              <div>
                <h3 className="card-title text-lg" style={{ textWrap: 'balance' }}>Top Provincias</h3>
                <p className="text-sm text-base-content/60">Distribución geográfica</p>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={stats.provincias} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="oklch(var(--b3))" />
                <XAxis type="number" tick={{ fontSize: 12, fill: 'oklch(var(--bc) / 0.6)' }} axisLine={false} tickLine={false} />
                <YAxis dataKey="nombre" type="category" width={90} tick={{ fontSize: 12, fill: 'oklch(var(--bc) / 0.8)' }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'oklch(var(--b2) / 0.5)' }} />
                <Bar dataKey="cantidad" radius={[0, 6, 6, 0]} maxBarSize={28}>
                  {stats.provincias.map((_, index) => (
                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* Rubros detail */}
      <section className="card bg-base-100 shadow-sm border border-base-200" aria-labelledby="rubros-heading">
        <div className="card-body">
          <h2 id="rubros-heading" className="card-title text-lg mb-4">Detalle por Rubro</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {stats.rubros.map((rubro, i) => (
              <div
                key={rubro.nombre}
                className="flex items-center gap-3 p-4 rounded-xl bg-base-200/50 hover:bg-base-200 transition-colors"
              >
                <div
                  className="size-3 rounded-full shrink-0"
                  style={{ backgroundColor: COLORS[i % COLORS.length] }}
                  aria-hidden
                />
                <div className="min-w-0">
                  <p className="font-medium text-base-content truncate">{rubro.nombre}</p>
                  <p className="text-sm text-base-content/60 tabular-nums">{nf.format(rubro.cantidad)} clientes</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
