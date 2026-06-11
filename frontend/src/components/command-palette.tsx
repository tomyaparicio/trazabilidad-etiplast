"use client"

/**
 * Paleta de comandos (⌘K / Ctrl+K).
 * Navegación rápida a todas las secciones + acciones rápidas (nueva orden,
 * nuevo presupuesto, escanear orden). Las acciones despachan eventos globales
 * o navegan con el router.
 *
 * Montada en dashboard-shell.tsx. Estilo del tema (navy/gold + blur).
 */

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Command } from "cmdk"
import {
  LayoutDashboard, Users, ClipboardList, FileText, Boxes, Truck,
  CalendarRange, BarChart3, GitBranch, Shield, Search,
  Plus, ScanLine,
} from "lucide-react"

type Item = {
  label: string
  hint?: string
  icon: React.ComponentType<{ className?: string }>
  keywords?: string
  run: () => void
}

interface CommandPaletteProps {
  isAdmin?: boolean
}

export function CommandPalette({ isAdmin }: CommandPaletteProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  // Atajo global ⌘K / Ctrl+K
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [])

  const go = useCallback(
    (path: string) => {
      setOpen(false)
      router.push(path)
    },
    [router]
  )

  const navItems: Item[] = [
    { label: "Panel de Control", icon: LayoutDashboard, keywords: "dashboard inicio home", run: () => go("/") },
    { label: "Clientes", icon: Users, run: () => go("/clientes") },
    { label: "Órdenes de Trabajo", icon: ClipboardList, keywords: "ot ordenes trabajo", run: () => go("/ordenes") },
    { label: "Presupuestos", icon: FileText, run: () => go("/presupuestos") },
    { label: "Stock", icon: Boxes, keywords: "inventario materiales", run: () => go("/stock") },
    { label: "Remitos", icon: Truck, keywords: "entregas despacho", run: () => go("/remitos") },
    { label: "Planificación", icon: CalendarRange, keywords: "produccion calendario", run: () => go("/planificacion") },
    { label: "Reportes", icon: BarChart3, keywords: "kpis estadisticas graficos", run: () => go("/reportes") },
    { label: "Trazabilidad", icon: GitBranch, keywords: "lote seguimiento", run: () => go("/trazabilidad") },
  ]

  const adminItems: Item[] = [
    { label: "Usuarios", icon: Shield, keywords: "admin permisos", run: () => go("/admin/usuarios") },
    { label: "Calidad", icon: Shield, keywords: "qc control calidad", run: () => go("/admin/calidad") },
    { label: "Auditoría", icon: Shield, keywords: "logs actividad", run: () => go("/admin/auditoria") },
  ]

  // Navega a una sección y, una vez ahí, dispara un evento global para que la
  // página destino abra su formulario. El delay deja montar al listener si
  // venimos de otra ruta; si ya estamos en la sección, igual reacciona.
  const goAndDispatch = useCallback(
    (path: string, evento: string) => {
      setOpen(false)
      router.push(path)
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent(evento))
      }, 250)
    },
    [router]
  )

  const actionItems: Item[] = [
    {
      label: "Nueva orden de trabajo",
      hint: "Crear",
      icon: Plus,
      keywords: "nueva orden crear ot",
      // ordenes-table escucha "eti:open-order-form" y abre el formulario
      run: () => goAndDispatch("/ordenes", "eti:open-order-form"),
    },
    {
      label: "Nuevo presupuesto",
      hint: "Crear",
      icon: Plus,
      keywords: "nuevo presupuesto crear cotizacion",
      run: () => goAndDispatch("/presupuestos", "eti:open-presupuesto-form"),
    },
    {
      label: "Escanear orden",
      hint: "QR",
      icon: ScanLine,
      keywords: "escanear qr camara orden",
      // El botón de escaneo vive en /ordenes
      run: () => goAndDispatch("/ordenes", "eti:scan-order"),
    },
  ]

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] px-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={() => setOpen(false)}
    >
      <Command
        label="Paleta de comandos"
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-popover shadow-2xl animate-in zoom-in-95 slide-in-from-top-2 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-4">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Command.Input
            autoFocus
            placeholder="Buscar sección o acción..."
            className="flex-1 bg-transparent py-3.5 text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden sm:inline-flex items-center rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            ESC
          </kbd>
        </div>

        <Command.List className="max-h-[60vh] overflow-y-auto p-2">
          <Command.Empty className="py-8 text-center text-sm text-muted-foreground">
            Sin resultados.
          </Command.Empty>

          <Command.Group
            heading="Acciones rápidas"
            className="px-1 py-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground"
          >
            {actionItems.map((item) => (
              <PaletteItem key={item.label} item={item} accent />
            ))}
          </Command.Group>

          <Command.Group
            heading="Navegación"
            className="px-1 py-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground"
          >
            {navItems.map((item) => (
              <PaletteItem key={item.label} item={item} />
            ))}
          </Command.Group>

          {isAdmin && (
            <Command.Group
              heading="Administración"
              className="px-1 py-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground"
            >
              {adminItems.map((item) => (
                <PaletteItem key={item.label} item={item} />
              ))}
            </Command.Group>
          )}
        </Command.List>
      </Command>
    </div>
  )
}

function PaletteItem({ item, accent }: { item: Item; accent?: boolean }) {
  const Icon = item.icon
  return (
    <Command.Item
      value={`${item.label} ${item.keywords ?? ""}`}
      onSelect={item.run}
      className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-foreground transition-colors data-[selected=true]:bg-[#1a1866] data-[selected=true]:text-white"
    >
      <Icon className={`h-4 w-4 shrink-0 ${accent ? "text-gold" : "text-muted-foreground"} data-[selected=true]:text-white`} />
      <span className="flex-1">{item.label}</span>
      {item.hint && (
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {item.hint}
        </span>
      )}
    </Command.Item>
  )
}
