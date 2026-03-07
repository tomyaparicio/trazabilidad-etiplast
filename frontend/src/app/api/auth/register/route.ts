import { NextRequest, NextResponse } from "next/server"

const API_URL = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || "http://localhost:8000"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const email = body.email?.trim()
    const password = body.password
    if (!email || !password) {
      return NextResponse.json({ error: "Email y contraseña son requeridos" }, { status: 400 })
    }
    const url = `${API_URL.replace(/\/$/, "")}/auth/register`
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      let msg = data.detail || data.error || "Error al registrarse"
      if (Array.isArray(msg)) msg = msg.map((x: { msg?: string }) => x?.msg).filter(Boolean).join("; ") || "Error al registrarse"
      else if (typeof msg !== "string") msg = String(msg)
      console.error("[register] Backend error:", res.status, msg)
      return NextResponse.json({ error: msg }, { status: res.status })
    }
    return NextResponse.json(data)
  } catch (e) {
    console.error("[register] Error:", e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error de conexión con el backend" },
      { status: 500 }
    )
  }
}
