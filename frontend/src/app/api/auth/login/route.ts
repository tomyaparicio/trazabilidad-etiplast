import { NextRequest, NextResponse } from "next/server"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const res = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return NextResponse.json(
        { error: data.detail || "Error al iniciar sesión" },
        { status: res.status }
      )
    }
    const token = data.access_token
    if (!token) {
      return NextResponse.json({ error: "No se recibió token" }, { status: 500 })
    }
    const response = NextResponse.json({ ok: true })
    response.cookies.set("auth-token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 días
      path: "/",
    })
    return response
  } catch (e) {
    console.error("Login error:", e)
    return NextResponse.json({ error: "Error de conexión" }, { status: 500 })
  }
}
