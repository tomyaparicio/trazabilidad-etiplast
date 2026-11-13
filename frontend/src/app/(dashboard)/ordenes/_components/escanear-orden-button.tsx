"use client"

/**
 * Botón "Escanear orden": sube una foto/PDF de una hoja de pedido,
 * la procesa con OCR (route /api/ai/escanear-orden) y precarga el
 * formulario de nueva orden vía el evento "eti:open-order-form".
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { api } from "@/lib/api"
import type { OrderPrefill } from "@/lib/voice/types"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import {
  ScanLine, Camera, Upload, Loader2, Search, Check,
  RotateCcw, ClipboardList, AlertTriangle, FileText,
} from "lucide-react"

// ── Tipos ─────────────────────────────────────────────────────────────────────

type ExtraccionOrden = {
  cliente_nombre: string | null
  extrusion_color: string | null
  extrusion_trat: string | null
  extrusion_espesor: number | null
  extrusion_ancho: number | null
  extrusion_cant_bob: number | null
  extrusion_formulacion: string | null
  impresion_colores: string[] | null
  impresion_cilindro: number | null
  troquelado_ancho: number | null
  troquelado_alto: number | null
  troquelado_envase: string | null
  cantidad: number | null
  fecha_entrega: string | null
  observaciones: string | null
  campos_dudosos: string[]
}

type ClienteMatch = { id: number; marca: string | null }

type ClienteItem = { id: number; marca?: string | null; id_cliente?: number | null; rubro?: string | null }

type Fase = "seleccion" | "procesando" | "resultado"

const MAX_SIZE_BYTES = 4 * 1024 * 1024
const MAX_LADO_PX = 1600

const LABELS: { key: keyof ExtraccionOrden; label: string }[] = [
  { key: "cliente_nombre",        label: "Cliente" },
  { key: "extrusion_color",       label: "Color extrusión" },
  { key: "extrusion_trat",        label: "Tratamiento" },
  { key: "extrusion_espesor",     label: "Espesor (µ)" },
  { key: "extrusion_ancho",       label: "Ancho extrusión (mm)" },
  { key: "extrusion_cant_bob",    label: "Cant. bobinas" },
  { key: "extrusion_formulacion", label: "Formulación" },
  { key: "impresion_colores",     label: "Colores impresión" },
  { key: "impresion_cilindro",    label: "Cilindro (mm)" },
  { key: "troquelado_ancho",      label: "Ancho troquelado (mm)" },
  { key: "troquelado_alto",       label: "Alto troquelado (mm)" },
  { key: "troquelado_envase",     label: "Envase" },
  { key: "cantidad",              label: "Cantidad" },
  { key: "fecha_entrega",         label: "Fecha entrega" },
  { key: "observaciones",         label: "Observaciones" },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatValor(valor: unknown): string {
  if (valor == null) return "—"
  if (Array.isArray(valor)) return valor.length ? valor.join(", ") : "—"
  return String(valor)
}

/** Reduce una imagen a máx 1600px de lado mayor, JPEG calidad 0.85 */
async function downscaleImagen(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const ladoMayor = Math.max(bitmap.width, bitmap.height)
  const scale = Math.min(1, MAX_LADO_PX / ladoMayor)

  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("No se pudo procesar la imagen")
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("No se pudo convertir la imagen"))),
      "image/jpeg",
      0.85
    )
  })
}

// ── Componente principal ──────────────────────────────────────────────────────

