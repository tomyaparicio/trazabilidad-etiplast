"use client"

import { useState, useEffect, useRef } from "react"
import { api } from "@/lib/api"
import type { Cliente, ClienteProducto, RazonSocial } from "@/types/database"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Pencil, Check, Loader2, AlertCircle, CheckCircle2, X, Plus, Trash2,
  Building2, MapPin, Phone, FileText, Hash, Boxes, Truck, TriangleAlert,
  MessageCircle, Navigation,
} from "lucide-react"

// ─── Gradient by rubro ────────────────────────────────────────────────────────
const RUBRO_GRAD: Record<string, [string, string]> = {
  Agua:             ["#0e7490", "#22d3ee"],
  "Jugos-Gaseosas": ["#c2410c", "#f97316"],
  Limpieza:         ["#065f46", "#34d399"],
  Agroquimicos:     ["#991b1b", "#f87171"],
  Aceite:           ["#92400e", "#fbbf24"],
}
const getGrad = (r?: string | null): [string, string] => RUBRO_GRAD[r ?? ""] ?? ["#1a1866", "#292d96"]

// ─── Tabs ─────────────────────────────────────────────────────────────────────
const TABS = [
  { key: "general",    label: "General",      icon: Hash      },
  { key: "razon",      label: "Razón Social", icon: Building2 },
  { key: "ubicacion",  label: "Ubicación",    icon: MapPin    },
  { key: "contacto",   label: "Contacto",     icon: Phone     },
  { key: "transporte", label: "Transporte",   icon: Truck     },
  { key: "notas",      label: "Notas",        icon: FileText  },
  { key: "productos",  label: "Productos",    icon: Boxes     },
] as const
type TabKey = typeof TABS[number]["key"]

// ─── Field card ───────────────────────────────────────────────────────────────
function FieldCard({
  label, value, fieldKey, editing, editData, onChange, type = "text", full = false,
}: {
  label: string; value?: string | number | null
  fieldKey: string; editing: boolean
  editData: Record<string, unknown>
  onChange: (k: string, v: string) => void
  type?: string; full?: boolean
}) {
  return (
    <div className={`rounded-xl border border-border bg-muted/20 px-4 py-4 flex flex-col gap-1.5 ${full ? "col-span-full" : ""}`}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">{label}</p>
      {editing ? (
        <Input
          type={type}
          inputMode={type === "number" ? "numeric" : undefined}
          autoComplete="off"
          value={String(editData[fieldKey] ?? "")}
          onChange={(e) => onChange(fieldKey, e.target.value)}
          className="h-9 rounded-lg bg-input border-border text-sm focus-visible:border-gold/40 focus-visible:ring-gold/10"
        />
      ) : (
        <p className="text-[15px] font-semibold text-foreground leading-snug">
          {value != null && String(value).trim() !== ""
            ? String(value)
            : <span className="text-muted-foreground/30 font-normal text-sm">—</span>}
        </p>
      )}
    </div>
  )
}

