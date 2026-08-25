"use client"

/**
 * Asistente IA de texto (OpenAI): chat lateral con tools, patrón del voice-agent.
 * Botón flotante con Sparkles a la izquierda del agente de voz (que vive bottom-right).
 * Llama a /api/ai/chat y maneja las actions (navigate / open_order_form).
 */

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Sparkles, ChevronDown, Send, Loader2, X,
  ClipboardList, Navigation,
} from "lucide-react"
import { TOOL_LABELS } from "@/lib/voice/tools"
import type { ChatMessage, EtiAction, VoiceChatResponse } from "@/lib/voice/types"

const MAX_HISTORY = 20

// ── Markdown liviano: **bold** + listas con guiones + saltos de línea ─────────

function renderInline(text: string, keyPrefix: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={`${keyPrefix}-${i}`} className="font-semibold">{part.slice(2, -2)}</strong>
    ) : (
      <span key={`${keyPrefix}-${i}`}>{part}</span>
    )
  )
}

function MarkdownLite({ content }: { content: string }) {
  const lines = content.split("\n")
  const blocks: React.ReactNode[] = []
  let bullets: { text: string; idx: number }[] = []

  const flushBullets = (key: string) => {
    if (bullets.length === 0) return
    blocks.push(
      <ul key={key} className="list-disc pl-4 space-y-0.5">
        {bullets.map((b) => (
          <li key={b.idx}>{renderInline(b.text, `b${b.idx}`)}</li>
        ))}
      </ul>
    )
    bullets = []
  }

  lines.forEach((line, i) => {
    const m = line.match(/^\s*[-*]\s+(.*)/)
    if (m) {
      bullets.push({ text: m[1], idx: i })
    } else {
      flushBullets(`ul-${i}`)
      if (line.trim()) {
        blocks.push(<p key={`p-${i}`}>{renderInline(line, `l${i}`)}</p>)
      } else if (blocks.length > 0) {
        blocks.push(<div key={`sp-${i}`} className="h-1" />)
      }
    }
  })
  flushBullets("ul-end")

  return <div className="space-y-1">{blocks}</div>
}

// ── Banner de acción ejecutada ────────────────────────────────────────────────

function ActionBanner({ action }: { action: EtiAction }) {
  if (action.type === "open_order_form") {
    const cliente = action.payload.cliente_nombre ?? "cliente"
    return (
      <div className="mx-3 mb-2 flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/25 px-3 py-2 text-xs text-emerald-600 dark:text-emerald-400 animate-in slide-in-from-top-2 duration-300">
        <ClipboardList className="w-3.5 h-3.5 shrink-0" />
        <span className="font-medium">Formulario abierto</span>
        <span className="text-emerald-500/70">· {cliente}</span>
      </div>
    )
  }
  if (action.type === "navigate") {
    return (
      <div className="mx-3 mb-2 flex items-center gap-2 rounded-lg bg-blue-500/10 border border-blue-500/25 px-3 py-2 text-xs text-blue-600 dark:text-blue-400 animate-in slide-in-from-top-2 duration-300">
        <Navigation className="w-3.5 h-3.5 shrink-0" />
        <span className="font-medium">Navegando a</span>
        <span className="text-blue-500/70">· {action.payload.label}</span>
      </div>
    )
  }
  return null
}

// ── Wrapper que evita hidratación SSR ─────────────────────────────────────────

export function AiAssistant() {
  const [mounted, setMounted] = useState(false)
  // Mismo patrón que VoiceAgent: evita mismatch de hidratación SSR
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setMounted(true) }, [])
  if (!mounted) return null
  return <AiAssistantContent />
}

// ── Contenido real ────────────────────────────────────────────────────────────

