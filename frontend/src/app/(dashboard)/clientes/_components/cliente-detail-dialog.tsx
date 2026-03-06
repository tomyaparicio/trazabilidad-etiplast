"use client"

import { useState } from "react"
import { api } from "@/lib/api"
import type { Cliente } from "@/types/database"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Pencil, Check, Loader2, AlertCircle, CheckCircle2, X,
  Building2, MapPin, Phone, Package, FileText, Truck,
  type LucideIcon,
} from "lucide-react"

interface FieldDef {
  key: string
  label: string
  type?: string
  group: string
  span?: boolean   // full row
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
  contacto:  { label: "Contacto",    icon: Phone,     description: "CUIT y datos de contacto" },
  producto:  { label: "Producto",   icon: Package,   description: "Especificaciones técnicas" },
  transporte: { label: "Transporte", icon: Truck,     description: "Qué transporta usa el cliente" },
  extra:     { label: "Notas",      icon: FileText,  description: "Observaciones adicionales" },
}

const CAMPOS_EDITABLES = [
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

interface ClienteDetailDialogProps {
  cliente: Cliente | null
  onClose: () => void
  onUpdate: (updated: Cliente) => void
}

export function ClienteDetailDialog({ cliente, onClose, onUpdate }: ClienteDetailDialogProps) {
  const [activeGroup, setActiveGroup] = useState("general")
  const [editing, setEditing] = useState(false)
  const [editData, setEditData] = useState<Record<string, unknown>>({})
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<"success" | "error" | "">("")

  const handleOpen = (open: boolean) => {
    if (!open) {
      onClose()
      setEditing(false)
      setSaveMsg("")
      setActiveGroup("general")
    }
  }

  const startEditing = () => {
    if (cliente) {
      const base: Record<string, unknown> = { ...cliente }
      CAMPOS_EDITABLES.forEach((c) => {
        if (!(c in base)) base[c] = null
      })
      setEditData(base)
      setEditing(true)
      setSaveMsg("")
    }
  }

  const cancelEditing = () => {
    setEditing(false)
    if (cliente) setEditData({ ...cliente })
  }

  const handleSave = async () => {
    if (!cliente) return
    setSaving(true); setSaveMsg("")
    try {
      const numericFields = ["id_cliente", "alto", "cilindro", "cierre", "volumen_cantidad"]
      const updates: Record<string, unknown> = {}
      CAMPOS_EDITABLES.forEach((campo) => {
        const rawVal = editData[campo]
        let val = rawVal === undefined || rawVal === "" ? null : rawVal
        if (val !== null && numericFields.includes(campo)) {
          const num = Number(val)
          val = Number.isNaN(num) ? null : num
        }
        updates[campo] = val
      })
      const updated = await api.clientes.update(cliente.id, updates) as Cliente
      onUpdate(updated)
      setEditData({ ...updated }); setEditing(false); setSaveMsg("success")
      setTimeout(() => setSaveMsg(""), 3000)
    } catch (err) {
      console.error("Error al guardar cliente:", err)
      setSaveMsg("error")
    } finally {
      setSaving(false)
    }
  }

  const displayCliente = editing ? editData : (cliente as Record<string, unknown> | null)
  const grad = getAvatarGrad(cliente?.rubro)
  const activeFields = FIELDS.filter(f => f.group === activeGroup)
  const { label: activeLabel, icon: ActiveIcon, description: activeDesc } = GROUP_CONFIG[activeGroup]

  return (
    <Dialog open={!!cliente} onOpenChange={handleOpen}>
      <DialogContent showCloseButton={false} className="w-[95vw] max-w-[1400px] h-[90vh] max-h-[90vh] overflow-hidden flex flex-col p-0 bg-card border-border shadow-2xl">

        {/* ── Top header ── */}
        <DialogHeader className="px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center text-primary-foreground font-bold text-base border border-border shrink-0 shadow-md"
                style={{ background: `linear-gradient(135deg, ${grad.from}, ${grad.to})` }}
              >
                {(String(displayCliente?.marca || ""))?.[0]?.toUpperCase() || "?"}
              </div>
              <div>
                <DialogTitle className="text-[15px] text-foreground font-semibold leading-tight">
                  {String(displayCliente?.marca || "—")}
                </DialogTitle>
                <div className="flex items-center gap-2 mt-0.5">
                  <DialogDescription className="text-muted-foreground text-xs">
                    Cliente #{cliente?.id_cliente}
                  </DialogDescription>
                  {cliente?.rubro && (
                    <span className="text-[10px] font-semibold text-muted-foreground bg-muted/50 border border-border px-2 py-0.5 rounded-md">
                      {cliente.rubro}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {!editing ? (
                <Button
                  size="sm" onClick={startEditing}
                  className="bg-muted/50 hover:bg-muted text-secondary-foreground border border-border text-xs h-8 rounded-lg gap-1.5"
                >
                  <Pencil className="w-3.5 h-3.5" />Editar
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline" size="sm" onClick={cancelEditing}
                    className="bg-transparent border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground text-xs h-8 rounded-lg"
                  >
                    Cancelar
                  </Button>
                  <Button
                    size="sm" onClick={handleSave} disabled={saving}
                    className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-xs h-8 rounded-lg gap-1.5"
                  >
                    {saving
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Check className="w-3.5 h-3.5" />
                    }
                    Guardar
                  </Button>
                </>
              )}
              {/* Divider + close */}
              <div className="w-px h-5 bg-border mx-1" />
              <button
                type="button"
                onClick={() => handleOpen(false)}
                className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
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
          <nav className="w-[230px] shrink-0 border-r border-border bg-muted/20 flex flex-col py-2 overflow-y-auto">
            {Object.entries(GROUP_CONFIG).map(([key, { label, icon: Icon }]) => {
              const isActive = activeGroup === key
              // Count filled fields for this group
              const groupFields = FIELDS.filter(f => f.group === key)
              const filledCount = groupFields.filter(f => {
                const val = displayCliente?.[f.key]
                return val != null && String(val).trim() !== ""
              }).length
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveGroup(key)}
                  className={`relative flex items-center gap-3 px-4 py-3 text-left transition-all duration-150 group ${
                    isActive
                      ? "text-gold"
                      : "text-muted-foreground hover:text-secondary-foreground"
                  }`}
                >
                  {/* Right active indicator */}
                  {isActive && (
                    <span className="absolute right-0 top-2 bottom-2 w-[2px] bg-gold rounded-l-full" />
                  )}
                  {/* Active bg */}
                  {isActive && (
                    <span className="absolute inset-0 bg-gold/6 rounded-none" />
                  )}

                  <div className={`relative rounded-lg p-1.5 shrink-0 border transition-colors ${
                    isActive
                      ? "bg-gold/10 border-gold/25"
                      : "bg-muted/30 border-border group-hover:border-border"
                  }`}>
                    <Icon className={`w-3.5 h-3.5 ${isActive ? "text-gold" : "text-muted-foreground group-hover:text-secondary-foreground"}`} strokeWidth={1.5} />
                  </div>

                  <div className="relative flex-1 min-w-0">
                    <p className="text-xs font-medium leading-none truncate">{label}</p>
                    <p className={`text-[10px] mt-1 tabular-nums ${isActive ? "text-gold/60" : "text-muted-foreground"}`}>
                      {filledCount}/{groupFields.length} campos
                    </p>
                  </div>
                </button>
              )
            })}
          </nav>

          {/* Right content */}
          <div className="flex-1 flex flex-col overflow-hidden min-w-0">

            {/* Section sub-header */}
            <div className="px-7 py-4 border-b border-border bg-muted/20 shrink-0">
              <div className="flex items-center gap-2.5">
                <ActiveIcon className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
                <div>
                  <h3 className="text-sm font-semibold text-foreground leading-none">{activeLabel}</h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{activeDesc}</p>
                </div>
              </div>
            </div>

            {/* Scrollable fields */}
            <div className="flex-1 overflow-y-auto px-7 py-6">

              {/* Feedback banners */}
              {saveMsg === "success" && (
                <div className="flex items-center gap-2.5 p-3.5 mb-5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-sm">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />Cliente actualizado correctamente
                </div>
              )}
              {saveMsg === "error" && (
                <div className="flex items-center gap-2.5 p-3.5 mb-5 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0" />Error al guardar. Verifica los datos e intenta de nuevo.
                </div>
              )}

              {/* Fields grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-4">
                {activeFields.map((field) => (
                  <div key={field.key} className={field.span ? "sm:col-span-2 lg:col-span-3" : ""}>
                    <label
                      htmlFor={`modal-${field.key}`}
                      className="block text-xs font-medium text-muted-foreground mb-1.5"
                    >
                      {field.label}
                    </label>
                    {editing ? (
                      <Input
                        id={`modal-${field.key}`}
                        type={field.type || "text"}
                        inputMode={field.type === "number" ? "numeric" : undefined}
                        autoComplete="off"
                        value={String(editData[field.key] ?? "")}
                        onChange={(e) => setEditData((prev) => ({ ...prev, [field.key]: e.target.value || null }))}
                        className="h-10 rounded-lg bg-input border-border text-foreground placeholder:text-muted-foreground focus-visible:border-gold/40 focus-visible:ring-gold/10 text-sm"
                      />
                    ) : (
                      <div className="h-10 flex items-center px-3.5 bg-muted/30 border border-border rounded-lg">
                        {displayCliente?.[field.key] != null && String(displayCliente[field.key]).trim() !== ""
                          ? <span className="text-sm text-secondary-foreground truncate">{String(displayCliente[field.key])}</span>
                          : <span className="text-sm text-muted-foreground">—</span>
                        }
                      </div>
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
