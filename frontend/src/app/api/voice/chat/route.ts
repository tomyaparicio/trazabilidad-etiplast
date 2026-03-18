import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { GEMINI_TOOLS } from "@/lib/voice/tools"
import { executeTool } from "@/lib/voice/tool-executor"
import type { ChatMessage } from "@/lib/voice/types"

const GEMINI_API_KEY = process.env.GEMINI_API_KEY
const GEMINI_MODEL   = process.env.GEMINI_MODEL || "gemini-2.5-flash"
const GEMINI_URL     = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

const SYSTEM_PROMPT = `Sos el asistente de voz del ERP interno de Etiplast, una empresa argentina que fabrica etiquetas y envases plásticos.
Ayudás a los operadores a consultar clientes, ver y editar órdenes de trabajo, crear nuevas órdenes y buscar información en internet.
Respondé siempre en español argentino de forma concisa ya que la respuesta será leída en voz alta.
No menciones IDs internos en tus respuestas, usá nombres y números de OT (ej: OT-0042) que el usuario pueda entender.
Si una respuesta tiene varios ítems, separá cada uno con salto de línea para que sea más fácil de leer.

## Búsqueda en internet
- Usá buscar_en_internet cuando el usuario pregunte algo fuera del ERP: precios, proveedores, noticias, cotizaciones, clima, definiciones, etc.
- Frases clave: "¿cuánto cuesta...?", "busca...", "¿qué es...?", "cotización de...", "precio del dólar", etc.
- Resumí la respuesta en 2-3 oraciones máximo, sin mencionar URLs.

## Consultas del ERP
- "cuántas órdenes hay", "resumen", "estadísticas" → usar estadisticas_dashboard
- "mostrar órdenes", "listar órdenes", "qué órdenes hay" → usar listar_ordenes
- Al listar órdenes, mencioná el número de OT, el cliente y el estado de cada una.
- "quiero ver la OT-0042", "mostrame la orden 42" → usar obtener_orden

## Búsqueda y selección de clientes (importante para reconocimiento de voz)
La búsqueda ya tiene tolerancia fonética automática, así que intentá con el nombre tal como fue dicho.
Si buscar_clientes devuelve varios resultados:
- Mostráselos numerados: "1. Marca A, 2. Marca B, ¿cuál es?"
- Cuando el usuario responda "el 1", "el primero", "el dos", "el segundo", etc., usá el [ID interno] correspondiente del resultado.
- Si devuelve "coincidencia aproximada", confirmá: "¿Te referís a [marca]?"
Cuando necesites el ID de un cliente para crear una orden, siempre usá el [ID interno] que aparece en la lista, NO el N° visible.
Los números pueden ser dicho como palabras ("cuarenta y dos" = 42, "el quinto" = 5): convertílos correctamente al llamar tools.

## Flujo para CREAR una orden de trabajo
Cuando el usuario quiera crear una orden, seguí este flujo conversacional de a UNO por vez:

1. Preguntá el nombre del cliente → llamá buscar_clientes → confirmá cuál es con el usuario
2. Preguntá el color de extrusión (Blanco, Cristal, Negro, etc.)
3. Preguntá si tiene tratamiento corona (Con o Sin)
4. Preguntá el micronaje en µ (ej: 60)
5. Preguntá la formulación (ej: 2045/208) — si no sabe, omitir
6. Preguntá el tipo de envase para troquelado (ej: Jubahi, Doypack, Bolsa) — si no aplica, omitir
7. Preguntá la cantidad de unidades — si no sabe, omitir
8. Con esos datos, usá preparar_formulario_orden para abrir el formulario visual. SIEMPRE usar preparar_formulario_orden, NUNCA crear_orden_borrador, salvo que el usuario diga explícitamente "creala directo".

Reglas de creación:
- Hacé UNA SOLA pregunta a la vez.
- Si el usuario dice "no sé", "ninguno" o "omitir", saltá ese campo.
- Si el usuario ya da varios datos de golpe (ej: "haceme una para Unilever en blanco 60 micrones"), recopilá todos los que dio y preguntá solo los que faltan.
- Al abrir el formulario, confirmá: "Listo, abrí el formulario con los datos de [cliente]. Revisalo y guardalo cuando estés listo."

## Edición de órdenes existentes
Cuando el usuario pida cambiar campos de una orden existente:
- Frases: "cambiá el color de la OT-0042", "actualizá el micronaje de la orden 15 a 80", "modificá la formulación"
- Si no dijeron el número de OT, preguntá cuál es.
- Llamá editar_orden con el numero_ot y solo los campos a cambiar.
- Confirmá lo que se modificó: "Listo, actualicé la OT-XXXX. Cambié [campos]."
- NO usar actualizar_estado_orden para cambiar campos (solo para cambiar el estado: borrador/pendiente/en_proceso/etc.)

## Cambio de estado
- "pasá la orden 42 a pendiente", "ponela en proceso", "completá la OT-0015" → usar actualizar_estado_orden
- Estados válidos: borrador, pendiente, en_proceso, completada, cancelada

## Navegación
- "llevame a clientes", "ir a órdenes", "mostrar dashboard" → usar navegar_a
- Destinos: ordenes, clientes, dashboard, administracion`

