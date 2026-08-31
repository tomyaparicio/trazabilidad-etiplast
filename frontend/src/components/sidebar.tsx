"use client"

import Link from "next/link"
import Image from "next/image"
import { api } from "@/lib/api"
import { usePathname, useRouter } from "next/navigation"
import {
  LayoutDashboard, Users, LogOut, Shield, ShieldCheck, ClipboardList, Building2, Tag, Package, Cog,
  FileText, Boxes, Truck, BarChart3, ClipboardCheck, ScrollText,
  Briefcase, Factory, Warehouse, Library, ChevronRight,
} from "lucide-react"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { usePermisos } from "@/components/permisos-provider"
import { useEffect, useState } from "react"

// Estructura del menú: ítems sueltos o carpetas (grupos colapsables).
// `vista`: clave del catálogo RBAC — el ítem se muestra solo si el rol la tiene.
type IconType = React.ComponentType<{ className?: string; strokeWidth?: number }>
type NavLeaf = { name: string; href: string; icon: IconType; vista?: string }
type NavGroupDef = { group: string; icon: IconType; items: NavLeaf[] }
type NavEntry = NavLeaf | NavGroupDef
const isGroup = (e: NavEntry): e is NavGroupDef => "group" in e

const menu: NavEntry[] = [
  { name: "Panel de Control", href: "/", icon: LayoutDashboard, vista: "panel" },
  { group: "Comercial", icon: Briefcase, items: [
    { name: "Clientes", href: "/clientes", icon: Users, vista: "clientes" },
    { name: "Presupuestos", href: "/presupuestos", icon: FileText, vista: "presupuestos" },
  ] },
  { group: "Producción", icon: Factory, items: [
    { name: "Órdenes de Trabajo", href: "/ordenes", icon: ClipboardList, vista: "ordenes" },
  ] },
  { group: "Inventario", icon: Warehouse, items: [
    { name: "Stock", href: "/stock", icon: Boxes, vista: "stock" },
    { name: "Remitos", href: "/remitos", icon: Truck, vista: "remitos" },
  ] },
  { name: "Reportes", href: "/reportes", icon: BarChart3, vista: "reportes" },
]

const adminMenu: NavEntry[] = [
  { name: "Usuarios", href: "/admin/usuarios", icon: Shield },
  { name: "Roles y permisos", href: "/admin/roles", icon: ShieldCheck },
  { group: "Catálogos", icon: Library, items: [
    { name: "Razones Sociales", href: "/admin/razones-sociales", icon: Building2 },
    { name: "Rubros", href: "/admin/rubros", icon: Tag },
    { name: "Envases", href: "/admin/envases", icon: Package },
    { name: "Máquinas", href: "/admin/maquinas", icon: Cog },
  ] },
  { name: "Calidad", href: "/admin/calidad", icon: ClipboardCheck },
  { name: "Auditoría", href: "/admin/auditoria", icon: ScrollText },
]

// Estado de plegado de las carpetas (persistido). Vacío = todas abiertas.
const GROUPS_LS_KEY = "eti:nav-groups-collapsed"
function useCollapsedGroups() {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  useEffect(() => {
    try {
      const raw = localStorage.getItem(GROUPS_LS_KEY)
      if (raw) setCollapsed(new Set(JSON.parse(raw) as string[]))
    } catch { /* sin persistencia */ }
  }, [])
  const toggle = (g: string) =>
    setCollapsed((prev) => {
      const n = new Set(prev)
      n.has(g) ? n.delete(g) : n.add(g)
      try { localStorage.setItem(GROUPS_LS_KEY, JSON.stringify([...n])) } catch { /* noop */ }
      return n
    })
  return { collapsed, toggle }
}

interface SidebarProps {
  userEmail?: string
  userName?: string
  userRole?: string
  menuOpen?: boolean
  onMenuOpenChange?: (open: boolean) => void
  /** Oculta el sidebar fijo de desktop (el toggle vive en el header). */
  collapsed?: boolean
  visible?: boolean
}

// Ítem de navegación: fondo sutil + ícono dorado cuando está activo, con puntito
// amarillo a la derecha (activo) o contador (inactivo con datos) — igual al mockup.
// En modo `mini` (rail colapsado) muestra sólo el ícono centrado + tooltip.
function NavItem({
  href, name, Icon, active, count, onNavigate, mini = false,
}: {
  href: string
  name: string
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  active: boolean
  count?: number
  onNavigate?: () => void
  mini?: boolean
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      title={mini ? name : undefined}
      className={`group relative flex items-center gap-3 rounded-[11px] px-3 py-2.5 text-[13.5px] font-medium outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold/70 ${
        active
          ? "bg-white/12 text-white font-semibold"
          : "text-white/70 hover:bg-white/[0.07] hover:text-white"
      }`}
    >
      <Icon
        className={`h-[18px] w-[18px] shrink-0 transition-colors ${active ? "text-gold" : "text-white/55 group-hover:text-white"}`}
        strokeWidth={active ? 2.2 : 1.8}
      />
      {/* Icono fijo; el texto se revela con fade (no se corre nada) */}
      <span className={`flex-1 truncate transition-opacity duration-200 ${mini ? "opacity-0" : "opacity-100"}`}>{name}</span>
      <span className={`shrink-0 transition-opacity duration-200 ${mini ? "opacity-0" : "opacity-100"}`}>
        {active ? (
          <span className="block h-1.5 w-1.5 rounded-full bg-gold" aria-hidden />
        ) : count != null ? (
          <span className="text-[11.5px] tabular-nums text-white/45">
            {new Intl.NumberFormat("es-AR").format(count)}
          </span>
        ) : null}
      </span>
    </Link>
  )
}

