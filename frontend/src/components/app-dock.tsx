"use client"

import { usePathname, useRouter } from "next/navigation"
import { Activity, Grid2X2, Home, Plus, Search } from "lucide-react"

interface AppDockProps {
  onMoreClick: () => void
}

export function AppDock({ onMoreClick }: AppDockProps) {
  const pathname = usePathname()
  const router = useRouter()

  const openCommands = () => window.dispatchEvent(new CustomEvent("eti:open-command-palette"))
  const createOrder = () => {
    router.push("/ordenes")
    window.setTimeout(() => window.dispatchEvent(new CustomEvent("eti:open-order-form")), 250)
  }

  const items = [
    { label: "Hoy", icon: Home, active: pathname === "/", action: () => router.push("/") },
    { label: "Buscar", icon: Search, active: false, action: openCommands },
    { label: "Crear", icon: Plus, active: false, action: createOrder },
    { label: "Actividad", icon: Activity, active: pathname.startsWith("/trazabilidad"), action: () => router.push("/trazabilidad") },
    { label: "Más", icon: Grid2X2, active: pathname !== "/" && !pathname.startsWith("/trazabilidad"), action: onMoreClick },
  ]

  return (
    <nav
      aria-label="Navegación rápida"
      className="z-30 flex min-h-12 shrink-0 items-center justify-center gap-1 overflow-x-auto border-b border-border bg-card px-3 lg:hidden"
    >
      {items.map(({ label, icon: Icon, active, action }) => (
        <button
          key={label}
          type="button"
          onClick={action}
          aria-current={active ? "page" : undefined}
          className={`flex min-h-9 min-w-11 items-center justify-center gap-2 rounded-lg px-3 text-xs font-medium transition-colors sm:min-w-[92px] ${
            active ? "bg-brand/10 text-brand dark:text-[#b9bbff]" : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <Icon className="size-[18px]" strokeWidth={1.8} />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </nav>
  )
}
