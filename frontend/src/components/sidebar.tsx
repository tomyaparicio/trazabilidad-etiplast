"use client"

import Link from "next/link"
import Image from "next/image"
import { api } from "@/lib/api"
import { usePathname, useRouter } from "next/navigation"
import {
  LayoutDashboard, Users, User, LogOut, Shield, ClipboardList, Building2, Tag, Package, Cog,
  FileText, Boxes, Truck, CalendarRange, BarChart3, ClipboardCheck, ScrollText,
} from "lucide-react"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { useState } from "react"

const navigation = [
  { name: "Panel de Control", href: "/", icon: LayoutDashboard },
  { name: "Clientes", href: "/clientes", icon: Users },
  { name: "Órdenes de Trabajo", href: "/ordenes", icon: ClipboardList },
  { name: "Presupuestos", href: "/presupuestos", icon: FileText },
  { name: "Stock", href: "/stock", icon: Boxes },
  { name: "Remitos", href: "/remitos", icon: Truck },
  { name: "Planificación", href: "/planificacion", icon: CalendarRange },
  { name: "Reportes", href: "/reportes", icon: BarChart3 },
  { name: "Mi perfil", href: "/perfil", icon: User },
]

const adminNavigation = [
  { name: "Usuarios",         href: "/admin/usuarios",         icon: Shield         },
  { name: "Razones Sociales", href: "/admin/razones-sociales", icon: Building2      },
  { name: "Rubros",           href: "/admin/rubros",           icon: Tag            },
  { name: "Envases",          href: "/admin/envases",          icon: Package        },
  { name: "Máquinas",         href: "/admin/maquinas",         icon: Cog            },
  { name: "Calidad",          href: "/admin/calidad",          icon: ClipboardCheck },
  { name: "Auditoría",        href: "/admin/auditoria",        icon: ScrollText     },
]

interface SidebarProps {
  userEmail?: string
  userName?: string
  userRole?: string
  menuOpen?: boolean
  onMenuOpenChange?: (open: boolean) => void
  visible?: boolean
}

// Ítem de navegación: píldora amarilla cuando está activo (patrón del login)
function NavItem({
  href, name, Icon, active, onNavigate,
}: {
  href: string
  name: string
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  active: boolean
  onNavigate?: () => void
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`group flex items-center gap-3 rounded-[13px] px-3 py-2.5 text-[13.5px] font-medium transition-all duration-200 ${
        active
          ? "bg-gold text-[#101248] shadow-[0_10px_22px_-12px_rgba(245,235,74,0.9)]"
          : "text-[#c3c7ef] hover:bg-white/10 hover:text-white"
      }`}
    >
      <Icon
        className={`h-[18px] w-[18px] shrink-0 transition-colors ${active ? "text-[#101248]" : "text-[#aab0ee] group-hover:text-white"}`}
        strokeWidth={active ? 2.2 : 1.8}
      />
      <span className="truncate">{name}</span>
    </Link>
  )
}

function SidebarContent({
  userEmail,
  userName,
  userRole,
  onNavigate,
}: {
  userEmail?: string
  userName?: string
  userRole?: string
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  const router = useRouter()
  const isAdmin = userRole === "admin"

  const handleSignOut = async () => {
    try {
      await api.auth.logout()
    } catch {
      // Si el servidor no responde, igual cerramos la sesión en el cliente
    }
    router.push("/login")
    router.refresh()
  }

  return (
    <div className="flex h-full flex-col bg-brand text-white">
      {/* Marca */}
      <div className="flex items-center gap-3 px-5 pb-4 pt-5">
        <div className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[14px] bg-gradient-to-br from-[#20236f] to-[#0e1046]">
          <Image src="/logoSOLO.png" alt="Etiplast" width={26} height={26} className="object-contain" />
          <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-gold shadow-[0_0_10px_var(--gold)]" />
        </div>
        <div className="min-w-0">
          <p className="font-display text-[20px] font-bold leading-none tracking-tight text-white">
            eti<span className="text-etiplast-500">plast</span>
          </p>
          <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.22em] text-[#aab0ee]">Sistema operativo</p>
        </div>
      </div>

      {/* Navegación */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        <p className="mb-2 mt-1 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#aab0ee]">
          Menú
        </p>
        {navigation.map((item) => (
          <NavItem
            key={item.href}
            href={item.href}
            name={item.name}
            Icon={item.icon}
            active={item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)}
            onNavigate={onNavigate}
          />
        ))}

        {isAdmin && (
          <>
            <p className="mb-2 mt-6 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#aab0ee]">
              Administración
            </p>
            {adminNavigation.map((item) => (
              <NavItem
                key={item.href}
                href={item.href}
                name={item.name}
                Icon={item.icon}
                active={pathname.startsWith(item.href)}
                onNavigate={onNavigate}
              />
            ))}
          </>
        )}
      </nav>

      {/* Usuario */}
      <div className="border-t border-white/10 p-3">
        <div className="group flex items-center gap-3 rounded-[13px] px-2.5 py-2 transition-colors hover:bg-white/10">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-white/10 text-xs font-bold text-white ring-1 ring-white/15">
            {(userName || userEmail)?.[0]?.toUpperCase() || "U"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="mb-0.5 truncate text-[13px] font-semibold leading-none text-white">
              {userName || userEmail?.split("@")[0]}
            </p>
            <p className="truncate text-[11px] text-[#aab0ee]">{userEmail}</p>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            aria-label="Cerrar sesión"
            className="shrink-0 rounded-[9px] p-1.5 text-[#aab0ee] transition-all hover:bg-white/10 hover:text-white"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

export function Sidebar({ userEmail, userName, userRole, menuOpen, onMenuOpenChange, visible = true }: SidebarProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const isControlled = onMenuOpenChange != null
  const open = isControlled ? (menuOpen ?? false) : internalOpen
  const setOpen = isControlled ? (o: boolean) => onMenuOpenChange!(o) : setInternalOpen

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-64 border-0 bg-brand p-0 [&>button]:text-white/70 [&>button]:hover:text-white">
          <SheetTitle className="sr-only">Menú de navegación</SheetTitle>
          <SidebarContent userEmail={userEmail} userName={userName} userRole={userRole} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      {visible && (
        <aside className="hidden w-60 shrink-0 lg:flex">
          <SidebarContent userEmail={userEmail} userName={userName} userRole={userRole} />
        </aside>
      )}
    </>
  )
}