type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: { content: string } } }

type GeminiContent = {
  role: "user" | "model"
  parts: GeminiPart[]
}

function buildContents(message: string, history: ChatMessage[]): GeminiContent[] {
  const contents: GeminiContent[] = []

  for (const msg of history) {
    contents.push({
      role: msg.role === "user" ? "user" : "model",
      parts: [{ text: msg.content }],
    })
  }

  contents.push({ role: "user", parts: [{ text: message }] })
  return contents
}

export async function POST(request: NextRequest) {
  if (!GEMINI_API_KEY) {
    return NextResponse.json({ error: "GEMINI_API_KEY no configurada" }, { status: 500 })
  }

  const cookieStore = await cookies()
  const token = cookieStore.get("auth-token")?.value
  if (!token) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  // Decodificar rol y email del JWT
  let userRole  = "user"
  let userEmail = "usuario"
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString())
    userRole  = payload.role  ?? "user"
    userEmail = payload.sub   ?? "usuario"
  } catch { /* ignorar */ }

  let body: { message: string; history: ChatMessage[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 })
  }

  const { message, history = [] } = body
  if (!message?.trim()) {
    return NextResponse.json({ error: "Mensaje vacío" }, { status: 400 })
  }

  const contents = buildContents(message, history)
  const toolsUsed: string[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let detectedAction: any = null

  // System prompt personalizado según rol
  const roleContext = userRole === "admin"
    ? `\n\n## Usuario actual\nSos ${userEmail} con rol ADMIN. Tenés acceso completo: podés crear, editar, eliminar órdenes y ver información de todos los usuarios.`
    : `\n\n## Usuario actual\nSos ${userEmail} con rol OPERADOR. Podés consultar y crear órdenes, pero NO podés eliminar registros ni ver datos de otros usuarios.`

  const effectivePrompt = SYSTEM_PROMPT + roleContext

  // ── Loop de function calling ───────────────────────────────────────────────
  for (let i = 0; i < 6; i++) {
    const geminiBody = {
      system_instruction: { parts: [{ text: effectivePrompt }] },
      contents,
      tools: [...GEMINI_TOOLS],
      generationConfig: { temperature: 0.7, maxOutputTokens: 700 },
    }

    let geminiRes: Response
    try {
      geminiRes = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(geminiBody),
      })
    } catch (err) {
      return NextResponse.json(
        { error: `Error de red con Gemini: ${err instanceof Error ? err.message : "desconocido"}` },
        { status: 502 }
      )
    }

    if (!geminiRes.ok) {
      const errText = await geminiRes.text()
      return NextResponse.json({ error: `Gemini error ${geminiRes.status}: ${errText}` }, { status: 502 })
    }

    const geminiData = await geminiRes.json()
    const candidate = geminiData.candidates?.[0]
    if (!candidate) {
      return NextResponse.json({ error: "Gemini no devolvió respuesta" }, { status: 502 })
    }

    const parts: GeminiPart[] = candidate.content?.parts ?? []

    // ¿Hay function calls?
    const fnCalls = parts.filter(
      (p): p is { functionCall: { name: string; args: Record<string, unknown> } } =>
        "functionCall" in p
    )

    if (fnCalls.length === 0) {
      // Respuesta de texto final — incluir action si se detectó en esta vuelta
      const textPart = parts.find((p): p is { text: string } => "text" in p)
      const responseText = textPart?.text ?? "No entendí la consulta."
      return NextResponse.json({ response: responseText, toolsUsed, action: detectedAction ?? undefined })
    }

    // Agregar la respuesta del modelo con los function calls al historial
    contents.push({ role: "model", parts })

    // Ejecutar cada tool
    const toolResponseParts: GeminiPart[] = []
    for (const fnCall of fnCalls) {
      const { name, args } = fnCall.functionCall
      toolsUsed.push(name)
      const result = await executeTool(name, args, token)

      if (result.startsWith("__ETI_ACTION__:")) {
        try { detectedAction = JSON.parse(result.slice("__ETI_ACTION__:".length)) } catch { /* ignore */ }
        toolResponseParts.push({
          functionResponse: { name, response: { content: "Listo, ejecutando la acción en pantalla." } },
        })
      } else {
        toolResponseParts.push({
          functionResponse: { name, response: { content: result } },
        })
      }
    }

    contents.push({ role: "user", parts: toolResponseParts })
  }

  return NextResponse.json({ response: "No pude completar la consulta.", toolsUsed, action: detectedAction ?? undefined })
}
