"use client"

import { useEffect, useState } from "react"

export function Header() {
  const [dateInfo, setDateInfo] = useState<{ str: string; iso: string } | null>(null)

  useEffect(() => {
    const now = new Date()
    setDateInfo({
      str: new Intl.DateTimeFormat("es-AR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(now),
      iso: now.toISOString(),
    })
  }, [])

  return (
    <header className="h-16 bg-[#08080f]/80 backdrop-blur-xl border-b border-white/[0.06] flex items-center justify-between px-6 shrink-0">
      <div className="w-10 lg:hidden" />
      {dateInfo && (
        <time className="text-xs text-[#6b6b8a] hidden sm:block capitalize" dateTime={dateInfo.iso}>
          {dateInfo.str}
        </time>
      )}
    </header>
  )
}