export function EscanearOrdenButton() {
  const [open, setOpen] = useState(false)
  const [fase, setFase] = useState<Fase>("seleccion")
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  const [extraido, setExtraido] = useState<ExtraccionOrden | null>(null)
  const [cliente, setCliente] = useState<ClienteMatch | null>(null)
  const [buscandoCliente, setBuscandoCliente] = useState(false)

  // Selector manual de cliente
  const [clienteSearch, setClienteSearch] = useState("")
  const [clienteResultados, setClienteResultados] = useState<ClienteItem[]>([])
  const [searchLoading, setSearchLoading] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const camaraInputRef = useRef<HTMLInputElement>(null)
  // Identifica la "sesión" de escaneo actual: se incrementa en cada reset para que
  // una respuesta de OCR que llegue tarde (dialog ya cerrado/reabierto) no pise el
  // estado de una sesión nueva.
  const sessionRef = useRef(0)

  const reset = useCallback(() => {
    sessionRef.current += 1
    setFase("seleccion")
    setError(null)
    setExtraido(null)
    setCliente(null)
    setBuscandoCliente(false)
    setClienteSearch("")
    setClienteResultados([])
    setDragging(false)
  }, [])

  const handleOpenChange = (o: boolean) => {
    setOpen(o)
    if (!o) reset()
  }

  // ── Búsqueda manual de clientes (debounced) ────────────────────────────────
  useEffect(() => {
    if (!buscandoCliente || clienteSearch.trim().length < 2) {
      setClienteResultados([])
      return
    }
    const t = setTimeout(async () => {
      setSearchLoading(true)
      try {
        const res = await api.clientes.list({ search: clienteSearch.trim(), per_page: 8 })
        setClienteResultados((res.data ?? []) as ClienteItem[])
      } catch {
        setClienteResultados([])
      } finally {
        setSearchLoading(false)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [clienteSearch, buscandoCliente])

  // ── Procesar archivo ────────────────────────────────────────────────────────
  const procesarArchivo = useCallback(async (file: File) => {
    const mySession = sessionRef.current
    setError(null)

    const esImagen = file.type.startsWith("image/")
    const esPdf = file.type === "application/pdf"
    if (!esImagen && !esPdf) {
      setError("Formato no soportado. Subí una imagen (JPG, PNG, WebP) o un PDF.")
      return
    }

    setFase("procesando")
    try {
      let blob: Blob = file
      let nombre = file.name || "orden"

      if (esImagen) {
        blob = await downscaleImagen(file)
        nombre = nombre.replace(/\.[^.]+$/, "") + ".jpg"
      }
      if (sessionRef.current !== mySession) return // el diálogo se cerró/reseteó mientras procesaba

      if (blob.size > MAX_SIZE_BYTES) {
        setError("El archivo supera el máximo de 4MB. Probá con una foto más liviana.")
        setFase("seleccion")
        return
      }

      const formData = new FormData()
      formData.append("file", blob, nombre)

      const res = await fetch("/api/ai/escanear-orden", {
        method: "POST",
        credentials: "include",
        body: formData,
      })

      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || `Error ${res.status} al procesar el documento`)
      }

      const data: { extraido: ExtraccionOrden; cliente_match: ClienteMatch | null } = await res.json()
      if (sessionRef.current !== mySession) return // idem: evita pisar una sesión nueva

      setExtraido(data.extraido)
      setCliente(data.cliente_match)
      setBuscandoCliente(!data.cliente_match)
      setFase("resultado")
    } catch (err) {
      if (sessionRef.current !== mySession) return
      setError(err instanceof Error ? err.message : "Error al procesar el documento")
      setFase("seleccion")
    }
  }, [])

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) procesarArchivo(file)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) procesarArchivo(file)
    e.target.value = ""
  }

  // ── Cargar en formulario ────────────────────────────────────────────────────
  const cargarEnFormulario = () => {
    if (!extraido || !cliente) return

    const payload: OrderPrefill = {
      cliente_id: cliente.id,
      cliente_nombre: cliente.marca ?? extraido.cliente_nombre ?? undefined,
      extrusion_color: extraido.extrusion_color ?? undefined,
      extrusion_trat: extraido.extrusion_trat ?? undefined,
      extrusion_espesor: extraido.extrusion_espesor ?? undefined,
      extrusion_formulacion: extraido.extrusion_formulacion ?? undefined,
      extrusion_ancho: extraido.extrusion_ancho ?? undefined,
      extrusion_cant_bob: extraido.extrusion_cant_bob ?? undefined,
      troquelado_alto: extraido.troquelado_alto ?? undefined,
      troquelado_ancho: extraido.troquelado_ancho ?? undefined,
      troquelado_envase: extraido.troquelado_envase ?? undefined,
      impresion_colores: extraido.impresion_colores ?? undefined,
      cantidad: extraido.cantidad ?? undefined,
      observaciones: extraido.observaciones ?? undefined,
      fecha_entrega: extraido.fecha_entrega ?? undefined,
    }

    window.dispatchEvent(new CustomEvent("eti:open-order-form", { detail: payload }))
    handleOpenChange(false)
  }

  const dudosos = new Set(extraido?.campos_dudosos ?? [])

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="h-11 gap-2 rounded-xl border-white/40 bg-transparent px-4 text-sm font-semibold text-white hover:bg-white/10 hover:text-white dark:border-white/40 dark:bg-transparent dark:hover:bg-white/10"
      >
        <ScanLine className="w-4 h-4" />
        Escanear orden
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <ScanLine className="w-4 h-4 text-brand dark:text-primary-200" />
            Escanear hoja de pedido
          </DialogTitle>

          {/* ── Fase: selección de archivo ── */}
          {fase === "seleccion" && (
            <div className="space-y-3">
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 cursor-pointer transition-colors ${
                  dragging
                    ? "border-brand bg-brand/5"
                    : "border-border hover:border-foreground/30 hover:bg-muted/40"
                }`}
              >
                <Upload className="w-7 h-7 text-muted-foreground/60" />
                <p className="text-sm font-medium text-foreground">
                  Arrastrá una foto o PDF acá
                </p>
                <p className="text-xs text-muted-foreground">
                  o hacé click para elegir un archivo · JPG, PNG, WebP o PDF (máx 4MB)
                </p>
              </div>

              <Button
                variant="outline"
                onClick={() => camaraInputRef.current?.click()}
                className="w-full gap-2 h-9 rounded-lg sm:hidden"
              >
                <Camera className="w-4 h-4" />
                Sacar foto con la cámara
              </Button>

              {error && (
                <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/25 px-3 py-2 text-xs text-destructive">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={handleInputChange}
              />
              <input
                ref={camaraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleInputChange}
              />
            </div>
          )}

          {/* ── Fase: procesando ── */}
          {fase === "procesando" && (
            <div className="flex flex-col items-center justify-center gap-3 py-12">
              <Loader2 className="w-8 h-8 animate-spin text-brand dark:text-primary-200" />
              <p className="text-sm text-muted-foreground">Leyendo documento…</p>
            </div>
          )}

          {/* ── Fase: resultado ── */}
          {fase === "resultado" && extraido && (
            <div className="space-y-4">

              {/* Cliente detectado / selector manual */}
              {cliente && !buscandoCliente ? (
                <div className="flex items-center justify-between gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/25 px-3 py-2">
                  <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
                    <Check className="w-3.5 h-3.5 shrink-0" />
                    <span className="font-medium">Cliente detectado:</span>
                    <span>{cliente.marca ?? `#${cliente.id}`}</span>
                  </div>
                  <button
                    onClick={() => { setBuscandoCliente(true); setClienteSearch("") }}
                    className="text-[11px] text-muted-foreground hover:text-foreground shrink-0"
                  >
                    Cambiar
                  </button>
                </div>
              ) : (
                <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                  <p className="text-xs font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {cliente ? "Elegí otro cliente" : "No se detectó el cliente — buscalo manualmente"}
                  </p>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Buscar cliente por marca..."
                      value={clienteSearch}
                      onChange={(e) => setClienteSearch(e.target.value)}
                      className="pl-9 h-8 text-sm"
                      autoFocus
                    />
                  </div>
                  {searchLoading && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Loader2 className="w-3 h-3 animate-spin" /> Buscando…
                    </p>
                  )}
                  {clienteResultados.length > 0 && (
                    <div className="max-h-36 overflow-y-auto rounded-lg border border-border divide-y divide-border">
                      {clienteResultados.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => {
                            setCliente({ id: c.id, marca: c.marca ?? null })
                            setBuscandoCliente(false)
                          }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors flex items-center justify-between gap-2"
                        >
                          <span className="font-medium">{c.marca ?? "Sin nombre"}</span>
                          <span className="text-xs text-muted-foreground">
                            {c.rubro ?? ""}{c.id_cliente != null ? ` · N°${c.id_cliente}` : ""}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {!searchLoading && clienteSearch.trim().length >= 2 && clienteResultados.length === 0 && (
                    <p className="text-xs text-muted-foreground">Sin resultados</p>
                  )}
                </div>
              )}

              {/* Tabla de campos extraídos */}
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-border">
                    {LABELS.map(({ key, label }) => {
                      const valor = extraido[key]
                      const esDudoso = dudosos.has(key)
                      return (
                        <tr key={key} className="hover:bg-muted/40">
                          <td className="px-3 py-1.5 text-xs text-muted-foreground w-44">{label}</td>
                          <td className="px-3 py-1.5">
                            <div className="flex items-center gap-2">
                              <span className={valor == null ? "text-muted-foreground/50" : "text-foreground"}>
                                {formatValor(valor)}
                              </span>
                              {esDudoso && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] px-1.5 py-0 bg-amber-500/15 text-amber-400 border-amber-500/30"
                                >
                                  verificar
                                </Badge>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {dudosos.size > 0 && (
                <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                  <FileText className="w-3 h-3 shrink-0" />
                  Los campos marcados con &quot;verificar&quot; no se leyeron con certeza — revisalos en el formulario.
                </p>
              )}

              {/* Acciones */}
              <div className="flex items-center justify-end gap-2 pt-1">
                <Button
                  variant="outline"
                  onClick={reset}
                  className="gap-2 h-9 rounded-lg"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reintentar
                </Button>
                <Button
                  onClick={cargarEnFormulario}
                  disabled={!cliente}
                  title={!cliente ? "Seleccioná un cliente primero" : undefined}
                  className="bg-brand hover:bg-brand-strong text-white gap-2 h-9 rounded-lg"
                >
                  <ClipboardList className="w-3.5 h-3.5" />
                  Cargar en formulario
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
