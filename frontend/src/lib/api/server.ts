/**
 * API server-side: obtiene el token de Supabase y llama al backend.
 * Para usar en Server Components.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

export async function getServerAuthHeaders(): Promise<HeadersInit> {
  const { createClient } = await import("@/lib/supabase/server")
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
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
  const headers = await getServerAuthHeaders()
  const { method = "GET", body, ...rest } = options || {}
  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    method,
    headers: { ...headers, ...rest.headers },
    ...(body !== undefined && { body: JSON.stringify(body) }),
    cache: "no-store",
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `Error ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}
