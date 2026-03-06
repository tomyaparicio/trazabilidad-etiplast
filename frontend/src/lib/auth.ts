/**
 * Utilidades de auth sin Supabase.
 * El token se guarda en cookie httpOnly por el backend.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

export async function getSession(): Promise<{ user: { id: number; email: string; full_name: string | null } } | null> {
  try {
    const res = await fetch("/api/backend/auth/me", { credentials: "include" })
    if (!res.ok) return null
    const user = await res.json()
    return { user }
  } catch {
    return null
  }
}
