import {
  Users, Tags, MapPin, Globe, ArrowUpRight, ArrowDownRight, type LucideIcon,
} from "lucide-react"

const ICONS: Record<string, LucideIcon> = {
  users: Users,
  tags: Tags,
  "map-pin": MapPin,
  globe: Globe,
}

interface StatCardProps {
  label: string
  value: string | number
  icon: string
  /** Color de acento del ícono (hex). Por defecto azul de marca. */
  accent?: string
  description?: string
  /** Chip de variación: porcentaje o texto + dirección. */
  delta?: { value: string; dir: "up" | "down" }
  /** Tarjeta destacada: fondo azul, número blanco (invierte como el login). */
  highlight?: boolean
}

export function StatCard({
  label, value, icon, accent = "#292d96", description, delta, highlight,
}: StatCardProps) {
  const Icon = ICONS[icon] || Users

  return (
    <div
      className={`relative overflow-hidden rounded-[20px] border p-5 shadow-[0_20px_50px_-30px_rgba(6,8,40,0.35)] transition-shadow duration-300 hover:shadow-[0_26px_60px_-30px_rgba(6,8,40,0.45)] ${
        highlight ? "border-transparent bg-[#292d96] text-white" : "border-border bg-card"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <p
          className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${
            highlight ? "text-white/70" : "text-muted-foreground"
          }`}
        >
          {label}
        </p>
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-[12px]"
          style={
            highlight
              ? { backgroundColor: "rgba(255,255,255,0.12)", color: "#fff" }
              : { backgroundColor: `${accent}15`, color: accent }
          }
        >
          <Icon className="size-5" strokeWidth={1.8} />
        </span>
      </div>

      <p
        className={`font-display mt-3 text-[34px] font-bold leading-none tabular-nums ${
          highlight ? "text-white" : "text-foreground"
        }`}
      >
        {value}
      </p>

      {/* Regla fina amarilla bajo el número (patrón del login) */}
      <span className="mt-3 block h-[3px] w-10 rounded-full bg-[#f5eb4a]" />

      <div className="mt-3 flex items-center justify-between gap-2">
        {description && (
          <p className={`truncate text-xs font-medium ${highlight ? "text-white/70" : "text-muted-foreground"}`}>
            {description}
          </p>
        )}
        {delta && (
          <span
            className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              delta.dir === "up"
                ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400"
                : "bg-red-500/12 text-red-600 dark:text-red-400"
            }`}
          >
            {delta.dir === "up" ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
            {delta.value}
          </span>
        )}
      </div>
    </div>
  )
}
