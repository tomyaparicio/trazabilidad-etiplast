"use client"

const TOKEN_KEY = "token"

export function getToken(): string | null {
  if (typeof document === "undefined") return null
  const match = document.cookie.match(new RegExp(`(?:^|; )${TOKEN_KEY}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

export function setToken(token: string) {
  document.cookie = `${TOKEN_KEY}=${encodeURIComponent(token)}; path=/; max-age=${60 * 60 * 24}; SameSite=Lax`
}

export function removeToken() {
  document.cookie = `${TOKEN_KEY}=; path=/; max-age=0`
}

export function getUserEmail(): string | null {
  const token = getToken()
  if (!token) return null
  try {
    const payload = JSON.parse(atob(token.split(".")[1]))
    return payload.sub || null
  } catch {
    return null
  }
}
