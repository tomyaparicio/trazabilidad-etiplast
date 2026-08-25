"use client"

import { useState, useRef, useEffect } from "react"
import {
  Mic, MicOff, ChevronUp, ChevronDown, Send, Loader2,
  Volume2, AlertCircle, Bot, Radio, ClipboardList, Navigation,
} from "lucide-react"
import { useVoiceAgent } from "@/lib/voice/use-voice-agent"
import { TOOL_LABELS } from "@/lib/voice/tools"
import type { VoiceState, EtiAction } from "@/lib/voice/types"

// ── Colores por estado ────────────────────────────────────────────────────────
function stateStyle(s: VoiceState) {
  switch (s) {
    case "listening":  return { btn: "bg-gold text-black shadow-[0_0_20px_rgba(245,235,74,0.5)]", ring: "border-gold" }
    case "processing": return { btn: "bg-brand text-white",                                         ring: "border-brand" }
    case "speaking":   return { btn: "bg-emerald-500 text-white shadow-[0_0_20px_rgba(16,185,129,0.4)]", ring: "border-emerald-500" }
    case "error":      return { btn: "bg-red-500 text-white",                                            ring: "border-red-500" }
    default:           return { btn: "bg-brand text-white hover:bg-brand/90",                   ring: "border-brand/40" }
  }
}

function stateLabel(s: VoiceState) {
  switch (s) {
    case "listening":  return "Escuchando..."
    case "processing": return "Procesando..."
    case "speaking":   return "Hablando..."
    case "error":      return "Error"
    default:           return null
  }
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

// ── Wrapper que evita hidratación SSR ────────────────────────────────────────
export function VoiceAgent() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  if (!mounted) return null
  return <VoiceAgentContent />
}