function AiAssistantContent() {
  const router = useRouter()

  const [expanded, setExpanded]   = useState(false)
  const [history, setHistory]     = useState<ChatMessage[]>([])
  const [inputText, setInputText] = useState("")
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [lastAction, setLastAction] = useState<EtiAction | null>(null)

  const historyRef     = useRef<ChatMessage[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef       = useRef<HTMLInputElement>(null)

  useEffect(() => { historyRef.current = history }, [history])

  // Auto-scroll al último mensaje
  useEffect(() => {
    if (expanded) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [history, loading, expanded])

  // Auto-focus al expandir
  useEffect(() => {
    if (expanded) setTimeout(() => inputRef.current?.focus(), 150)
  }, [expanded])

  const sendMessage = async (text: string) => {
    setLoading(true)
    setError(null)

    const userMsg: ChatMessage = { role: "user", content: text }
    setHistory((prev) => {
      const next = [...prev.slice(-MAX_HISTORY), userMsg]
      historyRef.current = next
      return next
    })

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history: historyRef.current.slice(-MAX_HISTORY) }),
      })

      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || `Error ${res.status}`)
      }

      const data: VoiceChatResponse = await res.json()

      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: data.response,
        toolsUsed: data.toolsUsed,
      }
      setHistory((prev) => {
        const next = [...prev.slice(-MAX_HISTORY), assistantMsg]
        historyRef.current = next
        return next
      })

      // ── Despachar acción detectada ──────────────────────────────────────────
      if (data.action) {
        setLastAction(data.action)
        setTimeout(() => setLastAction(null), 5000)

        if (data.action.type === "open_order_form") {
          window.dispatchEvent(
            new CustomEvent("eti:open-order-form", { detail: data.action.payload })
          )
        } else if (data.action.type === "navigate") {
          router.push(data.action.payload.path)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido")
    } finally {
      setLoading(false)
    }
  }

  const handleSend = () => {
    const text = inputText.trim()
    if (!text || loading) return
    setInputText("")
    sendMessage(text)
  }

  const clearHistory = () => {
    setHistory([])
    historyRef.current = []
    setError(null)
    setLastAction(null)
  }

  return (
    <div className="fixed bottom-5 right-[8.5rem] z-50 flex flex-col items-end gap-2">

      {/* ── Panel expandible ──────────────────────────────────────────────── */}
      {expanded && (
        <div className="w-96 max-w-[calc(100vw-2.5rem)] rounded-2xl border border-border bg-background shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom-4 duration-200">

          {/* Header del panel */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-brand/5">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-brand dark:text-[#6b7aff]" />
              <span className="text-sm font-semibold text-foreground">Asistente IA</span>
            </div>
            <div className="flex items-center gap-1">
              {history.length > 0 && (
                <button
                  onClick={clearHistory}
                  className="text-[11px] text-muted-foreground hover:text-foreground px-2 py-0.5 rounded"
                >
                  Limpiar
                </button>
              )}
              <button onClick={() => setExpanded(false)} className="p-1 rounded hover:bg-muted">
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          </div>

          {/* Notificación de acción */}
          {lastAction && <ActionBanner action={lastAction} />}

          {/* Mensajes */}
          <div className="flex-1 overflow-y-auto max-h-80 px-3 py-3 space-y-2 min-h-[80px]">
            {history.length === 0 && !loading ? (
              <div className="flex flex-col items-center justify-center h-20 gap-2 text-center">
                <Sparkles className="w-6 h-6 text-muted-foreground/40" />
                <p className="text-xs text-muted-foreground/60">
                  Escribí una consulta para empezar
                </p>
                <p className="text-[10px] text-muted-foreground/40">
                  Podés preguntar por clientes, órdenes, editar datos y más
                </p>
              </div>
            ) : (
              history.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} animate-in fade-in duration-200`}
                >
                  <div
                    className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-brand text-white rounded-br-sm whitespace-pre-wrap"
                        : "bg-muted text-foreground rounded-bl-sm"
                    }`}
                  >
                    {msg.role === "assistant" ? (
                      <MarkdownLite content={msg.content} />
                    ) : (
                      msg.content
                    )}
                    {msg.toolsUsed && msg.toolsUsed.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {msg.toolsUsed.map((t, ti) => (
                          <span key={`${t}-${ti}`} className="text-[10px] opacity-60 bg-black/10 rounded px-1.5 py-0.5">
                            {TOOL_LABELS[t]?.replace("...", "").trim() ?? t.replace(/_/g, " ")}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}

            {/* Indicador "pensando" */}
            {loading && (
              <div className="flex justify-start animate-in fade-in duration-150">
                <div className="rounded-2xl rounded-bl-sm px-4 py-2.5 bg-muted text-muted-foreground text-sm flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span className="text-xs">Pensando...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Barra de error */}
          {error && !loading && (
            <div className="px-4 py-2 border-t border-border text-xs text-red-500">
              {error}
            </div>
          )}

          {/* Input de texto */}
          <div className="flex items-center gap-2 px-3 py-2.5 border-t border-border">
            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="Escribí una consulta..."
              disabled={loading}
              className="flex-1 text-sm bg-muted/50 border border-border rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-brand/50 disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={!inputText.trim() || loading}
              className="p-1.5 rounded-lg bg-brand text-white disabled:opacity-40 hover:bg-brand/80 transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ── Botón flotante ────────────────────────────────────────────────── */}
      <button
        onClick={() => setExpanded((e) => !e)}
        title={expanded ? "Cerrar asistente IA" : "Abrir asistente IA"}
        className="relative w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all duration-200 bg-brand text-etiplast-500 hover:bg-brand-strong"
      >
        {loading ? (
          <Loader2 className="w-6 h-6 animate-spin" />
        ) : expanded ? (
          <X className="w-6 h-6" />
        ) : (
          <Sparkles className="w-6 h-6" />
        )}
      </button>
    </div>
  )
}
