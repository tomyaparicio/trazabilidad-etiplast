"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname, useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { LayoutDashboard, Users, LogOut, Menu } from "lucide-react"
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { useState } from "react"

const navigation = [
  { name: "Panel de Control", href: "/", icon: LayoutDashboard },
  { name: "Clientes", href: "/clientes", icon: Users },
]

interface SidebarProps {
  userEmail?: string
}

function SidebarContent({
  userEmail,
  onNavigate,
}: {
  userEmail?: string
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  return (
    <div className="flex flex-col h-full bg-[#06060e] border-r border-white/[0.05]">
      {/* Logo */}
      <div className="h-16 flex items-center gap-3 px-5 border-b border-white/[0.05]">
        <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-[#100f3a] to-[#1a1866] flex items-center justify-center border border-white/10 shadow-[0_0_20px_rgba(30,27,75,0.4)] overflow-hidden shrink-0">
          <Image
            src="/logoSOLO.png"
            alt="Etiplast"
            width={28}
            height={28}
            className="object-contain"
          />
        </div>
        <div>
          <p className="text-[14px] font-semibold text-white leading-none">
            eti<span className="text-[#f5eb4a]">plast</span>
          </p>
          <p className="text-[10px] text-[#6b6b8a] uppercase tracking-[0.15em] mt-0.5">Sistema ERP</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto">
        <p className="px-3 mb-3 text-[10px] font-semibold text-[#4a4a6a] uppercase tracking-[0.15em]">
          Menú
        </p>
        {navigation.map((item) => {
          const isActive =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-200 relative ${
                isActive
                  ? "bg-[#f5eb4a]/10 text-[#f5eb4a]"
                  : "text-[#6b6b8a] hover:bg-white/[0.03] hover:text-[#c8c8d8]"
              }`}
            >
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-[#f5eb4a] rounded-r-full" />
              )}
              <item.icon
                className={`w-[18px] h-[18px] shrink-0 transition-colors ${isActive ? "text-[#f5eb4a]" : "group-hover:text-[#c8c8d8]"}`}
                strokeWidth={isActive ? 2 : 1.5}
              />
              <span>{item.name}</span>
            </Link>
          )
        })}
      </nav>

      {/* User */}
      <div className="p-3 border-t border-white/[0.05]">
        <div className="flex items-center gap-3 px-2.5 py-2 rounded-xl hover:bg-white/[0.03] transition-colors group">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#1a1866] to-[#292d96] flex items-center justify-center text-xs font-bold text-white shrink-0 border border-white/10">
            {userEmail?.[0]?.toUpperCase() || "U"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] text-white truncate font-medium leading-none mb-0.5">
              {userEmail?.split("@")[0]}
            </p>
            <p className="text-[11px] text-[#4a4a6a] truncate">{userEmail}</p>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            aria-label="Cerrar sesión"
            className="p-1.5 rounded-lg text-[#4a4a6a] hover:text-red-400 hover:bg-red-500/10 transition-all shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

export function Sidebar({ userEmail }: SidebarProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden fixed top-4 left-4 z-40 bg-[#0d0d1a]/80 backdrop-blur-lg border border-white/[0.08] hover:bg-white/[0.06] text-white h-9 w-9"
            aria-label="Abrir menú"
          >
            <Menu className="w-4 h-4" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="p-0 w-64 border-0">
          <SheetTitle className="sr-only">Menú de navegación</SheetTitle>
          <SidebarContent userEmail={userEmail} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <aside className="hidden lg:flex w-60 shrink-0">
        <SidebarContent userEmail={userEmail} />
      </aside>
    </>
  )
}