// ── Contenido real (todos los hooks aquí) ─────────────────────────────────────
function VoiceAgentContent() {
  const [expanded, setExpanded]   = useState(false)
  const [inputText, setInputText] = useState("")
  const messagesEndRef            = useRef<HTMLDivElement>(null)
  const inputRef                  = useRef<HTMLInputElement>(null)

  const {
    state, history, activeTools, error, transcript,
    wakeEnabled, isSupported, lastAction, lastResponseAt,
    startListening, stop, sendText, clearHistory, toggleWakeWord,
  } = useVoiceAgent()

  // Auto-scroll al último mensaje
  useEffect(() => {
    if (expanded) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [history, transcript, expanded])

  // Auto-expandir cuando llega una respuesta mientras está colapsado
  useEffect(() => {
    if (lastResponseAt > 0 && !expanded) {
      setExpanded(true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastResponseAt])

  // Auto-focus en el input al expandir
  useEffect(() => {
    if (expanded) setTimeout(() => inputRef.current?.focus(), 150)
  }, [expanded])

  // startListening ya es toggle — detiene si está escuchando
  const handleMicClick = () => {
    if (state === "speaking") { stop(); return }
    startListening()
  }

  const handleSend = () => {
    if (!inputText.trim() || state === "processing") return
    sendText(inputText.trim())
    setInputText("")
  }

  const { btn: btnStyle, ring: ringStyle } = stateStyle(state)
  const label = stateLabel(state)
  const isActive = state !== "idle" && state !== "error"

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2">

      {/* ── Panel expandible ──────────────────────────────────────────────── */}
      {expanded && (
        <div className="w-96 rounded-2xl border border-border bg-background shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom-4 duration-200">

          {/* Header del panel */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-brand/5">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-brand dark:text-[#6b7aff]" />
              <span className="text-sm font-semibold text-foreground">Asistente Etiplast</span>
              <span className="text-[10px] text-muted-foreground/50 hidden sm:block">Ctrl+Espacio</span>
            </div>
            <div className="flex items-center gap-1">
              {/* Toggle wake word */}
              {isSupported && (
                <button
                  onClick={toggleWakeWord}
                  title={wakeEnabled ? 'Desactivar "Hola Eti"' : 'Activar "Hola Eti"'}
                  className={`flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border transition-colors ${
                    wakeEnabled
                      ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/30"
                      : "text-muted-foreground border-border hover:text-foreground"
                  }`}
                >
                  <Radio className={`w-3 h-3 ${wakeEnabled ? "animate-pulse" : ""}`} />
                  {wakeEnabled ? "Eti activo" : "Hola Eti"}
                </button>
              )}
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
            {history.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-20 gap-2 text-center">
                <Mic className="w-6 h-6 text-muted-foreground/40" />
                <p className="text-xs text-muted-foreground/60">
                  {isSupported
                    ? "Presioná el micrófono o escribí una consulta"
                    : "Escribí una consulta para empezar"}
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
                        ? "bg-brand text-white rounded-br-sm"
                        : "bg-muted text-foreground rounded-bl-sm"
                    }`}
                  >
                    {/* Renderizar saltos de línea en las respuestas */}
                    {msg.content.split("\n").map((line, li) => (
                      <span key={li}>
                        {line}
                        {li < msg.content.split("\n").length - 1 && <br />}
                      </span>
                    ))}
                    {msg.toolsUsed && msg.toolsUsed.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {msg.toolsUsed.map((t) => (
                          <span key={t} className="text-[10px] opacity-60 bg-black/10 rounded px-1.5 py-0.5">
                            {TOOL_LABELS[t]?.replace("...", "").trim() ?? t.replace(/_/g, " ")}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}

            {/* Transcript en tiempo real */}
            {state === "listening" && transcript && (
              <div className="flex justify-end animate-in fade-in duration-150">
                <div className="max-w-[88%] rounded-2xl rounded-br-sm px-3 py-2 text-sm leading-relaxed bg-brand/30 text-foreground/70 italic border border-brand/20">
                  {transcript}
                  <span className="inline-block w-1 h-3.5 ml-0.5 bg-current animate-pulse rounded-sm align-middle" />
                </div>
              </div>
            )}

            {/* Indicador "pensando" mientras procesa */}
            {state === "processing" && (
              <div className="flex justify-start animate-in fade-in duration-150">
                <div className="rounded-2xl rounded-bl-sm px-4 py-2.5 bg-muted text-muted-foreground text-sm flex items-center gap-2">
                  <span className="flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:0ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:300ms]" />
                  </span>
                  {activeTools.length > 0 && (
                    <span className="text-xs">
                      {TOOL_LABELS[activeTools[activeTools.length - 1]] ?? "Procesando..."}
                    </span>
                  )}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Barra de estado activo */}
          {(isActive || error) && state !== "processing" && (
            <div className={`px-4 py-2 border-t border-border text-xs flex items-center gap-2 ${
              error ? "text-red-500" : "text-muted-foreground"
            }`}>
              {state === "speaking"   && <Volume2 className="w-3 h-3 shrink-0 text-emerald-500" />}
              {state === "listening"  && <Mic className="w-3 h-3 shrink-0 text-gold" />}
              {state === "error"      && <AlertCircle className="w-3 h-3 shrink-0" />}
              <span>
                {error
                  ? error
                  : activeTools.length > 0
                    ? (TOOL_LABELS[activeTools[activeTools.length - 1]] ?? label)
                    : label}
              </span>
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
              disabled={state === "processing"}
              className="flex-1 text-sm bg-muted/50 border border-border rounded-lg px-3 py-1.5 outline-none focus:ring-1 focus:ring-brand/50 disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={!inputText.trim() || state === "processing"}
              className="p-1.5 rounded-lg bg-brand text-white disabled:opacity-40 hover:bg-brand/80 transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ── Botón flotante principal ──────────────────────────────────────── */}
      <div className="flex items-center gap-2">

        {/* Indicador wake word activo (panel cerrado) */}
        {!expanded && wakeEnabled && state === "idle" && (
          <div className="flex items-center gap-1.5 bg-background border border-emerald-500/30 rounded-full px-3 py-1.5 text-xs font-medium text-emerald-500 shadow-md">
            <Radio className="w-3 h-3 animate-pulse" />
            decí &quot;Eti&quot;
          </div>
        )}

        {/* Label de estado (cuando está colapsado) */}
        {!expanded && label && (
          <div className="bg-background border border-border rounded-full px-3 py-1.5 text-xs font-medium text-foreground shadow-md animate-in slide-in-from-right-4 duration-200">
            {activeTools.length > 0
              ? (TOOL_LABELS[activeTools[activeTools.length - 1]] ?? label)
              : label}
          </div>
        )}

        {/* Botón expandir/colapsar */}
        {!expanded && (
          <button
            onClick={() => setExpanded(true)}
            className="w-9 h-9 rounded-full border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted shadow-md flex items-center justify-center transition-colors"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
        )}

        {/* Botón de micrófono */}
        <div className="relative">
          {/* Anillo animado */}
          {(state === "listening" || state === "speaking") && (
            <span className={`absolute inset-0 rounded-full border-2 ${ringStyle} animate-ping`} />
          )}

          <button
            onClick={handleMicClick}
            disabled={state === "processing"}
            title={
              state === "listening" ? "Detener (Ctrl+Espacio)"
              : state === "speaking" ? "Detener"
              : "Hablar con el asistente (Ctrl+Espacio)"
            }
            className={`relative w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all duration-200 disabled:cursor-not-allowed ${btnStyle}`}
          >
            {state === "processing" ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : state === "speaking" ? (
              <Volume2 className="w-6 h-6" />
            ) : state === "listening" ? (
              <MicOff className="w-6 h-6" />
            ) : state === "error" ? (
              <AlertCircle className="w-6 h-6" />
            ) : (
              <Mic className="w-6 h-6" />
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
