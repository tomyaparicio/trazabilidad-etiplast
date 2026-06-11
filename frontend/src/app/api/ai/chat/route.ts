import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { OPENAI_TOOLS } from "@/lib/ai/openai-tools"
import { executeTool } from "@/lib/voice/tool-executor"
import type { ChatMessage } from "@/lib/voice/types"

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const OPENAI_MODEL   = process.env.OPENAI_MODEL || "gpt-4o"
const OPENAI_URL     = "https://api.openai.com/v1/chat/completions"

const SYSTEM_PROMPT = `Sos el asistente de texto del ERP interno de Etiplast, una empresa argentina que fabrica etiquetas y envases plásticos.
Ayudás a los usuarios por chat a consultar clientes, ver y editar órdenes de trabajo, crear nuevas órdenes y navegar por el sistema.
Respondé siempre en español rioplatense, de forma clara y concisa.
Podés usar markdown liviano: **negrita** para resaltar y listas con guiones (-). No uses tablas, encabezados ni bloques de código.
No menciones IDs internos en tus respuestas, usá nombres y números de OT (ej: OT-0042) que el usuario pueda entender.
Si te preguntan algo ajeno al ERP (clima, noticias, precios de mercado), aclará que solo manejás información del sistema.

## Consultas del ERP
- "cuántas órdenes hay", "resumen", "estadísticas" → usar estadisticas_dashboard
- "mostrar órdenes", "listar órdenes", "qué órdenes hay" → usar listar_ordenes
- Al listar órdenes, mencioná el número de OT, el cliente y el estado de cada una (una por línea, con guión).
- "quiero ver la OT-0042", "mostrame la orden 42" → usar obtener_orden

## Búsqueda y selección de clientes
La búsqueda ya tiene tolerancia a errores de tipeo, así que intentá con el nombre tal como fue escrito.
Si buscar_clientes devuelve varios resultados:
- Mostráselos numerados: "1. Marca A, 2. Marca B, ¿cuál es?"
- Cuando el usuario responda "el 1", "el primero", "el dos", etc., usá el [ID interno] correspondiente del resultado.
- Si devuelve "coincidencia aproximada", confirmá: "¿Te referís a [marca]?"
Cuando necesites el ID de un cliente para crear una orden, siempre usá el [ID interno] que aparece en la lista, NO el N° visible.

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

type OpenAIToolCall = {
  id: string
  type: "function"
  function: { name: string; arguments: string }
}

type OpenAIMessage =
  | { role: "system" | "user" | "assistant"; content: string }
  | { role: "assistant"; content: string | null; tool_calls: OpenAIToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string }

export async function POST(request: NextRequest) {
  if (!OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY no configurada" }, { status: 500 })
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

  // System prompt personalizado según rol
  const roleContext = userRole === "admin"
    ? `\n\n## Usuario actual\nSos ${userEmail} con rol ADMIN. Tenés acceso completo: podés crear, editar, eliminar órdenes y ver información de todos los usuarios.`
    : `\n\n## Usuario actual\nSos ${userEmail} con rol OPERADOR. Podés consultar y crear órdenes, pero NO podés eliminar registros ni ver datos de otros usuarios.`

  const messages: OpenAIMessage[] = [
    { role: "system", content: SYSTEM_PROMPT + roleContext },
  ]
  for (const msg of history) {
    messages.push({ role: msg.role === "user" ? "user" : "assistant", content: msg.content })
  }
  messages.push({ role: "user", content: message })

  const toolsUsed: string[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let detectedAction: any = null

  // ── Loop de function calling ───────────────────────────────────────────────
  for (let i = 0; i < 6; i++) {
    let openaiRes: Response
    try {
      openaiRes = await fetch(OPENAI_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          messages,
          tools: OPENAI_TOOLS,
          tool_choice: "auto",
          temperature: 0.7,
          max_tokens: 900,
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
    const choiceMsg = data.choices?.[0]?.message
    if (!choiceMsg) {
      return NextResponse.json({ error: "OpenAI no devolvió respuesta" }, { status: 502 })
    }

    const toolCalls: OpenAIToolCall[] = choiceMsg.tool_calls ?? []

    if (toolCalls.length === 0) {
      // Respuesta de texto final — incluir action si se detectó en alguna vuelta
      const responseText = choiceMsg.content?.trim() || "No entendí la consulta."
      return NextResponse.json({ response: responseText, toolsUsed, action: detectedAction ?? undefined })
    }

    // Agregar la respuesta del modelo con los tool calls al historial
    messages.push({ role: "assistant", content: choiceMsg.content ?? null, tool_calls: toolCalls })

    // Ejecutar cada tool
    for (const toolCall of toolCalls) {
      const name = toolCall.function.name
      toolsUsed.push(name)

      let args: Record<string, unknown> = {}
      try { args = JSON.parse(toolCall.function.arguments || "{}") } catch { /* ignore */ }

      const result = await executeTool(name, args, token)

      if (result.startsWith("__ETI_ACTION__:")) {
        try { detectedAction = JSON.parse(result.slice("__ETI_ACTION__:".length)) } catch { /* ignore */ }
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: "Listo, ejecutando la acción en pantalla.",
        })
      } else {
        messages.push({ role: "tool", tool_call_id: toolCall.id, content: result })
      }
    }
  }

  return NextResponse.json({ response: "No pude completar la consulta.", toolsUsed, action: detectedAction ?? undefined })
}
