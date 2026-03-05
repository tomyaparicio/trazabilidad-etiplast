"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { Cliente, Filtros } from "@/types/database"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Plus, Loader2, AlertCircle, CheckCircle2, X,
  Building2, MapPin, Phone, Package, FileText, Truck,
  type LucideIcon,
} from "lucide-react"

interface FieldDef {
  key: string
  label: string
  type?: string
  group: string
  span?: boolean
}

const FIELDS: FieldDef[] = [
  { key: "id_cliente",       label: "N. Cliente",      type: "number", group: "general" },
  { key: "marca",            label: "Marca",                           group: "general" },
  { key: "rubro",            label: "Rubro",                           group: "general" },
  { key: "razon_social",     label: "Razón Social",    span: true,     group: "general" },
  { key: "domicilio",        label: "Domicilio",       span: true,     group: "ubicacion" },
  { key: "localidad",        label: "Localidad",                       group: "ubicacion" },
  { key: "provincia",        label: "Provincia",                       group: "ubicacion" },
  { key: "pais",             label: "País",                            group: "ubicacion" },
  { key: "cuit",             label: "CUIT",                            group: "contacto" },
  { key: "telefono",         label: "Teléfono",                        group: "contacto" },
  { key: "producto",         label: "Producto",        span: true,     group: "producto" },
  { key: "volumen_cantidad", label: "Volumen",         type: "number", group: "producto" },
  { key: "volumen_unidad",   label: "Unidad",                          group: "producto" },
  { key: "lamina",           label: "Lámina",                          group: "producto" },
  { key: "muestra",          label: "Muestra",                         group: "producto" },
  { key: "alto",             label: "Alto",            type: "number", group: "producto" },
  { key: "cilindro",         label: "Cilindro",        type: "number", group: "producto" },
  { key: "cierre",           label: "Cierre",          type: "number", group: "producto" },
  { key: "envase",           label: "Envase",                          group: "producto" },
  { key: "observaciones",    label: "Observaciones",   span: true,     group: "extra" },
  { key: "transporte",       label: "Transporte",      span: true,     group: "transporte" },
]

const GROUP_CONFIG: Record<string, { label: string; icon: LucideIcon; description: string }> = {
  general:   { label: "General",     icon: Building2, description: "Datos básicos del cliente" },
  ubicacion: { label: "Ubicación",   icon: MapPin,    description: "Domicilio y localización" },
  contacto:  { label: "Contacto",   icon: Phone,     description: "CUIT y datos de contacto" },
  producto:  { label: "Producto",   icon: Package,   description: "Especificaciones técnicas" },
  transporte: { label: "Transporte", icon: Truck,     description: "Qué transporta usa el cliente" },
  extra:     { label: "Notas",       icon: FileText,  description: "Observaciones adicionales" },
}

const CAMPOS_INSERT = [
  "id_cliente","marca","rubro","razon_social","domicilio","localidad","provincia","pais",
  "cuit","telefono","producto","volumen_cantidad","volumen_unidad","lamina","muestra","alto","cilindro","cierre","envase","observaciones","transporte",
]

const RUBRO_AVATAR: Record<string, { from: string; to: string }> = {
  Agua:             { from: "#0e7490", to: "#22d3ee" },
  "Jugos-Gaseosas": { from: "#c2410c", to: "#f97316" },
  Limpieza:         { from: "#065f46", to: "#34d399" },
  Agroquimicos:     { from: "#991b1b", to: "#f87171" },
  Aceite:           { from: "#92400e", to: "#fbbf24" },
}
function getAvatarGrad(rubro?: string | null) {
  return RUBRO_AVATAR[rubro ?? ""] ?? { from: "#1a1866", to: "#292d96" }
}

interface ClienteNuevoDialogProps {
  open: boolean
  onClose: () => void
  onCreated: (cliente: Cliente) => void
  filtros: Filtros
}

const INITIAL_FORM: Record<string, string | number | null> = {
  id_cliente: "",
  marca: "",
  rubro: "",
  razon_social: "",
  domicilio: "",
  localidad: "",
  provincia: "",
  pais: "Argentina",
  cuit: "",
  telefono: "",
  producto: "",
  volumen_cantidad: "",
  volumen_unidad: "",
  lamina: "",
  muestra: "",
  alto: "",
  cilindro: "",
  cierre: "",
  envase: "",
  observaciones: "",
  transporte: "",
}

