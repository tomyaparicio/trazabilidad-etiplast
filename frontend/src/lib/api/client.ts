"use client"

import { getToken } from "@/lib/auth"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

export function getAuthHeaders(): HeadersInit {
  const token = getToken()
  if (!token) {
    throw new Error("No hay sesión activa")
  }
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  }
}

export async function apiFetch<T>(
  path: string,
  options?: Omit<RequestInit, "body"> & { method?: string; body?: object }
): Promise<T> {
  const headers = getAuthHeaders()
  const { method = "GET", body, ...rest } = options || {}
  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    method,
    headers: { ...headers, ...rest.headers },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `Error ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

export const api = {
  clientes: {
    list: (params?: { page?: number; per_page?: number; search?: string; rubro?: string; provincia?: string }) => {
      const sp = new URLSearchParams()
      if (params?.page) sp.set("page", String(params.page))
      if (params?.per_page) sp.set("per_page", String(params.per_page))
      if (params?.search) sp.set("search", params.search)
      if (params?.rubro) sp.set("rubro", params.rubro)
      if (params?.provincia) sp.set("provincia", params.provincia)
      const q = sp.toString()
      return apiFetch<{ data: unknown[]; total: number; page: number; per_page: number; total_pages: number }>(
        `/api/clientes${q ? `?${q}` : ""}`
      )
    },
    get: (id: number) => apiFetch<unknown>(`/api/clientes/${id}`),
    create: (data: object) => apiFetch<unknown>("/api/clientes", { method: "POST", body: data }),
    update: (id: number, data: object) => apiFetch<unknown>(`/api/actualizaCliente/${id}`, { method: "PUT", body: data }),
  },
  filtros: () => apiFetch<{ rubros: string[]; provincias: string[] }>("/api/filtros"),
  dashboardStats: () =>
    apiFetch<{ total_clientes: number; rubros: Array<{ nombre: string; cantidad: number }>; provincias: Array<{ nombre: string; cantidad: number }> }>(
      "/api/dashboard/stats"
    ),
}
