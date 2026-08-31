import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  return proxy(request, context, "GET")
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  return proxy(request, context, "POST")
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  return proxy(request, context, "PUT")
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  return proxy(request, context, "DELETE")
}

async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
  method: string
) {
  const { path } = await context.params
  const pathStr = path.join("/")
  const url = new URL(request.url)
  const search = url.searchParams.toString()
  const targetUrl = `${API_URL}/api/${pathStr}${search ? `?${search}` : ""}`

  const cookieStore = await cookies()
  const token = cookieStore.get("auth-token")?.value
  if (!token) {
    return NextResponse.json({ detail: "No autorizado" }, { status: 401 })
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  }

  let body: string | undefined
  if (["POST", "PUT"].includes(method)) {
    try {
      body = await request.text()
    } catch {
      /* ignore */
    }
  }

  const res = await fetch(targetUrl, {
    method,
    headers,
    body: body || undefined,
  })

  // Respuestas binarias (ej: export a Excel) — passthrough sin decodificar como texto.
  const contentType = res.headers.get("content-type") || ""
  const esTexto = contentType.includes("application/json") || contentType.startsWith("text/")
  if (res.ok && !esTexto && contentType) {
    const respHeaders: Record<string, string> = { "Content-Type": contentType }
    const disposition = res.headers.get("content-disposition")
    if (disposition) respHeaders["Content-Disposition"] = disposition
    return new NextResponse(await res.arrayBuffer(), { status: res.status, headers: respHeaders })
  }

  const text = await res.text()
  let data: unknown
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }

  if (!res.ok) {
    return NextResponse.json(data ?? { detail: text }, { status: res.status })
  }
  return NextResponse.json(data ?? {})
}
