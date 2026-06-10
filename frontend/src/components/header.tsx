"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/theme-toggle"
import { NotificationCenter } from "@/components/notification-center"

interface HeaderProps {
  onMenuClick?: () => void
  sidebarOpen?: boolean
  onSidebarToggle?: () => void
}

export function Header({ onMenuClick, sidebarOpen, onSidebarToggle }: HeaderProps) {
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
    <header className="h-16 shrink-0 bg-gradient-to-r from-[#1a1866] to-[#292d96] border-b border-white/10 flex items-center justify-between px-6">
      <div className="flex items-center gap-3 shrink-0">
        {onMenuClick && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onMenuClick}
            className={`h-9 w-9 text-white/80 hover:text-white hover:bg-white/10 ${sidebarOpen ? "lg:hidden" : ""}`}
            aria-label="Abrir menú"
          >
            <Menu className="w-4 h-4" />
          </Button>
        )}
        {onSidebarToggle && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onSidebarToggle}
            className="hidden lg:flex h-9 w-9 text-white/80 hover:text-white hover:bg-white/10"
            aria-label={sidebarOpen ? "Ocultar menú lateral" : "Mostrar menú lateral"}
          >
            {sidebarOpen ? (
              <PanelLeftClose className="w-4 h-4" />
            ) : (
              <PanelLeftOpen className="w-4 h-4" />
            )}
          </Button>
        )}
        <Link href="/" className="flex items-center gap-3">
        <div className="relative w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center border border-white/20 overflow-hidden shrink-0">
          <Image
            src="/logoSOLO.png"
            alt="Etiplast"
            width={28}
            height={28}
            className="object-contain"
          />
        </div>
        <div className="flex flex-col justify-center">
          <p className="text-[14px] font-semibold text-white leading-none">
            eti<span className="text-[#f5eb4a]">plast</span>
          </p>
          <p className="text-[10px] text-white/70 uppercase tracking-[0.15em] mt-0.5">Sistema ERP</p>
        </div>
      </Link>
      </div>
      <div className="flex items-center gap-3">
        {dateInfo && (
          <time className="text-xs text-white/80 hidden sm:block capitalize" dateTime={dateInfo.iso}>
            {dateInfo.str}
          </time>
        )}
        <NotificationCenter />
        <ThemeToggle className="text-white/80 hover:text-white hover:bg-white/10" />
      </div>
    </header>
  )
}
