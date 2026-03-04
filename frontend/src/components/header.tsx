"use client"

import { usePathname } from "next/navigation"

const PAGE_TITLES: Record<string, string> = {
  "/": "Panel de Control",
  "/clientes": "Clientes",
}

export function Header() {
  const pathname = usePathname()
  const pageTitle = PAGE_TITLES[pathname] || "Panel de Control"

  const now = new Date()
  const dateStr = new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(now)

  return (
    <header className="h-16 bg-[#08080f]/80 backdrop-blur-xl border-b border-white/[0.06] flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center gap-4">
        <div className="w-10 lg:hidden" />
        <h1 className="text-base font-semibold text-white">{pageTitle}</h1>
      </div>
      <time className="text-xs text-[#6b6b8a] hidden sm:block capitalize" dateTime={now.toISOString()}>
        {dateStr}
      </time>
    </header>
  )
}
