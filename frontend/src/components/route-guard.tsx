"use client"

/**
 * RouteGuard — protege el deep-link a vistas no permitidas por el rol.
 * Si un usuario navega (o pega una URL) a una sección que su rol no tiene
 * asignada, lo devuelve al panel. El sidebar ya oculta esos enlaces; esto cubre
 * el acceso directo por URL. La barrera real de datos vive en el backend.
 */

import { useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import { usePermisos } from "@/components/permisos-provider"

// Prefijo de ruta → clave de vista del catálogo RBAC.
const RUTA_VISTA: { prefix: string; vista: string; adminOnly?: boolean }[] = [
  { prefix: "/clientes", vista: "clientes" },
  { prefix: "/ordenes", vista: "ordenes" },
  { prefix: "/presupuestos", vista: "presupuestos" },
  { prefix: "/facturas", vista: "facturas" },
  { prefix: "/stock", vista: "stock" },
  { prefix: "/remitos", vista: "remitos" },
  { prefix: "/reportes", vista: "reportes" },
  // Sección Administración: reservada a administradores.
  { prefix: "/admin/usuarios", vista: "usuarios", adminOnly: true },
  { prefix: "/admin/roles", vista: "roles", adminOnly: true },
  { prefix: "/admin/razones-sociales", vista: "razones_sociales", adminOnly: true },
  { prefix: "/admin/rubros", vista: "rubros", adminOnly: true },
  { prefix: "/admin/envases", vista: "envases", adminOnly: true },
  { prefix: "/admin/maquinas", vista: "maquinas", adminOnly: true },
  { prefix: "/admin/calidad", vista: "calidad", adminOnly: true },
  { prefix: "/admin/auditoria", vista: "auditoria", adminOnly: true },
]

export function RouteGuard() {
  const pathname = usePathname()
  const router = useRouter()
  const { loading, isAdmin, canVer } = usePermisos()

  useEffect(() => {
    if (loading) return // aún no sabemos los permisos: no redirigir
    const match = RUTA_VISTA.find(
      (r) => pathname === r.prefix || pathname.startsWith(r.prefix + "/"),
    )
    if (!match) return // rutas no mapeadas (/, /perfil, …) siempre permitidas
    const allowed = match.adminOnly ? isAdmin : canVer(match.vista)
    if (!allowed) router.replace("/")
  }, [pathname, loading, isAdmin, canVer, router])

  return null
}
