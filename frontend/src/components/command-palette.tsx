"use client"

/**
 * Paleta de comandos (⌘K / Ctrl+K).
 * Navegación rápida a todas las secciones + acciones rápidas (nueva orden,
 * nuevo presupuesto, escanear orden). Las acciones despachan eventos globales
 * o navegan con el router.
 *
 * Montada en dashboard-shell.tsx. Estilo del tema (navy/gold + blur).
 */

import { useEffect, useRef, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Command } from "cmdk"
import {
  LayoutDashboard, Users, ClipboardList, FileText, Boxes, Truck,
  BarChart3, GitBranch, Shield, Search,
  Plus, ScanLine, Loader2, UserRound,
} from "lucide-react"
import { api } from "@/lib/api"
import type { Cliente } from "@/types/database"

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
  const [query, setQuery] = useState("")
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [buscando, setBuscando] = useState(false)
  const reqId = useRef(0)

  // Búsqueda de clientes en vivo (debounced). El backend ya busca por marca,
  // razón social, localidad y producto — acá solo orquestamos.
  useEffect(() => {
    if (!open) return
    const q = query.trim()
    if (q.length < 2) {
      setClientes([])
      setBuscando(false)
      return
    }
    setBuscando(true)
    const id = ++reqId.current
    const t = window.setTimeout(async () => {
      try {
        const res = await api.clientes.list({ search: q, per_page: 6 })
        if (reqId.current === id) setClientes(res.data)
      } catch {
        if (reqId.current === id) setClientes([])
      } finally {
        if (reqId.current === id) setBuscando(false)
      }
    }, 250)
    return () => window.clearTimeout(t)
  }, [query, open])

  // Al cerrar, limpiar la búsqueda para la próxima apertura.
  useEffect(() => {
    if (!open) {
      setQuery("")
      setClientes([])
      setBuscando(false)
    }
  }, [open])

  // Atajo global ⌘K / Ctrl+K
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    document.addEventListener("keydown", onKeyDown)
    const onOpen = () => setOpen(true)
    window.addEventListener("eti:open-command-palette", onOpen)
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("eti:open-command-palette", onOpen)
    }
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
      // La creación ahora es una página propia (ya no un dialog en /ordenes)
      run: () => go("/ordenes/nueva"),
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
            value={query}
            onValueChange={setQuery}
            placeholder="Buscar cliente, sección o acción..."
            className="flex-1 bg-transparent py-3.5 text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          {buscando && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
          <kbd className="hidden sm:inline-flex items-center rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            ESC
          </kbd>
        </div>

        <Command.List className="max-h-[60vh] overflow-y-auto p-2">
          <Command.Empty className="py-8 text-center text-sm text-muted-foreground">
            {buscando ? "Buscando clientes…" : "Sin resultados."}
          </Command.Empty>

          {clientes.length > 0 && (
            <Command.Group
              heading="Clientes"
              className="px-1 py-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground"
            >
              {clientes.map((cli) => (
                <Command.Item
                  key={cli.id}
                  // Incluye la query cruda: el server ya decidió que matchea
                  // (puede haber sido por razón social o producto, no la marca),
                  // así el filtro local de cmdk no lo descarta.
                  value={`cliente-${cli.id} ${cli.marca ?? ""} ${cli.razon_social ?? ""} ${query}`}
                  onSelect={() => go(`/clientes/${cli.id}`)}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-foreground transition-colors data-[selected=true]:bg-brand data-[selected=true]:text-white"
                >
                  <UserRound className="h-4 w-4 shrink-0 text-gold" />
                  <span className="min-w-0 flex-1 truncate font-semibold">{cli.marca || cli.razon_social || `Cliente #${cli.id_cliente}`}</span>
                  <span className="max-w-[45%] truncate text-[11px] font-medium text-muted-foreground">
                    {[cli.id_cliente != null ? `#${cli.id_cliente}` : null, cli.localidad || cli.rubro].filter(Boolean).join(" · ")}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          )}

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
      className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-foreground transition-colors data-[selected=true]:bg-brand data-[selected=true]:text-white"
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
