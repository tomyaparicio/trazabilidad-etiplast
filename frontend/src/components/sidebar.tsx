"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { LayoutDashboard, Users, User, Shield, LogOut } from "lucide-react"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { useState } from "react"

const navigation = [
  { name: "Panel de Control", href: "/", icon: LayoutDashboard },
  { name: "Clientes", href: "/clientes", icon: Users },
  { name: "Usuarios", href: "/usuarios", icon: Shield },
  { name: "Mi perfil", href: "/perfil", icon: User },
]

interface SidebarProps {
  userEmail?: string
  userName?: string
  menuOpen?: boolean
  onMenuOpenChange?: (open: boolean) => void
  visible?: boolean
}

function SidebarContent({
  userEmail,
  userName,
  onNavigate,
}: {
  userEmail?: string
  userName?: string
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  const router = useRouter()

  const handleSignOut = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" })
    router.push("/login")
    router.refresh()
  }

  return (
    <div className="flex flex-col h-full bg-sidebar border-r border-sidebar-border">
      {/* Navigation */}
      <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto">
        <p className="px-3 mb-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.15em]">
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
                  ? "bg-[#1a1866] text-white"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
              }`}
            >
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-white rounded-r-full" />
              )}
              <item.icon
                className={`w-[18px] h-[18px] shrink-0 transition-colors ${isActive ? "text-white" : "group-hover:text-sidebar-foreground"}`}
                strokeWidth={isActive ? 2 : 1.5}
              />
              <span>{item.name}</span>
            </Link>
          )
        })}
      </nav>

      {/* User */}
      <div className="p-3 border-t border-sidebar-border">
        <div className="flex items-center gap-3 px-2.5 py-2 rounded-xl hover:bg-sidebar-accent transition-colors group">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center text-xs font-bold text-primary-foreground shrink-0 border border-border">
            {(userName || userEmail)?.[0]?.toUpperCase() || "U"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] text-sidebar-foreground truncate font-medium leading-none mb-0.5">
              {userName || userEmail?.split("@")[0]}
            </p>
            <p className="text-[11px] text-muted-foreground truncate">{userEmail}</p>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            aria-label="Cerrar sesión"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-all shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

export function Sidebar({ userEmail, userName, menuOpen, onMenuOpenChange, visible = true }: SidebarProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const isControlled = onMenuOpenChange != null
  const open = isControlled ? (menuOpen ?? false) : internalOpen
  const setOpen = isControlled ? (o: boolean) => onMenuOpenChange!(o) : setInternalOpen

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="p-0 w-64 border-0">
          <SheetTitle className="sr-only">Menú de navegación</SheetTitle>
          <SidebarContent userEmail={userEmail} userName={userName} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      {visible && (
        <aside className="hidden lg:flex w-60 shrink-0 transition-all duration-200">
          <SidebarContent userEmail={userEmail} userName={userName} />
        </aside>
      )}
    </>
  )
}
