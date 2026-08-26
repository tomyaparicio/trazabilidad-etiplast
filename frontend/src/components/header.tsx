"use client"

import Image from "next/image"
import Link from "next/link"
import { Menu, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/theme-toggle"
import { NotificationCenter } from "@/components/notification-center"

interface HeaderProps {
  onMenuClick?: () => void
  userName?: string
  userEmail?: string
}

export function Header({ onMenuClick, userName, userEmail }: HeaderProps) {
  const displayName = userName || userEmail?.split("@")[0] || "Usuario"
  const initial = (userName || userEmail)?.[0]?.toUpperCase() || "U"
  const openPalette = () => window.dispatchEvent(new CustomEvent("eti:open-command-palette"))

  return (
    <header className="h-16 shrink-0 border-b border-border bg-card/80 px-4 backdrop-blur-md sm:px-6 lg:px-8">
      <div className="flex h-full items-center justify-between gap-3">
        {/* Izquierda: menú móvil + wordmark (sólo móvil; en desktop está en el sidebar) */}
        <div className="flex shrink-0 items-center gap-2 lg:hidden">
          {onMenuClick && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onMenuClick}
              className="h-10 w-10 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Abrir menú"
            >
              <Menu className="h-5 w-5" />
            </Button>
          )}
          <Link href="/" className="flex items-center gap-2">
            <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[11px] bg-gradient-to-br from-[#20236f] to-[#0e1046]">
              <Image src="/logoSOLO.png" alt="Etiplast" width={22} height={22} className="object-contain" />
            </div>
            <span className="font-display text-lg font-bold leading-none text-foreground">
              eti<span className="text-etiplast-500">plast</span>
            </span>
          </Link>
        </div>

        {/* Centro: buscador (estilo campo del login) que abre el command palette */}
        <button
          type="button"
          onClick={openPalette}
          className="hidden h-10 w-full max-w-md items-center justify-between rounded-[12px] border-[1.5px] border-border bg-[#f4f5fa] px-3.5 text-sm text-muted-foreground transition-all hover:border-brand/50 hover:bg-white focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/10 md:flex dark:bg-white/[0.04] dark:hover:bg-white/[0.07]"
        >
          <span className="flex items-center gap-2">
            <Search className="size-4" /> Buscar orden, cliente o acción…
          </span>
          <kbd className="rounded-md border border-border bg-white/70 px-1.5 py-0.5 text-[10px] font-semibold dark:bg-white/10">
            ⌘K
          </kbd>
        </button>

        {/* Derecha: acciones + perfil */}
        <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
          {/* Buscador compacto en móvil */}
          <Button
            variant="ghost"
            size="icon"
            onClick={openPalette}
            className="h-10 w-10 text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
            aria-label="Buscar"
          >
            <Search className="h-5 w-5" />
          </Button>

          <NotificationCenter />
          <ThemeToggle />

          <span className="mx-1 hidden h-6 w-px bg-border sm:block" />

          <Link
            href="/perfil"
            className="flex items-center gap-2.5 rounded-[12px] p-1 transition-colors hover:bg-muted sm:pr-3"
            aria-label="Mi perfil"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-brand text-sm font-bold text-white">
              {initial}
            </span>
            <span className="hidden max-w-[130px] truncate text-[13px] font-semibold text-foreground xl:block">
              {displayName}
            </span>
          </Link>
        </div>
      </div>
    </header>
  )
}