// ─── RazonSocialSelector ──────────────────────────────────────────────────────
function RazonSocialSelector({
  value, onChange,
}: {
  value: string
  onChange: (id: number | null, rs: string, cuit?: string | null) => void
}) {
  const [query, setQuery] = useState(value)
  const [results, setResults] = useState<RazonSocial[]>([])
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const t = setTimeout(async () => {
      const res = await api.razonessociales.list({ search: query, per_page: 15 })
      setResults(res.data)
    }, 250)
    return () => clearTimeout(t)
  }, [query, open])

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  }, [])

  const select = (rs: RazonSocial) => {
    setQuery(rs.razon_social); setOpen(false)
    onChange(rs.id, rs.razon_social, rs.cuit)
  }
  const create = async () => {
    if (!query.trim()) return; setCreating(true)
    try {
      const rs = await api.razonessociales.create({ razon_social: query.trim() })
      setOpen(false); onChange(rs.id, rs.razon_social, rs.cuit)
    } finally { setCreating(false) }
  }
  const exact = results.some((r) => r.razon_social.toLowerCase() === query.trim().toLowerCase())

  return (
    <div ref={ref} className="relative">
      <Input
        autoComplete="off" value={query} placeholder="Buscar o crear..."
        onFocus={() => { setOpen(true); api.razonessociales.list({ per_page: 15 }).then((r) => setResults(r.data)) }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); if (!e.target.value) onChange(null, "") }}
        className="h-9 rounded-lg bg-input border-border text-sm focus-visible:border-gold/40 focus-visible:ring-gold/10"
      />
      {open && (results.length > 0 || query.trim()) && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-popover border border-border rounded-xl shadow-xl overflow-hidden max-h-52 overflow-y-auto">
          {results.map((rs) => (
            <button key={rs.id} type="button" onMouseDown={() => select(rs)}
              className="w-full text-left px-4 py-2.5 hover:bg-muted/50 text-sm flex flex-col gap-0.5">
              <span className="font-semibold text-foreground">{rs.razon_social}</span>
              {rs.cuit && <span className="text-xs text-muted-foreground">{rs.cuit}</span>}
            </button>
          ))}
          {!exact && query.trim() && (
            <button type="button" onMouseDown={create} disabled={creating}
              className="w-full text-left px-4 py-2.5 hover:bg-emerald-500/10 text-sm text-emerald-400 flex items-center gap-2 border-t border-border">
              {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Crear &ldquo;{query.trim()}&rdquo;
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Products ─────────────────────────────────────────────────────────────────
type ProdForm = {
  nombre: string; envase: string; envase_codificado: string
  volumen_cantidad: string; volumen_unidad: string
  lamina: string; muestra: string; alto: string; cilindro: string; cierre: string
}
const EMPTY: ProdForm = { nombre:"", envase:"", envase_codificado:"", volumen_cantidad:"", volumen_unidad:"", lamina:"", muestra:"", alto:"", cilindro:"", cierre:"" }
const toForm = (p: ClienteProducto): ProdForm => ({
  nombre: p.nombre ?? "", envase: p.envase ?? "",
  envase_codificado: p.envase_codificado ?? "",
  volumen_cantidad: p.volumen_cantidad != null ? String(p.volumen_cantidad) : "",
  volumen_unidad: p.volumen_unidad ?? "", lamina: p.lamina ?? "", muestra: p.muestra ?? "",
  alto: p.alto != null ? String(p.alto) : "",
  cilindro: p.cilindro != null ? String(p.cilindro) : "",
  cierre: p.cierre != null ? String(p.cierre) : "",
})
const toBody = (f: ProdForm) => ({
  nombre: f.nombre || null, envase: f.envase || null,
  envase_codificado: f.envase_codificado || null,
  volumen_cantidad: f.volumen_cantidad ? Number(f.volumen_cantidad) : null,
  volumen_unidad: f.volumen_unidad || null, lamina: f.lamina || null, muestra: f.muestra || null,
  alto: f.alto ? Number(f.alto) : null,
  cilindro: f.cilindro ? Number(f.cilindro) : null,
  cierre: f.cierre ? Number(f.cierre) : null,
})

const ACCENT_COLORS = ["#f59e0b","#06b6d4","#8b5cf6","#10b981","#f43f5e","#0ea5e9"]

const SPEC_STYLES: Record<string, string> = {
  "Lámina":    "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/25",
  "Envase":    "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/25",
  "Cód. Env.": "bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/25",
  "Alto":      "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25",
  "Cilindro":  "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/25",
  "Cierre":    "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/25",
  "Muestra":   "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/25",
}

function ProductCard({ producto, idx, onEdit, onDelete, deleting, disabled }: {
  producto: ClienteProducto; idx: number
  onEdit: () => void; onDelete: () => void; deleting: boolean; disabled: boolean
}) {
  const accent = ACCENT_COLORS[idx % ACCENT_COLORS.length]
  const specs = [
    producto.lamina            && { k: "Lámina",    v: producto.lamina },
    producto.envase            && { k: "Envase",    v: producto.envase },
    producto.envase_codificado && { k: "Cód. Env.", v: producto.envase_codificado },
    producto.alto              && { k: "Alto",      v: String(producto.alto) },
    producto.cilindro          && { k: "Cilindro",  v: String(producto.cilindro) },
    producto.cierre            && { k: "Cierre",    v: String(producto.cierre) },
    producto.muestra           && { k: "Muestra",   v: producto.muestra },
  ].filter(Boolean) as { k: string; v: string }[]

  return (
    <div
      className="group relative rounded-xl bg-card border border-border overflow-hidden transition-all duration-200 hover:shadow-xl hover:-translate-y-px"
      style={{ borderLeftColor: `${accent}80`, borderLeftWidth: "3px" }}
    >
      {/* Ambient glow from accent */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(ellipse at top left, ${accent}0d, transparent 55%)` }}
      />
      {/* Index watermark */}
      <span
        className="absolute right-3 top-1/2 -translate-y-1/2 text-7xl font-black pointer-events-none select-none leading-none"
        style={{ color: `${accent}0a` }}
      >
        {String(idx + 1).padStart(2, "0")}
      </span>

      <div className="relative p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-baseline gap-2.5 flex-wrap min-w-0">
            <p className="text-[15px] font-bold text-foreground leading-tight">
              {producto.nombre || <span className="text-muted-foreground/40 font-normal italic text-sm">Sin nombre</span>}
            </p>
            {producto.volumen_cantidad != null && (
              <span
                className="text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0"
                style={{ background: `${accent}1a`, color: accent, border: `1px solid ${accent}40` }}
              >
                {producto.volumen_cantidad}{producto.volumen_unidad ?? ""}
              </span>
            )}
          </div>
          <div className="flex gap-0.5 opacity-20 group-hover:opacity-100 transition-opacity shrink-0">
            <button type="button" onClick={onEdit} disabled={disabled}
              className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-30">
              <Pencil className="w-3 h-3" />
            </button>
            <button type="button" onClick={onDelete} disabled={deleting || disabled}
              className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-30">
              {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3 h-3" />}
            </button>
          </div>
        </div>

        {specs.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {specs.map(({ k, v }) => (
              <span key={k} className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs border ${SPEC_STYLES[k] ?? "bg-muted/40 text-muted-foreground border-border"}`}>
                <span className="opacity-55 font-medium">{k}</span>
                <span className="font-semibold">{v}</span>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground/25 italic">Sin especificaciones</p>
        )}
      </div>
    </div>
  )
}

function ProductInlineForm({ data, onChange, onSave, onCancel, saving, isNew, envases }: {
  data: ProdForm; onChange: (d: ProdForm) => void
  onSave: () => void; onCancel: () => void; saving: boolean; isNew?: boolean
  envases: string[]
}) {
  const set = (k: keyof ProdForm) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...data, [k]: e.target.value })
  const inp = "h-9 rounded-lg bg-input border-border text-sm focus-visible:border-gold/40 focus-visible:ring-gold/10"

  return (
    <div className="col-span-full rounded-xl border border-gold/30 bg-gold/5 p-5">
      <p className="text-xs font-bold text-gold uppercase tracking-wider mb-4">{isNew ? "✦ Nuevo producto" : "Editar producto"}</p>
      <div className="grid grid-cols-4 gap-3 sm:grid-cols-5">
        <div className="col-span-4 sm:col-span-5">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 mb-1.5">Producto</label>
          <Input value={data.nombre} onChange={set("nombre")} placeholder="Agua, Lavandina, Gaseosa..." className={inp} />
        </div>
        {([
          ["volumen_cantidad","Volumen","number"],["volumen_unidad","Unidad","text"],
          ["lamina","Lámina","text"],["muestra","Muestra","text"],
          ["envase_codificado","Cód. Envase","text"],
          ["alto","Alto","number"],["cilindro","Cilindro","number"],["cierre","Cierre","number"],
        ] as [keyof ProdForm, string, string][]).map(([k, label, type]) => (
          <div key={k}>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 mb-1.5">{label}</label>
            <Input type={type} value={data[k]} onChange={set(k)} className={inp} />
          </div>
        ))}
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 mb-1.5">Envase</label>
          <Input list="envases-inline-list" value={data.envase} onChange={set("envase")} autoComplete="off" className={inp} />
          <datalist id="envases-inline-list">
            {envases.map((e) => <option key={e} value={e} />)}
          </datalist>
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="outline" size="sm" onClick={onCancel}
          className="h-9 text-xs rounded-lg border-border bg-transparent text-muted-foreground hover:bg-muted/50 px-4">Cancelar</Button>
        <Button size="sm" onClick={onSave} disabled={saving}
          className="h-9 text-xs rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 gap-2 px-4">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}Guardar
        </Button>
      </div>
    </div>
  )
}

