"use client"

/**
 * Cliente API: usa el proxy /api/backend para enviar el token desde la cookie.
 */

const getProxyPath = (path: string) => {
  const withoutApi = path.replace(/^\/api\//, "")
  return `/api/backend/${withoutApi}`
}

export async function apiFetch<T>(
  path: string,
  options?: Omit<RequestInit, "body"> & { method?: string; body?: object }
): Promise<T> {
  const url = getProxyPath(path)
  const { method = "GET", body, ...rest } = options || {}
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
  usuarios: {
    list: (params?: { page?: number; per_page?: number; search?: string }) => {
      const sp = new URLSearchParams()
      if (params?.page) sp.set("page", String(params.page))
      if (params?.per_page) sp.set("per_page", String(params.per_page))
      if (params?.search) sp.set("search", params.search)
      const q = sp.toString()
      return apiFetch<{ data: unknown[]; total: number; page: number; per_page: number; total_pages: number }>(
        `/api/usuarios${q ? `?${q}` : ""}`
      )
    },
    create: (data: object) => apiFetch<unknown>("/api/usuarios", { method: "POST", body: data }),
    update: (id: number, data: object) => apiFetch<unknown>(`/api/usuarios/${id}`, { method: "PUT", body: data }),
    toggleActive: (id: number) => apiFetch<unknown>(`/api/usuarios/${id}/toggle-active`, { method: "PUT" }),
  },
  filtros: () => apiFetch<{ rubros: string[]; provincias: string[] }>("/api/filtros"),
  dashboardStats: () =>
    apiFetch<{ total_clientes: number; rubros: Array<{ nombre: string; cantidad: number }>; provincias: Array<{ nombre: string; cantidad: number }> }>(
      "/api/dashboard/stats"
    ),
  auth: {
    me: () => apiFetch<{ id: number; email: string; full_name: string | null }>("/api/auth/me"),
    login: (email: string, password: string) =>
      fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include",
      }),
    logout: () =>
      fetch("/api/auth/logout", { method: "POST", credentials: "include" }),
  },
}
