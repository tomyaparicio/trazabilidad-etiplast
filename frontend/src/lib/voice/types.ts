export type VoiceState = "idle" | "listening" | "processing" | "speaking" | "error"

export type ChatMessage = {
  role: "user" | "assistant"
  content: string
  toolsUsed?: string[]
}

export type VoiceChatRequest = {
  message: string
  history: ChatMessage[]
}

export type OrderPrefill = {
  cliente_id: number
  cliente_nombre?: string
  extrusion_color?: string
  extrusion_trat?: string
  extrusion_espesor?: number
  extrusion_formulacion?: string
  extrusion_ancho?: number
  extrusion_cant_bob?: number
  troquelado_alto?: number
  troquelado_ancho?: number
  troquelado_envase?: string
  impresion_colores?: string[]
  cantidad?: number
  observaciones?: string
  fecha_entrega?: string
}

export type EtiAction =
  | { type: "open_order_form"; payload: OrderPrefill }
  | { type: "navigate";        payload: { path: string; label: string } }

export type VoiceChatResponse = {
  response:   string
  toolsUsed:  string[]
  action?:    EtiAction
}
