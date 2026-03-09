"use client"

/**
 * Cliente API: usa el proxy /api/backend para enviar el token desde la cookie httpOnly.
 * Importar desde @/lib/api para usar las acciones centralizadas.
 */

import type {
  Cliente, ClienteProducto, ClientesListParams, ClientesListResponse,
  DashboardStats, Filtros,
  RazonSocial,
  UserAdmin, CreateUserRequest, UpdateUserRequest,
  OrdenTrabajo, OrdenesListResponse, OrdenesListParams, CreateOrdenRequest,
} from "./types"

const PROXY = "/api/backend"

function buildPath(path: string, params?: Record<string, string | number | undefined>): string {
  const base = path.startsWith("/api/") ? path.replace(/^\/api\//, "") : path
  if (!params) return `${PROXY}/${base}`
  const sp = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== "") sp.set(k, String(v))
  })
  const q = sp.toString()
  return `${PROXY}/${base}${q ? `?${q}` : ""}`
}

async function request<T>(
  path: string,
  options?: Omit<RequestInit, "body"> & { method?: string; body?: object; params?: Record<string, string | number | undefined> }
): Promise<T> {
  const { method = "GET", body, params, ...rest } = options || {}
  const url = params ? buildPath(path, params) : buildPath(path)
  const res = await fetch(url, {
    ...rest,
    method,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(rest.headers as Record<string, string>),
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  })
  if (!res.ok) {
    const text = await res.text()
    let msg = text || `Error ${res.status}`
    try {
      const json = JSON.parse(text)
      if (json.detail) msg = typeof json.detail === "string" ? json.detail : JSON.stringify(json.detail)
    } catch {
      /* usar text tal cual */
    }
    throw new Error(msg)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers genéricos
// ─────────────────────────────────────────────────────────────────────────────

export const get = <T>(path: string, params?: Record<string, string | number | undefined>) =>
  request<T>(path, { method: "GET", params })

export const post = <T>(path: string, body?: object) =>
  request<T>(path, { method: "POST", body })

export const put = <T>(path: string, body?: object) =>
  request<T>(path, { method: "PUT", body })

export const del = <T>(path: string) =>
  request<T>(path, { method: "DELETE" })

// ─────────────────────────────────────────────────────────────────────────────
// apiFetch (alias para request)
// ─────────────────────────────────────────────────────────────────────────────

export async function apiFetch<T>(
  path: string,
  options?: Omit<RequestInit, "body"> & { method?: string; body?: object }
): Promise<T> {
  const { method = "GET", body, ...rest } = options || {}
  return request<T>(path, { method, body, ...rest })
}

// ─────────────────────────────────────────────────────────────────────────────
// Acciones API
// ─────────────────────────────────────────────────────────────────────────────

export const api = {
  clientes: {
    list: (params?: ClientesListParams) => {
      const p = params as Record<string, string | number | undefined> | undefined
      return get<ClientesListResponse>("/api/clientes", p)
    },
    get: (id: number) => get<Cliente>(`/api/clientes/${id}`),
    create: (data: object) => post<Cliente>("/api/clientes", data),
    update: (id: number, data: object) => put<Cliente>(`/api/clientes/${id}`, data),
  },
  dashboard: {
    stats: () => get<DashboardStats>("/api/dashboard/stats"),
    filtros: () => get<Filtros>("/api/dashboard/filtros"),
  },
  /** Auth (usa rutas Next.js locales + proxy para /me) */
  auth: {
    login: (email: string, password: string) =>
      fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include",
      }),
    logout: () =>
      fetch("/api/auth/logout", { method: "POST", credentials: "include" }),
    register: (email: string, password: string) =>
      fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include",
      }),
    /** Datos del usuario autenticado (via proxy → backend /auth/me) */
    me: () => get<UserAdmin>("/api/auth/me"),
  },
  /** Admin (gestión de usuarios) */
  admin: {
    listUsers: () => get<UserAdmin[]>("/api/admin/usuarios"),
    createUser: (data: CreateUserRequest) => post<UserAdmin>("/api/admin/usuarios", data),
    updateUser: (id: number, data: UpdateUserRequest) => put<UserAdmin>(`/api/admin/usuarios/${id}`, data),
  },
  /** Razones Sociales (entidades legales que agrupan marcas) */
  razonessociales: {
    list: (params?: { search?: string; per_page?: number }) => {
      const p = params as Record<string, string | number | undefined> | undefined
      return get<{ data: RazonSocial[]; total: number }>("/api/razones-sociales", p)
    },
    get: (id: number) =>
      get<RazonSocial & { marcas: { id: number; id_cliente: number | null; marca: string | null }[] }>(`/api/razones-sociales/${id}`),
    create: (data: { razon_social: string; cuit?: string }) =>
      post<RazonSocial>("/api/razones-sociales", data),
    update: (id: number, data: { razon_social?: string; cuit?: string }) =>
      put<RazonSocial>(`/api/razones-sociales/${id}`, data),
  },
  /** Productos de clientes (1:N) */
  productos: {
    create: (clienteId: number, data: object) =>
      post<ClienteProducto>(`/api/clientes/${clienteId}/productos`, data),
    update: (clienteId: number, productoId: number, data: object) =>
      put<ClienteProducto>(`/api/clientes/${clienteId}/productos/${productoId}`, data),
    delete: (clienteId: number, productoId: number) =>
      del<void>(`/api/clientes/${clienteId}/productos/${productoId}`),
  },
  /** Órdenes de Trabajo */
  ordenes: {
    list: (params?: OrdenesListParams) => {
      const p = params as Record<string, string | number | undefined> | undefined
      return get<OrdenesListResponse>("/api/ordenes", p)
    },
    get: (id: number) => get<OrdenTrabajo>(`/api/ordenes/${id}`),
    create: (data: CreateOrdenRequest) => post<OrdenTrabajo>("/api/ordenes", data),
    update: (id: number, data: Partial<CreateOrdenRequest>) => put<OrdenTrabajo>(`/api/ordenes/${id}`, data),
    delete: (id: number) => del<void>(`/api/ordenes/${id}`),
  },
}
