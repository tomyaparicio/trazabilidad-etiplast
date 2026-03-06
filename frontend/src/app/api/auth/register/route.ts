import { NextRequest, NextResponse } from "next/server"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const res = await fetch(`${API_URL}/auth/crear-usuario`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: body.email, password: body.password }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return NextResponse.json(
        { error: data.detail || "Error al registrarse" },
        { status: res.status }
      )
    }
    return NextResponse.json(data)
  } catch (e) {
    console.error("Register error:", e)
    return NextResponse.json({ error: "Error de conexión" }, { status: 500 })
  }
}
