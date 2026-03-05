import { Users, Tags, MapPin, Globe, type LucideIcon } from "lucide-react"

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
  accent: string
  description?: string
}

export function StatCard({ label, value, icon, accent, description }: StatCardProps) {
  const Icon = ICONS[icon] || Users

  return (
    <div className="relative group rounded-2xl bg-card/80 border border-border p-6 overflow-hidden hover:border-border/80 transition-all duration-300 cursor-default h-full">
      {/* Corner ambient glow on hover */}
      <div
        className="absolute -top-10 -right-10 w-36 h-36 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{ backgroundColor: `${accent}28` }}
      />

      {/* Left accent bar */}
      <div
        className="absolute left-0 top-5 bottom-5 w-[3px] rounded-r-full"
        style={{ backgroundColor: accent }}
      />

      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.15em] mb-3">
            {label}
          </p>
          <p className="text-4xl font-bold text-foreground tabular-nums leading-none">
            {value}
          </p>
          {description && (
            <p className="text-muted-foreground text-xs mt-2.5 truncate">{description}</p>
          )}
        </div>
        <div
          className="rounded-xl p-3 border border-border shrink-0"
          style={{ backgroundColor: `${accent}15` }}
        >
          <Icon className="w-5 h-5" style={{ color: accent }} strokeWidth={1.5} />
        </div>
      </div>
    </div>
  )
}
