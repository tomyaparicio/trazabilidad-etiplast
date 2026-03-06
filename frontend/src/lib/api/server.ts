/**
 * API server-side: usa el proxy con token desde cookie.
 */

import { cookies } from "next/headers"

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

export async function getServerUser(): Promise<{ id: number; email: string; full_name: string | null } | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get("auth-token")?.value
  if (!token) return null
  try {
    const res = await fetch(`${BACKEND_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export async function getServerAuthHeaders(): Promise<HeadersInit> {
  const cookieStore = await cookies()
  const token = cookieStore.get("auth-token")?.value
  if (!token) {
    throw new Error("No hay sesión activa")
  }
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  }
}

export async function apiFetchServer<T>(
  path: string,
  options?: Omit<RequestInit, "body"> & { method?: string; body?: object }
): Promise<T> {
  const cookieStore = await cookies()
  const token = cookieStore.get("auth-token")?.value
  if (!token) {
    throw new Error("No hay sesión activa")
  }
  const proxyPath = path.replace(/^\/api\//, "")
  const base = typeof window === "undefined"
    ? (process.env.NEXT_PUBLIC_APP_URL ? `https://${process.env.NEXT_PUBLIC_APP_URL.replace(/^https?:\/\//, "")}` : "http://localhost:3000")
    : ""
  const url = `${base}/api/backend/${proxyPath}`
  const { method = "GET", body, ...rest } = options || {}
  const isCacheable = method === "GET" && path.includes("/dashboard/")
  const res = await fetch(url, {
    ...rest,
    method,
    headers: {
      "Content-Type": "application/json",
      Cookie: `auth-token=${token}`,
      ...(rest.headers as Record<string, string>),
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
    ...(isCacheable ? { next: { revalidate: 60 } } : { cache: "no-store" }),
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
