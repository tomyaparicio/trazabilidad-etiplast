"use client"

/**
 * PermisosProvider — gate de RBAC en el frontend.
 * ================================================
 * Consulta UNA vez `/api/roles/mias` (permisos del usuario actual) y expone
 * helpers `can(accion)` / `canVer(vista)` para:
 *   - filtrar la navegación del sidebar por las vistas asignadas al rol,
 *   - mostrar/ocultar botones de acción (crear/editar/borrar/…),
 *   - el route-guard que redirige si se entra a una vista no permitida.
 *
 * Estrategia anti-parpadeo: mientras carga (o si la consulta falla) es
 * OPTIMISTA (permite todo). El backend (`require_permiso`) es la barrera real,
 * así que un permiso de más en el cliente nunca es un problema de seguridad —
 * solo evita el flash de "menú vacío" en la primera carga.
 */

import { createContext, useContext, useEffect, useMemo, useState } from "react"
import { api } from "@/lib/api"

export type PermisosState = {
  loading: boolean
  isAdmin: boolean
  vistas: string[]
  acciones: string[]
  /** ¿El rol puede ejecutar esta acción? (`modulo:accion`, ej. "clientes:crear") */
  can: (accion: string) => boolean
  /** ¿El rol puede ver esta vista? (clave de sidebar, ej. "clientes") */
  canVer: (vista: string) => boolean
}

const PermisosContext = createContext<PermisosState | null>(null)

export function PermisosProvider({
  userRole,
  children,
}: {
  userRole?: string
  children: React.ReactNode
}) {
  const [loading, setLoading] = useState(true)
  const [errored, setErrored] = useState(false)
  const [isAdmin, setIsAdmin] = useState(userRole === "admin")
  const [vistas, setVistas] = useState<string[]>([])
  const [acciones, setAcciones] = useState<string[]>([])

  useEffect(() => {
    let alive = true
    api.roles
      .mias()
      .then((m) => {
        if (!alive) return
        setIsAdmin(!!m.protegido || m.clave === "admin")
        setVistas(m.vistas ?? [])
        setAcciones(m.acciones ?? [])
      })
      .catch(() => {
        if (alive) setErrored(true) // fallback permisivo (el backend igual bloquea)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  const value = useMemo<PermisosState>(() => {
    // Optimista mientras carga o si falló la consulta.
    const allowAll = isAdmin || loading || errored
    return {
      loading,
      isAdmin,
      vistas,
      acciones,
      can: (a: string) => allowAll || acciones.includes(a),
      canVer: (v: string) => allowAll || vistas.includes(v),
    }
  }, [loading, errored, isAdmin, vistas, acciones])

  return <PermisosContext.Provider value={value}>{children}</PermisosContext.Provider>
}

const PERMISIVO: PermisosState = {
  loading: false,
  isAdmin: true,
  vistas: [],
  acciones: [],
  can: () => true,
  canVer: () => true,
}

/** Hook de permisos. Fuera del provider devuelve un fallback permisivo (no rompe páginas). */
export function usePermisos(): PermisosState {
  return useContext(PermisosContext) ?? PERMISIVO
}
