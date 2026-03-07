"use client"

/**
 * Cliente API: usa el proxy /api/backend para enviar el token desde la cookie httpOnly.
 * Importar desde @/lib/api para usar las acciones centralizadas.
 */

import type { Cliente, ClientesListParams, ClientesListResponse, DashboardStats, Filtros, UserAdmin, CreateUserRequest, UpdateUserRequest } from "./types"

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
  /** Auth (usa rutas Next.js locales) */
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
  },
  /** Admin (gestión de usuarios) */
  admin: {
    listUsers: () => get<UserAdmin[]>("/api/admin/usuarios"),
    createUser: (data: CreateUserRequest) => post<UserAdmin>("/api/admin/usuarios", data),
    updateUser: (id: number, data: UpdateUserRequest) => put<UserAdmin>(`/api/admin/usuarios/${id}`, data),
  },
}