// Carpeta colapsable: encabezado (ícono + chevron) que agrupa NavItems indentados.
function NavGroup({
  group, Icon, items, counts, expanded, onToggle, onNavigate, isActive,
}: {
  group: string
  Icon: IconType
  items: NavLeaf[]
  counts: Record<string, number>
  expanded: boolean
  onToggle: () => void
  onNavigate?: () => void
  isActive: (href: string) => boolean
}) {
  const hasActive = items.some((i) => isActive(i.href))
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="group flex w-full items-center gap-3 rounded-[11px] px-3 py-2.5 text-[13.5px] font-medium text-white/70 outline-none transition-colors duration-200 hover:bg-white/[0.07] hover:text-white focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold/70"
      >
        <Icon
          className={`h-[18px] w-[18px] shrink-0 transition-colors ${hasActive ? "text-gold" : "text-white/55 group-hover:text-white"}`}
          strokeWidth={1.8}
        />
        <span className="flex-1 truncate text-left">{group}</span>
        {hasActive && !expanded && <span className="block h-1.5 w-1.5 rounded-full bg-gold" aria-hidden />}
        <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-white/40 transition-transform duration-200 ${expanded ? "rotate-90" : ""}`} />
      </button>
      {/* grid-rows 0fr→1fr: anima la altura sin conocerla de antemano */}
      <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden">
          <div className="ml-[21px] mt-1 space-y-1 border-l border-white/10 pl-2">
            {items.map((it) => (
              <NavItem
                key={it.href}
                href={it.href}
                name={it.name}
                Icon={it.icon}
                count={counts[it.href]}
                active={isActive(it.href)}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function SidebarContent({
  userEmail,
  userName,
  counts = {},
  onNavigate,
  mini = false,
}: {
  userEmail?: string
  userName?: string
  counts?: Record<string, number>
  onNavigate?: () => void
  mini?: boolean
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { canVer, isAdmin } = usePermisos()
  const { collapsed, toggle } = useCollapsedGroups()

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href))
  const canSee = (leaf: NavLeaf) => !leaf.vista || canVer(leaf.vista)

  // Render de una sección. En `mini` (riel) muestra íconos: los ítems sueltos y
  // el ÍCONO DE CADA CARPETA (se abren al pasar el mouse). Expandido usa carpetas.
  const renderSection = (entries: NavEntry[], adminSection = false) => {
    if (mini) {
      return entries.map((e) => {
        if (isGroup(e)) {
          const items = adminSection ? e.items : e.items.filter(canSee)
          if (items.length === 0) return null
          return (
            <NavItem
              key={e.group}
              href={items[0].href}
              name={e.group}
              Icon={e.icon}
              active={items.some((i) => isActive(i.href))}
              onNavigate={onNavigate}
              mini
            />
          )
        }
        if (!adminSection && !canSee(e)) return null
        return (
          <NavItem key={e.href} href={e.href} name={e.name} Icon={e.icon} count={counts[e.href]} active={isActive(e.href)} onNavigate={onNavigate} mini />
        )
      })
    }
    return entries.map((e) => {
      if (isGroup(e)) {
        const items = adminSection ? e.items : e.items.filter(canSee)
        if (items.length === 0) return null
        return (
          <NavGroup
            key={e.group}
            group={e.group}
            Icon={e.icon}
            items={items}
            counts={counts}
            expanded={!collapsed.has(e.group)}
            onToggle={() => toggle(e.group)}
            onNavigate={onNavigate}
            isActive={isActive}
          />
        )
      }
      if (!adminSection && !canSee(e)) return null
      return (
        <NavItem key={e.href} href={e.href} name={e.name} Icon={e.icon} count={counts[e.href]} active={isActive(e.href)} onNavigate={onNavigate} />
      )
    })
  }

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
    <div className="flex h-full w-full min-w-0 flex-col overflow-hidden bg-sidebar text-white">
      {/* Marca — logo oficial: swirl blanco + "etiplast" amarillo (como la web) */}
      <div className="flex items-center gap-2.5 px-4 pb-5 pt-5">
        <Image src="/logoSOLO.png" alt="Etiplast" width={40} height={40} className="h-10 w-10 shrink-0 object-contain" priority />
        <p className={`font-brand text-[26px] lowercase leading-none tracking-tight text-etiplast-500 whitespace-nowrap transition-opacity duration-200 ${mini ? "opacity-0" : "opacity-100"}`}>
          etiplast
        </p>
      </div>

      {/* Navegación */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        <p className={`mb-2 mt-1 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/50 whitespace-nowrap transition-opacity duration-200 ${mini ? "opacity-0" : "opacity-100"}`}>
          Menú
        </p>
        {renderSection(menu)}

        {isAdmin && (
          <>
            <p className={`mb-2 mt-6 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/50 whitespace-nowrap transition-opacity duration-200 ${mini ? "opacity-0" : "opacity-100"}`}>
              Administración
            </p>
            {renderSection(adminMenu, true)}
          </>
        )}
      </nav>

      {/* Cuenta */}
      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-2 rounded-[12px] p-1 transition-colors hover:bg-white/[0.07]">
          <Link
            href="/perfil"
            onClick={onNavigate}
            title={mini ? (userName || userEmail || "Mi perfil") : undefined}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-[10px] px-1.5 py-1.5"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-white/10 text-xs font-bold text-white ring-1 ring-white/15">
              {(userName || userEmail)?.[0]?.toUpperCase() || "U"}
            </div>
            <div className={`min-w-0 flex-1 transition-opacity duration-200 ${mini ? "opacity-0" : "opacity-100"}`}>
              <p className="mb-0.5 truncate text-[13px] font-semibold leading-none text-white">
                {userName || userEmail?.split("@")[0]}
              </p>
              <p className="truncate text-[11px] text-white/50">{userEmail}</p>
            </div>
          </Link>
          <button
            type="button"
            onClick={handleSignOut}
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
            className={`shrink-0 rounded-[9px] p-2 text-white/50 transition-colors hover:bg-white/10 hover:text-white ${mini ? "pointer-events-none opacity-0" : "opacity-100"}`}
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

export function Sidebar({ userEmail, userName, menuOpen, onMenuOpenChange, collapsed = false, visible = true }: SidebarProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const isControlled = onMenuOpenChange != null
  const open = isControlled ? (menuOpen ?? false) : internalOpen
  const setOpen = isControlled ? (o: boolean) => onMenuOpenChange!(o) : setInternalOpen

  // Contadores del navbar (datos reales). El shell no se desmonta al navegar,
  // así que esto corre una sola vez por sesión. Falla en silencio → sin badge.
  const [counts, setCounts] = useState<Record<string, number>>({})
  useEffect(() => {
    let alive = true
    api.dashboard.stats().then((s) => {
      if (!alive) return
      const ordenes = Object.values(s.ordenes_por_estado ?? {}).reduce((a, b) => a + (b || 0), 0)
      setCounts((c) => ({ ...c, "/clientes": s.total_clientes ?? 0, "/ordenes": ordenes }))
    }).catch(() => {})
    api.presupuestos.list({ page: 1, per_page: 1 }).then((r) => {
      if (!alive) return
      setCounts((c) => ({ ...c, "/presupuestos": r.total ?? 0 }))
    }).catch(() => {})
    return () => { alive = false }
  }, [])

  // Habilitar la transición recién tras el primer frame: así, si al recargar el
  // sidebar quedó colapsado, arranca cerrado (sin animarse solo).
  const [animate, setAnimate] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setAnimate(true))
    return () => cancelAnimationFrame(id)
  }, [])

  // Colapsado: al pasar el mouse se despliega como overlay (flyout) sin correr el contenido.
  const [hovered, setHovered] = useState(false)

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-64 border-0 bg-sidebar p-0 [&>button]:text-white/70 [&>button]:hover:text-white">
          <SheetTitle className="sr-only">Menú de navegación</SheetTitle>
          <SidebarContent userEmail={userEmail} userName={userName} counts={counts} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      {visible && (
        <div
          className={`relative hidden shrink-0 lg:block ${
            animate ? "transition-[width] duration-300 ease-in-out" : ""
          } ${collapsed ? "w-16" : "w-60"}`}
        >
          {/* Sidebar real. Colapsado: riel de 64px que al pasar el mouse se
              despliega a 240px como overlay (flyout), sin correr el contenido. */}
          <aside
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            className={`absolute inset-y-0 left-0 z-40 overflow-hidden border-r border-sidebar-border ${
              animate ? "transition-[width] duration-300 ease-out" : ""
            } ${collapsed && !hovered ? "w-16" : "w-60"} ${
              collapsed && hovered ? "shadow-2xl" : ""
            }`}
          >
            <SidebarContent
              userEmail={userEmail}
              userName={userName}
              counts={counts}
              mini={collapsed && !hovered}
            />
          </aside>
        </div>
      )}
    </>
  )
}