function ProductosTab({ clienteId, productos, onProductosChange }: {
  clienteId: number; productos: ClienteProducto[]
  onProductosChange: (p: ClienteProducto[]) => void
}) {
  const [editingId, setEditingId] = useState<number | "new" | null>(null)
  const [form, setForm] = useState<ProdForm>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [error, setError] = useState("")
  const [envases, setEnvases] = useState<string[]>([])

  useEffect(() => {
    api.admin.envases.list().then((r) => setEnvases(r.map((e: { nombre: string }) => e.nombre))).catch(() => {})
  }, [])

  const startEdit = (p: ClienteProducto) => { setForm(toForm(p)); setEditingId(p.id); setError("") }
  const startNew  = () => { setForm(EMPTY); setEditingId("new"); setError("") }
  const cancel    = () => { setEditingId(null); setForm(EMPTY); setError("") }

  const save = async () => {
    setSaving(true); setError("")
    try {
      const body = toBody(form)
      if (editingId === "new") {
        const n = await api.productos.create(clienteId, body)
        onProductosChange([...productos, n])
      } else {
        const u = await api.productos.update(clienteId, editingId as number, body)
        onProductosChange(productos.map((p) => p.id === editingId ? u : p))
      }
      cancel()
    } catch { setError("Error al guardar el producto") }
    finally { setSaving(false) }
  }

  const remove = async (id: number) => {
    setDeleting(id); setError("")
    try {
      await api.productos.delete(clienteId, id)
      onProductosChange(productos.filter((p) => p.id !== id))
    } catch { setError("Error al eliminar") }
    finally { setDeleting(null) }
  }

  return (
    <div>
      {error && (
        <div className="flex items-center gap-2 p-3 mb-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />{error}
        </div>
      )}

      {productos.length === 0 && editingId !== "new" && (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-14 h-14 rounded-2xl bg-muted/30 border border-border flex items-center justify-center">
            <Boxes className="w-7 h-7 text-muted-foreground/30" strokeWidth={1.5} />
          </div>
          <div className="text-center">
            <p className="text-base font-semibold text-foreground">Sin productos</p>
            <p className="text-sm text-muted-foreground mt-1">Agregá el primer producto de esta marca</p>
          </div>
          <Button onClick={startNew}
            className="mt-2 h-9 text-sm rounded-xl bg-gold/10 hover:bg-gold/20 text-gold border border-gold/30 gap-2 px-5">
            <Plus className="w-4 h-4" />Agregar primer producto
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {productos.map((p, i) =>
          editingId === p.id
            ? <ProductInlineForm key={p.id} data={form} onChange={setForm} onSave={save} onCancel={cancel} saving={saving} envases={envases} />
            : <ProductCard key={p.id} producto={p} idx={i} onEdit={() => startEdit(p)} onDelete={() => remove(p.id)} deleting={deleting === p.id} disabled={editingId !== null} />
        )}

        {editingId === "new"
          ? <ProductInlineForm data={form} onChange={setForm} onSave={save} onCancel={cancel} saving={saving} isNew envases={envases} />
          : productos.length > 0 && (
            <button type="button" onClick={startNew} disabled={editingId !== null}
              className="flex items-center justify-center gap-2 py-5 rounded-xl border-2 border-dashed border-border hover:border-gold/40 hover:bg-gold/5 text-muted-foreground hover:text-gold text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed">
              <Plus className="w-4 h-4" />Agregar producto
            </button>
          )}
      </div>
    </div>
  )
}

// ─── Main dialog ──────────────────────────────────────────────────────────────
const CAMPOS_EDITABLES = [
  "id_cliente","marca","rubro","razon_social","razon_social_id",
  "cuit","telefono","domicilio","localidad","provincia","pais",
  "transporte","transporte_domicilio","transporte_localidad",
  "observaciones","latitud","longitud",
]

interface ClienteDetailDialogProps {
  cliente: Cliente | null
  onClose: () => void
  onUpdate: (updated: Cliente) => void
  onDelete?: (id: number) => void
}

export function ClienteDetailDialog({ cliente, onClose, onUpdate, onDelete }: ClienteDetailDialogProps) {
  const [tab, setTab] = useState<TabKey>("general")
  const [editing, setEditing] = useState(false)
  const [editData, setEditData] = useState<Record<string, unknown>>({})
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<"success" | "error" | "">("")
  const [hermanas, setHermanas] = useState<{ id: number; id_cliente: number | null; marca: string | null }[]>([])
  const [productos, setProductos] = useState<ClienteProducto[]>([])
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => { setProductos(cliente?.productos ?? []) }, [cliente?.id])

  useEffect(() => {
    if (!cliente?.razon_social_id || editing) { setHermanas([]); return }
    api.razonessociales.get(cliente.razon_social_id)
      .then((rs) => setHermanas(rs.marcas.filter((m) => m.id !== cliente.id)))
      .catch(() => setHermanas([]))
  }, [cliente?.razon_social_id, cliente?.id, editing])

  const handleOpen = (open: boolean) => {
    if (!open) { onClose(); setEditing(false); setSaveMsg(""); setTab("general"); setConfirmDelete(false) }
  }

  const handleDelete = async () => {
    if (!cliente) return
    setDeleting(true)
    try {
      await api.clientes.delete(cliente.id)
      onDelete?.(cliente.id)
      handleOpen(false)
    } catch { /* noop */ }
    finally { setDeleting(false) }
  }

  const startEditing = () => {
    if (!cliente) return
    const base: Record<string, unknown> = { ...cliente }
    CAMPOS_EDITABLES.forEach((c) => { if (!(c in base)) base[c] = null })
    setEditData(base); setEditing(true); setSaveMsg("")
  }
  const cancelEditing = () => { setEditing(false); if (cliente) setEditData({ ...cliente }) }

  const handleSave = async () => {
    if (!cliente) return
    setSaving(true); setSaveMsg("")
    try {
      const numeric = ["id_cliente", "razon_social_id", "latitud", "longitud"]
      const updates: Record<string, unknown> = {}
      CAMPOS_EDITABLES.forEach((campo) => {
        const raw = editData[campo]
        let val = raw === undefined || raw === "" ? null : raw
        if (val !== null && numeric.includes(campo)) { const n = Number(val); val = Number.isNaN(n) ? null : n }
        updates[campo] = val
      })
      const updated = await api.clientes.update(cliente.id, updates) as Cliente
      onUpdate(updated)
      setEditData({ ...updated }); setEditing(false); setSaveMsg("success")
      setTimeout(() => setSaveMsg(""), 3000)
    } catch { setSaveMsg("error") }
    finally { setSaving(false) }
  }

  const set = (key: string, val: string) => setEditData((p) => ({ ...p, [key]: val || null }))
  const d = editing ? editData : (cliente as Record<string, unknown> | null)
  const [gFrom, gTo] = getGrad(cliente?.rubro)
  const isProductosTab = tab === "productos"

  const fieldProps = { editing: editing && !isProductosTab, editData, onChange: set }

  const renderTab = () => {
    switch (tab) {
      case "general":
        return (
          <div className="grid grid-cols-3 gap-4">
            <FieldCard label="Marca"      fieldKey="marca"      value={d?.marca as string}      full {...fieldProps} />
            <FieldCard label="N° Cliente" fieldKey="id_cliente" value={d?.id_cliente as number} type="number" {...fieldProps} />
            <FieldCard label="Rubro"      fieldKey="rubro"      value={d?.rubro as string}       {...fieldProps} />
          </div>
        )
      case "razon":
        return (
          <div className="grid grid-cols-2 gap-4">
            {(editing) ? (
              <div className="col-span-full rounded-xl border border-border bg-muted/20 px-4 py-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-1.5">Razón Social</p>
                <RazonSocialSelector
                  value={String(editData.razon_social ?? "")}
                  onChange={(id, rs, cuit) => setEditData((prev) => ({
                    ...prev, razon_social_id: id, razon_social: rs,
                    ...(cuit !== undefined ? { cuit: cuit ?? "" } : {}),
                  }))}
                />
              </div>
            ) : (
              <FieldCard label="Razón Social" fieldKey="razon_social" value={d?.razon_social as string} full {...fieldProps} />
            )}
            <FieldCard label="CUIT" fieldKey="cuit" value={d?.cuit as string} {...fieldProps} />

            {!editing && hermanas.length > 0 && (
              <div className="col-span-full rounded-xl border border-violet-500/20 bg-violet-500/5 px-4 py-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-violet-400/70 mb-3">Otras marcas de esta razón social</p>
                <div className="flex flex-wrap gap-2">
                  {hermanas.map((m) => (
                    <span key={m.id} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20 text-sm text-violet-300 font-medium">
                      {m.marca || `#${m.id_cliente}`}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      case "ubicacion": {
        const lat = d?.latitud as number | null
        const lng = d?.longitud as number | null
        const domicilio = d?.domicilio as string | null
        const localidad = d?.localidad as string | null
        const provincia = d?.provincia as string | null
        const addressParts = [domicilio, localidad, provincia, "Argentina"].filter(Boolean)
        const mapsUrl = lat != null && lng != null
          ? `https://www.google.com/maps?q=${lat},${lng}`
          : addressParts.length > 1
            ? `https://www.google.com/maps/search/${encodeURIComponent(addressParts.join(", "))}`
            : null
        // Mapa Google Maps embebido (sin API key vía maps.google.com)
        const gmEmbedUrl = lat != null && lng != null
          ? `https://maps.google.com/maps?q=${lat},${lng}&z=15&output=embed&hl=es`
          : addressParts.length > 1
            ? `https://maps.google.com/maps?q=${encodeURIComponent(addressParts.join(", "))}&output=embed&hl=es`
            : null
        return (
          <div className="grid grid-cols-3 gap-4">
            <FieldCard label="Domicilio" fieldKey="domicilio" value={domicilio} full {...fieldProps} />
            <FieldCard label="Localidad" fieldKey="localidad" value={localidad} {...fieldProps} />
            <FieldCard label="Provincia" fieldKey="provincia" value={provincia} {...fieldProps} />
            <FieldCard label="País"      fieldKey="pais"      value={d?.pais as string} {...fieldProps} />
            <FieldCard label="Latitud"   fieldKey="latitud"   value={lat}  type="number" {...fieldProps} />
            <FieldCard label="Longitud"  fieldKey="longitud"  value={lng}  type="number" {...fieldProps} />
            {!editing && gmEmbedUrl && (
              <div className="col-span-full rounded-xl overflow-hidden border border-border shadow-sm relative group">
                <iframe
                  src={gmEmbedUrl}
                  width="100%"
                  height="300"
                  style={{ border: 0, display: "block" }}
                  loading="lazy"
                  title="Mapa de ubicación"
                  referrerPolicy="no-referrer-when-downgrade"
                  allowFullScreen
                />
                {/* Botón que abre Google Maps al hacer clic */}
                {mapsUrl && (
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute bottom-3 right-3 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-background/90 backdrop-blur-sm border border-border text-xs font-semibold text-foreground hover:bg-background shadow-lg transition-all opacity-0 group-hover:opacity-100"
                  >
                    <Navigation className="w-3.5 h-3.5 text-emerald-400" />
                    Abrir en Google Maps
                  </a>
                )}
              </div>
            )}
          </div>
        )
      }
      case "contacto": {
        const tel = d?.telefono as string | null
        // Normalizar número: quitar espacios, guiones, paréntesis y agregar código Argentina si no empieza con +
        const waNumber = tel ? tel.replace(/[\s\-\(\)]/g, "").replace(/^0/, "54").replace(/^(?!\+)/, "54") : null
        const waUrl = waNumber ? `https://wa.me/${waNumber}` : null
        return (
          <div className="grid grid-cols-3 gap-4">
            <div className="relative">
              <FieldCard label="Teléfono" fieldKey="telefono" value={tel} {...fieldProps} />
              {!editing && waUrl && (
                <a
                  href={waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute top-3 right-3 flex items-center gap-1 text-[10px] font-bold text-emerald-500 hover:text-emerald-400 transition-colors"
                >
                  <MessageCircle className="w-3 h-3" />WhatsApp
                </a>
              )}
            </div>
          </div>
        )
      }
      case "transporte": {
        const transp = d?.transporte as string | null
        const transpDom = d?.transporte_domicilio as string | null
        const transpLoc = d?.transporte_localidad as string | null
        const transpParts = [transpDom, transpLoc, "Argentina"].filter(Boolean)
        const transpMapsUrl = transpParts.length > 1
          ? `https://www.google.com/maps/search/${encodeURIComponent(transpParts.join(", "))}`
          : null
        const transpEmbedUrl = transpParts.length > 1
          ? `https://maps.google.com/maps?q=${encodeURIComponent(transpParts.join(", "))}&output=embed&hl=es`
          : null
        return (
          <div className="grid grid-cols-3 gap-4">
            <FieldCard label="Empresa de Transporte" fieldKey="transporte"           value={transp}    full {...fieldProps} />
            <FieldCard label="Domicilio"              fieldKey="transporte_domicilio" value={transpDom} full {...fieldProps} />
            <FieldCard label="Localidad"              fieldKey="transporte_localidad" value={transpLoc}      {...fieldProps} />
            {!editing && transpEmbedUrl && (
              <div className="col-span-full rounded-xl overflow-hidden border border-border shadow-sm relative group">
                <iframe
                  src={transpEmbedUrl}
                  width="100%"
                  height="280"
                  style={{ border: 0, display: "block" }}
                  loading="lazy"
                  title="Mapa de transporte"
                  referrerPolicy="no-referrer-when-downgrade"
                  allowFullScreen
                />
                {transpMapsUrl && (
                  <a
                    href={transpMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute bottom-3 right-3 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-background/90 backdrop-blur-sm border border-border text-xs font-semibold text-foreground hover:bg-background shadow-lg transition-all opacity-0 group-hover:opacity-100"
                  >
                    <Navigation className="w-3.5 h-3.5 text-emerald-400" />
                    Abrir en Google Maps
                  </a>
                )}
              </div>
            )}
          </div>
        )
      }
      case "notas":
        return (
          <div className="grid grid-cols-1 gap-4">
            <FieldCard label="Observaciones" fieldKey="observaciones" value={d?.observaciones as string} {...fieldProps} />
          </div>
        )
      case "productos":
        return cliente ? (
          <ProductosTab clienteId={cliente.id} productos={productos} onProductosChange={setProductos} />
        ) : null
    }
  }

  return (
    <Dialog open={!!cliente} onOpenChange={handleOpen}>
      <DialogContent
        showCloseButton={false}
        className="w-[95vw] max-w-[900px] h-[85vh] max-h-[85vh] overflow-hidden flex flex-col p-0 bg-card border-border shadow-2xl rounded-2xl"
      >
        {/* ── Gradient top strip ── */}
        <div className="h-1 rounded-t-2xl shrink-0" style={{ background: `linear-gradient(to right, ${gFrom}, ${gTo})` }} />

        {/* ── Header ── */}
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3.5">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-xl shrink-0 shadow-lg"
              style={{ background: `linear-gradient(135deg, ${gFrom}, ${gTo})` }}
            >
              {String(d?.marca || "?")[0]?.toUpperCase()}
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-foreground leading-tight">
                {String(d?.marca || "—")}
              </DialogTitle>
              <div className="flex items-center flex-wrap gap-2 mt-0.5">
                <DialogDescription className="text-xs text-muted-foreground">
                  Cliente #{cliente?.id_cliente}
                </DialogDescription>
                {cliente?.rubro && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
                    style={{ color: gTo, borderColor: `${gTo}50`, background: `${gFrom}25` }}>
                    {cliente.rubro}
                  </span>
                )}
                {!editing && d?.razon_social ? (
                  <span className="text-xs text-muted-foreground">· {String(d.razon_social)}</span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {/* ── Confirmación de eliminación ── */}
            {confirmDelete ? (
              <div className="flex items-center gap-2.5">
                <div className="flex items-center gap-1.5 text-xs text-red-400 font-semibold">
                  <TriangleAlert className="w-3.5 h-3.5" />
                  ¿Eliminar &ldquo;{cliente?.marca}&rdquo;?
                </div>
                <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)} disabled={deleting}
                  className="h-8 text-xs rounded-lg bg-transparent border-border text-muted-foreground hover:bg-muted/50 px-3">
                  Cancelar
                </Button>
                <Button size="sm" onClick={handleDelete} disabled={deleting}
                  className="h-8 text-xs rounded-lg bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/30 gap-1.5 px-3">
                  {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  Eliminar
                </Button>
              </div>
            ) : (
              <>
                {saveMsg === "success" && (
                  <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5" />Guardado
                  </span>
                )}
                {saveMsg === "error" && (
                  <span className="flex items-center gap-1.5 text-xs text-red-400 font-semibold">
                    <AlertCircle className="w-3.5 h-3.5" />Error
                  </span>
                )}
                {!editing && (
                  <Button size="sm" onClick={() => setConfirmDelete(true)}
                    className="h-8 w-8 p-0 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
                {!isProductosTab && (!editing ? (
                  <Button size="sm" onClick={startEditing}
                    className="h-8 text-xs rounded-lg bg-muted/50 hover:bg-muted text-secondary-foreground border border-border gap-1.5 px-3">
                    <Pencil className="w-3.5 h-3.5" />Editar
                  </Button>
                ) : (
                  <>
                    <Button variant="outline" size="sm" onClick={cancelEditing}
                      className="h-8 text-xs rounded-lg bg-transparent border-border text-muted-foreground hover:bg-muted/50">
                      Cancelar
                    </Button>
                    <Button size="sm" onClick={handleSave} disabled={saving}
                      className="h-8 text-xs rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 gap-1.5 px-3">
                      {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}Guardar
                    </Button>
                  </>
                ))}
              </>
            )}
            <div className="w-px h-5 bg-border" />
            <button type="button" onClick={() => handleOpen(false)}
              className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Tab bar ── */}
        <div className="flex items-center gap-1.5 px-5 py-2.5 border-b border-border bg-muted/10 overflow-x-auto shrink-0">
          {TABS.map(({ key, label, icon: Icon }) => {
            const isActive = tab === key
            const isProd = key === "productos"
            return (
              <button
                key={key}
                type="button"
                onClick={() => { setTab(key); if (editing) cancelEditing() }}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all shrink-0 border ${
                  isActive
                    ? isProd
                      ? "bg-gold/15 text-gold border-gold/35 shadow-sm"
                      : "bg-gold/15 text-gold border-gold/35 shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50 border-transparent"
                }`}
              >
                <Icon className="w-3.5 h-3.5" strokeWidth={2} />
                {label}
                {isProd && productos.length > 0 && (
                  <span className={`ml-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    isActive ? "bg-gold/20 text-gold" : "bg-muted text-muted-foreground"
                  }`}>
                    {productos.length}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* ── Tab content ── */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {renderTab()}
        </div>

      </DialogContent>
    </Dialog>
  )
}
