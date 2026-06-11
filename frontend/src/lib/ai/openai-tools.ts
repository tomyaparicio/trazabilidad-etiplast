// Conversor de tools: formato Gemini (functionDeclarations, tipos en MAYÚSCULAS)
// → formato OpenAI (tools [{type:"function", function:{...}}], JSON Schema en minúsculas)

import { GEMINI_TOOLS } from "@/lib/voice/tools"

type GeminiSchema = {
  type: string
  description?: string
  properties?: Record<string, GeminiSchema>
  items?: GeminiSchema
  required?: readonly string[]
  enum?: readonly string[]
}

type GeminiFunctionDeclaration = {
  name: string
  description: string
  parameters: GeminiSchema
}

type GeminiToolGroup = {
  functionDeclarations: readonly GeminiFunctionDeclaration[]
}

export type OpenAITool = {
  type: "function"
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

/** Tools que no se exponen al chat de texto (la búsqueda web es exclusiva del agente de voz/Gemini) */
const TOOLS_EXCLUIDAS = ["buscar_en_internet"]

/** Convierte un schema de Gemini (OBJECT/STRING/NUMBER...) a JSON Schema estándar (object/string/number...) */
function convertirSchema(schema: GeminiSchema): Record<string, unknown> {
  const out: Record<string, unknown> = { type: schema.type.toLowerCase() }
  if (schema.description) out.description = schema.description
  if (schema.enum) out.enum = [...schema.enum]
  if (schema.properties) {
    const props: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(schema.properties)) {
      props[key] = convertirSchema(value)
    }
    out.properties = props
  }
  if (schema.items) out.items = convertirSchema(schema.items)
  if (schema.required) out.required = [...schema.required]
  return out
}

/**
 * Función pura: convierte el array de tool-groups de Gemini al formato de tools de OpenAI.
 * Excluye las tools listadas en TOOLS_EXCLUIDAS.
 */
export function geminiToOpenAITools(geminiTools: readonly GeminiToolGroup[]): OpenAITool[] {
  const tools: OpenAITool[] = []
  for (const group of geminiTools) {
    for (const decl of group.functionDeclarations) {
      if (TOOLS_EXCLUIDAS.includes(decl.name)) continue
      tools.push({
        type: "function",
        function: {
          name: decl.name,
          description: decl.description,
          parameters: convertirSchema(decl.parameters),
        },
      })
    }
  }
  return tools
}

export const OPENAI_TOOLS: OpenAITool[] = geminiToOpenAITools(
  GEMINI_TOOLS as unknown as GeminiToolGroup[]
)