export function ClienteNuevoDialog({ open, onClose, onCreated, filtros }: ClienteNuevoDialogProps) {
  const supabase = createClient()
  const [activeGroup, setActiveGroup] = useState("general")
  const [formData, setFormData] = useState<Record<string, string | number | null>>(INITIAL_FORM)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<"success" | "error" | "">("")

  const handleOpen = (isOpen: boolean) => {
    if (!isOpen) {
      onClose()
      setFormData({ ...INITIAL_FORM })
      setSaveMsg("")
      setActiveGroup("general")
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setSaveMsg("")
    try {
      let idCliente = formData.id_cliente
      if (idCliente === "" || idCliente === null) {
        const { data: maxRow } = await supabase
          .from("clientes")
          .select("id_cliente")
          .order("id_cliente", { ascending: false })
          .limit(1)
          .maybeSingle()
        idCliente = (maxRow?.id_cliente ?? 0) + 1
      } else {
        idCliente = Number(idCliente)
      }

      const numericFields = ["id_cliente", "alto", "cilindro", "cierre", "volumen_cantidad"]
      const insert: Record<string, unknown> = { id_cliente: idCliente }

      CAMPOS_INSERT.forEach((campo) => {
        if (campo === "id_cliente") return
        let val = formData[campo] ?? null
        if (val && val !== "" && numericFields.includes(campo)) val = Number(val)
        if (val && val !== "") insert[campo] = val
        else if (campo === "pais") insert[campo] = "Argentina"
      })

      const { data: created, error } = await supabase
        .from("clientes")
        .insert(insert)
        .select()
        .single()

      if (error) throw error
      onCreated(created as Cliente)
      setSaveMsg("success")
      setTimeout(() => {
        handleOpen(false)
      }, 1500)
    } catch {
      setSaveMsg("error")
    } finally {
      setSaving(false)
    }
  }

  const grad = getAvatarGrad(formData.rubro as string)
  const activeFields = FIELDS.filter((f) => f.group === activeGroup)
  const { label: activeLabel, icon: ActiveIcon, description: activeDesc } = GROUP_CONFIG[activeGroup]

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent showCloseButton={false} className="w-[95vw] max-w-[1400px] h-[90vh] max-h-[90vh] overflow-hidden flex flex-col p-0 bg-[#0d0d1a] border-white/[0.08] shadow-[0_0_100px_rgba(0,0,0,0.7)]">

        {/* ── Top header ── */}
        <DialogHeader className="px-6 py-4 border-b border-white/[0.06] shrink-0">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-base border border-white/10 shrink-0 shadow-md"
                style={{ background: `linear-gradient(135deg, ${grad.from}, ${grad.to})` }}
              >
                <Plus className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-[15px] text-white font-semibold leading-tight">
                  Nuevo cliente
                </DialogTitle>
                <DialogDescription className="text-[#6b6b8a] text-xs mt-0.5">
                  Completa los datos para dar de alta un cliente
                </DialogDescription>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving}
                className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-xs h-8 rounded-lg gap-1.5"
              >
                {saving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Plus className="w-3.5 h-3.5" />
                )}
                Crear cliente
              </Button>
              <div className="w-px h-5 bg-white/[0.08] mx-1" />
              <button
                type="button"
                onClick={() => handleOpen(false)}
                className="h-8 w-8 flex items-center justify-center rounded-lg text-[#4a4a6a] hover:text-white hover:bg-white/[0.06] transition-colors"
                aria-label="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </DialogHeader>

        {/* ── Two-column body ── */}
        <div className="flex flex-1 overflow-hidden min-h-0">
          {/* Left nav */}
          <nav className="w-[230px] shrink-0 border-r border-white/[0.06] bg-black/25 flex flex-col py-2 overflow-y-auto">
            {Object.entries(GROUP_CONFIG).map(([key, { label, icon: Icon }]) => {
              const isActive = activeGroup === key
              const groupFields = FIELDS.filter((f) => f.group === key)
              const filledCount = groupFields.filter((f) => {
                const val = formData[f.key]
                return val != null && String(val).trim() !== ""
              }).length
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveGroup(key)}
                  className={`relative flex items-center gap-3 px-4 py-3 text-left transition-all duration-150 group ${
                    isActive ? "text-[#f5eb4a]" : "text-[#6b6b8a] hover:text-[#c8c8d8]"
                  }`}
                >
                  {isActive && <span className="absolute right-0 top-2 bottom-2 w-[2px] bg-[#f5eb4a] rounded-l-full" />}
                  {isActive && <span className="absolute inset-0 bg-[#f5eb4a]/6 rounded-none" />}
                  <div
                    className={`relative rounded-lg p-1.5 shrink-0 border transition-colors ${
                      isActive
                        ? "bg-[#f5eb4a]/10 border-[#f5eb4a]/25"
                        : "bg-white/[0.04] border-white/[0.06] group-hover:border-white/[0.1]"
                    }`}
                  >
                    <Icon
                      className={`w-3.5 h-3.5 ${isActive ? "text-[#f5eb4a]" : "text-[#6b6b8a] group-hover:text-[#c8c8d8]"}`}
                      strokeWidth={1.5}
                    />
                  </div>
                  <div className="relative flex-1 min-w-0">
                    <p className="text-xs font-medium leading-none truncate">{label}</p>
                    <p className={`text-[10px] mt-1 tabular-nums ${isActive ? "text-[#f5eb4a]/60" : "text-[#4a4a6a]"}`}>
                      {filledCount}/{groupFields.length} campos
                    </p>
                  </div>
                </button>
              )
            })}
          </nav>

          {/* Right content */}
          <div className="flex-1 flex flex-col overflow-hidden min-w-0">
            <div className="px-7 py-4 border-b border-white/[0.04] bg-white/[0.01] shrink-0">
              <div className="flex items-center gap-2.5">
                <ActiveIcon className="w-4 h-4 text-[#6b6b8a]" strokeWidth={1.5} />
                <div>
                  <h3 className="text-sm font-semibold text-white leading-none">{activeLabel}</h3>
                  <p className="text-[11px] text-[#4a4a6a] mt-0.5">{activeDesc}</p>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-7 py-6">
              {saveMsg === "success" && (
                <div className="flex items-center gap-2.5 p-3.5 mb-5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-sm">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />Cliente creado correctamente
                </div>
              )}
              {saveMsg === "error" && (
                <div className="flex items-center gap-2.5 p-3.5 mb-5 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0" />Error al crear. Verifica los datos e intenta de nuevo.
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-4">
                {activeFields.map((field) => (
                  <div key={field.key} className={field.span ? "sm:col-span-2 lg:col-span-3" : ""}>
                    <label
                      htmlFor={`nuevo-${field.key}`}
                      className="block text-xs font-medium text-[#4a4a6a] mb-1.5"
                    >
                      {field.label}
                      {field.key === "id_cliente" && (
                        <span className="text-[10px] font-normal text-[#3a3a5a] ml-1.5">
                          (vacío = auto)
                        </span>
                      )}
                      {field.key === "rubro" && filtros.rubros.length > 0 && (
                        <span className="text-[10px] font-normal text-[#3a3a5a] ml-1.5">
                          o sugerir
                        </span>
                      )}
                    </label>
                    {field.key === "rubro" && filtros.rubros.length > 0 ? (
                      <>
                        <Input
                          id={`nuevo-${field.key}`}
                          type="text"
                          list="rubros-list"
                          autoComplete="off"
                          value={String(formData[field.key] ?? "")}
                          onChange={(e) =>
                            setFormData((prev) => ({ ...prev, [field.key]: e.target.value || null }))
                          }
                          className="h-10 rounded-lg bg-white/[0.04] border-white/[0.07] text-white placeholder:text-[#4a4a6a] focus-visible:border-[#f5eb4a]/40 focus-visible:ring-[#f5eb4a]/10 text-sm"
                        />
                        <datalist id="rubros-list">
                          {filtros.rubros.map((r) => (
                            <option key={r} value={r} />
                          ))}
                        </datalist>
                      </>
                    ) : field.key === "provincia" && filtros.provincias.length > 0 ? (
                      <>
                        <Input
                          id={`nuevo-${field.key}`}
                          type="text"
                          list="provincias-list"
                          autoComplete="off"
                          value={String(formData[field.key] ?? "")}
                          onChange={(e) =>
                            setFormData((prev) => ({ ...prev, [field.key]: e.target.value || null }))
                          }
                          className="h-10 rounded-lg bg-white/[0.04] border-white/[0.07] text-white placeholder:text-[#4a4a6a] focus-visible:border-[#f5eb4a]/40 focus-visible:ring-[#f5eb4a]/10 text-sm"
                        />
                        <datalist id="provincias-list">
                          {filtros.provincias.map((p) => (
                            <option key={p} value={p} />
                          ))}
                        </datalist>
                      </>
                    ) : (
                      <Input
                        id={`nuevo-${field.key}`}
                        type={field.type || "text"}
                        inputMode={field.type === "number" ? "numeric" : undefined}
                        autoComplete="off"
                        value={String(formData[field.key] ?? "")}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, [field.key]: e.target.value || null }))
                        }
                        className="h-10 rounded-lg bg-white/[0.04] border-white/[0.07] text-white placeholder:text-[#4a4a6a] focus-visible:border-[#f5eb4a]/40 focus-visible:ring-[#f5eb4a]/10 text-sm"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
