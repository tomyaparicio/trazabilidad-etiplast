"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
import type { VoiceState, ChatMessage, VoiceChatResponse, EtiAction } from "./types"

const MAX_HISTORY = 20
const WAKE_WORDS   = ["eti", "hey eti", "hola eti", "oye eti"]

function containsWakeWord(text: string) {
  const l = text.toLowerCase().trim()
  return WAKE_WORDS.some((w) => l.includes(w))
}
function stripWakeWord(text: string) {
  let r = text.toLowerCase().trim()
  for (const w of WAKE_WORDS) {
    const i = r.indexOf(w)
    if (i !== -1) r = r.slice(i + w.length).trim()
  }
  return r || text.trim()
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getSR = () => (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

export function useVoiceAgent() {
  const router = useRouter()

  const [state, setState]             = useState<VoiceState>("idle")
  const [history, setHistory]         = useState<ChatMessage[]>([])
  const [activeTools, setActive]      = useState<string[]>([])
  const [error, setError]             = useState<string | null>(null)
  const [wakeEnabled, setWakeEnabled] = useState(false)
  const [transcript, setTranscript]   = useState("")        // live interim transcript
  const [lastAction, setLastAction]   = useState<EtiAction | null>(null)
  const [lastResponseAt, setLastResponseAt] = useState(0)   // para auto-expand

  const recogRef       = useRef<SpeechRecognition | null>(null)
  const wakeRecogRef   = useRef<SpeechRecognition | null>(null)
  const stateRef       = useRef<VoiceState>("idle")
  const continuousRef  = useRef(false)   // ¿el usuario activó modo continuo?
  const processingRef  = useRef(false)   // bloquea restart mientras procesa
  const historyRef     = useRef<ChatMessage[]>([])

  useEffect(() => { stateRef.current = state }, [state])
  useEffect(() => { historyRef.current = history }, [history])

  const isSupported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window)

  const audioRef = useRef<HTMLAudioElement | null>(null)

  // ── speak (ElevenLabs → fallback browser TTS) ─────────────────────────────
  const speak = useCallback(async (text: string, onDone?: () => void) => {
    if (typeof window === "undefined") { onDone?.(); return }

    // Detener audio anterior
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    window.speechSynthesis?.cancel()
    setState("speaking")

    try {
      const res = await fetch("/api/voice/tts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      })

      if (!res.ok) throw new Error("TTS error")

      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioRef.current = audio

      audio.onended = () => {
        URL.revokeObjectURL(url)
        audioRef.current = null
        setState("idle")
        onDone?.()
      }
      audio.onerror = () => {
        URL.revokeObjectURL(url)
        audioRef.current = null
        setState("idle")
        onDone?.()
      }

      await audio.play()
    } catch {
      // Fallback al TTS del browser si ElevenLabs falla
      if (!window.speechSynthesis) { setState("idle"); onDone?.(); return }

      const utter = new SpeechSynthesisUtterance(text)
      utter.lang  = "es-AR"
      utter.rate  = 1.05

      const voices  = window.speechSynthesis.getVoices()
      const esVoice = voices.find((v) => v.lang.startsWith("es") && v.localService)
                   ?? voices.find((v) => v.lang.startsWith("es"))
      if (esVoice) utter.voice = esVoice

      utter.onend  = () => { setState("idle"); onDone?.() }
      utter.onerror = () => { setState("idle"); onDone?.() }
      window.speechSynthesis.speak(utter)
    }
  }, [])

  // ── sendMessage ───────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text: string) => {
    setState("processing")
    setError(null)
    setActive([])
    setTranscript("")

    const userMsg: ChatMessage = { role: "user", content: text }
    setHistory((prev) => {
      const next = [...prev.slice(-MAX_HISTORY), userMsg]
      historyRef.current = next
      return next
    })

    try {
      const res = await fetch("/api/voice/chat", {
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
      setActive(data.toolsUsed ?? [])

      const assistantMsg: ChatMessage = {
        role: "assistant", content: data.response, toolsUsed: data.toolsUsed,
      }
      setHistory((prev) => {
        const next = [...prev.slice(-MAX_HISTORY), assistantMsg]
        historyRef.current = next
        return next
      })

      // ── Actualizar timestamp para auto-expand ─────────────────────────────
      setLastResponseAt(Date.now())

      // ── Despachar acción detectada ────────────────────────────────────────
      if (data.action) {
        setLastAction(data.action)
        // Auto-limpiar notificación después de 5s
        setTimeout(() => setLastAction(null), 5000)

        if (data.action.type === "open_order_form") {
          window.dispatchEvent(
            new CustomEvent("eti:open-order-form", { detail: data.action.payload })
          )
        } else if (data.action.type === "navigate") {
          router.push(data.action.payload.path)
        }
      }

      // Habla y cuando termina: si modo continuo → retomar escucha
      speak(data.response, () => {
        if (continuousRef.current) {
          resumeListening()
        } else if (wakeEnabled) {
          restartWakeListener()
        }
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido"
      setError(msg)
      setState("error")
      if (continuousRef.current) setTimeout(() => resumeListening(), 1000)
      else if (wakeEnabled) setTimeout(() => restartWakeListener(), 1500)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speak, wakeEnabled])

  // ── Crear y arrancar el reconocedor principal ─────────────────────────────
  const buildRecog = useCallback((): SpeechRecognition => {
    const SpeechRec = getSR()
    const recog: SpeechRecognition = new SpeechRec()
    recog.lang           = "es-AR"
    recog.continuous     = true    // ← clave: no para al silencio
    recog.interimResults = true    // ← mostrar texto en tiempo real
    recog.maxAlternatives = 1

    recog.onresult = (e: SpeechRecognitionEvent) => {
      let interim = ""
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript
        if (e.results[i].isFinal) {
          const txt = t.trim()
          if (txt) {
            processingRef.current = true   // ← bloquear restart ANTES de stop
            try { recog.stop() } catch { /* ignore */ }
            sendMessage(txt)
          }
          return
        } else {
          interim += t
        }
      }
      setTranscript(interim)
    }

    recog.onerror = (e: SpeechRecognitionErrorEvent) => {
      if (e.error === "no-speech" || e.error === "aborted") return
      setError(`Error de micrófono: ${e.error}`)
      setState("error")
      continuousRef.current = false
      processingRef.current = false
    }

    recog.onend = () => {
      // Si estamos procesando → no reiniciar, speak() se encargará de reanudar
      if (processingRef.current) return
      // Si el browser para pero seguimos en modo continuo → reiniciar
      if (continuousRef.current && stateRef.current === "listening") {
        try { recog.start() } catch { /* ignore */ }
      } else if (stateRef.current === "listening") {
        setState("idle")
      }
    }

    return recog
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendMessage])

  // ── resumeListening: retomar escucha en el mismo recog ────────────────────
  const resumeListening = useCallback(() => {
    if (!continuousRef.current) return
    processingRef.current = false   // ← liberar bloqueo
    setState("listening")
    setTranscript("")
    try {
      if (recogRef.current) recogRef.current.start()
    } catch {
      // Si el recog anterior ya fue abortado, crear uno nuevo
      const r = buildRecog()
      recogRef.current = r
      try { r.start() } catch { /* ignore */ }
    }
  }, [buildRecog])

  // ── startListening (toggle) ───────────────────────────────────────────────
  const startListening = useCallback(() => {
    if (!isSupported) {
      setError("Tu navegador no soporta reconocimiento de voz. Usá Chrome o Edge.")
      setState("error")
      return
    }

    // Si ya está activo → detener
    if (continuousRef.current || stateRef.current === "listening") {
      continuousRef.current = false
      try { recogRef.current?.stop() } catch { /* ignore */ }
      window.speechSynthesis?.cancel()
      setState("idle")
      setTranscript("")
      setError(null)
      return
    }

    // Iniciar modo continuo
    window.speechSynthesis?.cancel()
    setError(null)
    setState("listening")
    setTranscript("")
    continuousRef.current = true

    // Detener wake word mientras escuchamos activamente
    try { wakeRecogRef.current?.stop() } catch { /* ignore */ }
    wakeRecogRef.current = null

    const r = buildRecog()
    recogRef.current = r
    try { r.start() } catch {
      setError("No se pudo iniciar el micrófono")
      setState("error")
      continuousRef.current = false
    }
  }, [isSupported, buildRecog])

  // ── Wake word listener ────────────────────────────────────────────────────
  const restartWakeListener = useCallback(() => {
    if (!isSupported || !wakeEnabled) return
    if (["listening", "processing", "speaking"].includes(stateRef.current)) return

    try { wakeRecogRef.current?.stop() } catch { /* ignore */ }

    const SpeechRec = getSR()
    const wake: SpeechRecognition = new SpeechRec()
    wake.lang            = "es-AR"
    wake.continuous      = true
    wake.interimResults  = true
    wake.maxAlternatives = 1

    wake.onresult = (e: SpeechRecognitionEvent) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript
        if (containsWakeWord(t)) {
          try { wake.stop() } catch { /* ignore */ }
          wakeRecogRef.current = null
          const cmd = stripWakeWord(t)
          if (cmd && cmd.length > 3) {
            sendMessage(cmd)
          } else {
            playWakeBeep()
            setTimeout(() => startListening(), 300)
          }
          return
        }
      }
    }

    wake.onerror = () => {
      if (wakeEnabled) setTimeout(() => restartWakeListener(), 1000)
    }
    wake.onend = () => {
      if (wakeEnabled && !["listening", "processing", "speaking"].includes(stateRef.current)) {
        setTimeout(() => restartWakeListener(), 200)
      }
    }

    wakeRecogRef.current = wake
    try { wake.start() } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSupported, wakeEnabled, sendMessage, startListening])

  const playWakeBeep = () => {
    try {
      const ctx  = new AudioContext()
      const osc  = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.1, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15)
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.15)
    } catch { /* ignore */ }
  }

  const toggleWakeWord = useCallback(() => {
    setWakeEnabled((prev) => {
      if (prev) {
        try { wakeRecogRef.current?.stop() } catch { /* ignore */ }
        wakeRecogRef.current = null
      }
      return !prev
    })
  }, [])

  useEffect(() => {
    if (wakeEnabled) restartWakeListener()
    else {
      try { wakeRecogRef.current?.stop() } catch { /* ignore */ }
      wakeRecogRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wakeEnabled])

  // ── Keyboard shortcut Ctrl+Space ─────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl+Space o Cmd+Space — no activar si el foco está en un input/textarea
      if (!(e.ctrlKey || e.metaKey) || e.code !== "Space") return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA") return
      e.preventDefault()
      startListening()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [startListening])

  const stop = useCallback(() => {
    continuousRef.current = false
    processingRef.current = false
    try { recogRef.current?.stop() } catch { /* ignore */ }
    window.speechSynthesis?.cancel()
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    setState("idle")
    setError(null)
    setTranscript("")
    if (wakeEnabled) setTimeout(() => restartWakeListener(), 300)
  }, [wakeEnabled, restartWakeListener])

  const sendText = useCallback((text: string) => {
    if (!text.trim()) return
    sendMessage(text)
  }, [sendMessage])

  const clearHistory = useCallback(() => setHistory([]), [])

  return {
    state, history, activeTools, error, transcript,
    wakeEnabled, isSupported, lastAction, lastResponseAt,
    startListening, stop, sendText, clearHistory, toggleWakeWord,
  }
}
