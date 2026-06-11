import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

const MAX_SIZE_BYTES = 4 * 1024 * 1024 // 4MB
const TIPOS_PERMITIDOS = ["image/jpeg", "image/png", "image/webp", "application/pdf"]

// ── Schema estricto de extracción (Structured Outputs) ───────────────────────
const EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "cliente_nombre",
    "extrusion_color",
    "extrusion_trat",
    "extrusion_espesor",
    "extrusion_ancho",
    "extrusion_cant_bob",
    "extrusion_formulacion",
    "impresion_colores",
    "impresion_cilindro",
    "troquelado_ancho",
    "troquelado_alto",
    "troquelado_envase",
    "cantidad",
    "fecha_entrega",
    "observaciones",
    "campos_dudosos",
  ],
  properties: {
    cliente_nombre:        { type: ["string", "null"], description: "Nombre del cliente o marca del pedido" },
    extrusion_color:       { type: ["string", "null"], description: "Color de extrusión. Ej: Blanco, Cristal, Negro" },
    extrusion_trat:        { type: ["string", "null"], description: "Tratamiento corona: 'Con' o 'Sin'" },
    extrusion_espesor:     { type: ["number", "null"], description: "Micronaje/espesor en µ. Ej: 60" },
    extrusion_ancho:       { type: ["number", "null"], description: "Ancho de extrusión en mm" },
    extrusion_cant_bob:    { type: ["number", "null"], description: "Cantidad de bobinas" },
    extrusion_formulacion: { type: ["string", "null"], description: "Formulación/lámina. Ej: 2045/208" },
    impresion_colores:     { type: ["array", "null"], items: { type: "string" }, description: "Colores de impresión, uno por elemento" },
    impresion_cilindro:    { type: ["number", "null"], description: "Cilindro de impresión en mm" },
    troquelado_ancho:      { type: ["number", "null"], description: "Ancho del troquelado en mm" },
    troquelado_alto:       { type: ["number", "null"], description: "Alto del troquelado en mm" },
    troquelado_envase:     { type: ["string", "null"], description: "Tipo de envase. Ej: Jubahi, Doypack, Bolsa" },
    cantidad:              { type: ["number", "null"], description: "Cantidad de unidades a producir" },
    fecha_entrega:         { type: ["string", "null"], description: "Fecha de entrega en formato YYYY-MM-DD" },
    observaciones:         { type: ["string", "null"], description: "Observaciones generales del pedido" },
    campos_dudosos:        { type: "array", items: { type: "string" }, description: "Nombres de los campos ilegibles o inciertos" },
  },
}

const INSTRUCCIONES = `Esto es una hoja de pedido de etiquetas/envases flexibles de la empresa Etiplast, manuscrita o impresa, en español.
Extraé los datos del pedido según el schema JSON.

Reglas:
- Extraé SOLO lo que se lee con confianza. Si un campo es ilegible, dudoso o no aparece en el documento, devolvé null en ese campo y agregá su nombre al array campos_dudosos.
- fecha_entrega siempre en formato YYYY-MM-DD (las fechas argentinas DD/MM/YYYY convertilas).
- extrusion_trat es el tratamiento corona: "Con" o "Sin".
- Los valores numéricos van como number, sin unidades (ej: 60, no "60µ").
- impresion_colores es la lista de colores de impresión, un color por elemento.
- No inventes datos que no estén en el documento.`

export async function POST(request: NextRequest) {
  if (!OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY no configurada" }, { status: 500 })
  }

  const cookieStore = await cookies()
  const token = cookieStore.get("auth-token")?.value
  if (!token) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: "Body inválido: se espera multipart/form-data" }, { status: 400 })
  }

  const file = form.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Falta el archivo (campo 'file')" }, { status: 400 })
  }
  if (!TIPOS_PERMITIDOS.includes(file.type)) {
    return NextResponse.json(
      { error: `Tipo de archivo no soportado: ${file.type || "desconocido"}. Aceptados: JPEG, PNG, WebP o PDF.` },
      { status: 400 }
    )
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "El archivo supera el máximo de 4MB" }, { status: 413 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const dataUrl = `data:${file.type};base64,${buffer.toString("base64")}`

  const contenidoArchivo = file.type === "application/pdf"
    ? { type: "input_file", filename: file.name || "orden.pdf", file_data: dataUrl }
    : { type: "input_image", image_url: dataUrl }

  // ── Llamada a OpenAI Responses API con salida estructurada ─────────────────
  let openaiRes: Response
  try {
    openaiRes = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: INSTRUCCIONES },
              contenidoArchivo,
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "orden_extraida",
            strict: true,
            schema: EXTRACTION_SCHEMA,
          },
        },
      }),
    })
  } catch (err) {
    return NextResponse.json(
      { error: `Error de red con OpenAI: ${err instanceof Error ? err.message : "desconocido"}` },
      { status: 502 }
    )
  }

  if (!openaiRes.ok) {
    const errText = await openaiRes.text()
    return NextResponse.json({ error: `OpenAI error ${openaiRes.status}: ${errText}` }, { status: 502 })
  }

  const data = await openaiRes.json()

  // Extraer el texto de salida del shape de la Responses API
  type OutputContent = { type: string; text?: string }
  type OutputItem = { type: string; content?: OutputContent[] }
  const messageItem = ((data.output ?? []) as OutputItem[]).find((o) => o.type === "message")
  const textPart = messageItem?.content?.find((c) => c.type === "output_text")
  if (!textPart?.text) {
    return NextResponse.json({ error: "OpenAI no devolvió texto extraído" }, { status: 502 })
  }

  let extraido: Record<string, unknown>
  try {
    extraido = JSON.parse(textPart.text)
  } catch {
    return NextResponse.json({ error: "OpenAI no devolvió JSON válido" }, { status: 502 })
  }

  // ── Match de cliente contra el backend ──────────────────────────────────────
  let cliente_match: { id: number; marca: string | null } | null = null
  const clienteNombre = extraido.cliente_nombre
  if (typeof clienteNombre === "string" && clienteNombre.trim()) {
    try {
      const url = `${API_URL}/api/clientes?search=${encodeURIComponent(clienteNombre.trim())}&per_page=3`
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      })
      if (res.ok) {
        const clientes = await res.json()
        const first = (clientes.data ?? [])[0] as { id: number; marca?: string | null } | undefined
        if (first) cliente_match = { id: first.id, marca: first.marca ?? null }
      }
    } catch { /* sin match si falla la búsqueda */ }
  }

  return NextResponse.json({ extraido, cliente_match })
}
