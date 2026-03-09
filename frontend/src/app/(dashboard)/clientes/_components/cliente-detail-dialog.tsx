"use client"

import { useState, useEffect, useRef } from "react"
import { api } from "@/lib/api"
import type { Cliente, ClienteProducto, RazonSocial } from "@/types/database"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Pencil, Check, Loader2, AlertCircle, CheckCircle2, X, Plus, Trash2,
  Building2, MapPin, Phone, FileText, Hash, Boxes, Truck,
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
  nombre: string; envase: string; volumen_cantidad: string; volumen_unidad: string
  lamina: string; muestra: string; alto: string; cilindro: string; cierre: string
}
const EMPTY: ProdForm = { nombre:"", envase:"", volumen_cantidad:"", volumen_unidad:"", lamina:"", muestra:"", alto:"", cilindro:"", cierre:"" }
const toForm = (p: ClienteProducto): ProdForm => ({
  nombre: p.nombre ?? "", envase: p.envase ?? "",
  volumen_cantidad: p.volumen_cantidad != null ? String(p.volumen_cantidad) : "",
  volumen_unidad: p.volumen_unidad ?? "", lamina: p.lamina ?? "", muestra: p.muestra ?? "",
  alto: p.alto != null ? String(p.alto) : "",
  cilindro: p.cilindro != null ? String(p.cilindro) : "",
  cierre: p.cierre != null ? String(p.cierre) : "",
})
const toBody = (f: ProdForm) => ({
  nombre: f.nombre || null, envase: f.envase || null,
  volumen_cantidad: f.volumen_cantidad ? Number(f.volumen_cantidad) : null,
  volumen_unidad: f.volumen_unidad || null, lamina: f.lamina || null, muestra: f.muestra || null,
  alto: f.alto ? Number(f.alto) : null,
  cilindro: f.cilindro ? Number(f.cilindro) : null,
  cierre: f.cierre ? Number(f.cierre) : null,
})

const CARD_COLORS = [
  "border-amber-500/40  bg-amber-500/8",
  "border-cyan-500/40   bg-cyan-500/8",
  "border-violet-500/40 bg-violet-500/8",
  "border-emerald-500/40 bg-emerald-500/8",
  "border-rose-500/40   bg-rose-500/8",
  "border-sky-500/40    bg-sky-500/8",
]

function ProductCard({ producto, idx, onEdit, onDelete, deleting, disabled }: {
  producto: ClienteProducto; idx: number
  onEdit: () => void; onDelete: () => void; deleting: boolean; disabled: boolean
}) {
  const color = CARD_COLORS[idx % CARD_COLORS.length]
  const title = [
    producto.nombre,
    producto.volumen_cantidad != null ? `${producto.volumen_cantidad}${producto.volumen_unidad ?? ""}` : null,
  ].filter(Boolean).join(" · ")

  const specs = [
    producto.lamina   && { k: "Lámina",  v: producto.lamina },
    producto.envase   && { k: "Envase",  v: producto.envase },
    producto.alto     && { k: "Alto",    v: String(producto.alto) },
    producto.cilindro && { k: "Cilindro",v: String(producto.cilindro) },
    producto.cierre   && { k: "Cierre",  v: String(producto.cierre) },
    producto.muestra  && { k: "Muestra", v: producto.muestra },
  ].filter(Boolean) as { k: string; v: string }[]

  return (
    <div className={`group relative rounded-xl border p-5 transition-all hover:shadow-lg ${color}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-base font-bold text-foreground leading-tight truncate">
            {title || <span className="text-muted-foreground font-normal italic text-sm">Sin nombre</span>}
          </p>
          {specs.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {specs.map(({ k, v }) => (
                <span key={k} className="inline-flex items-center gap-1.5 bg-background/60 border border-border/60 rounded-lg px-2.5 py-1 text-xs">
                  <span className="text-muted-foreground font-medium">{k}</span>
                  <span className="text-foreground font-semibold">{v}</span>
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5">
          <button type="button" onClick={onEdit} disabled={disabled}
            className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-background/60 transition-colors disabled:opacity-30">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={onDelete} disabled={deleting || disabled}
            className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-30">
            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </div>
  )
}

function ProductInlineForm({ data, onChange, onSave, onCancel, saving, isNew }: {
  data: ProdForm; onChange: (d: ProdForm) => void
  onSave: () => void; onCancel: () => void; saving: boolean; isNew?: boolean
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
          ["lamina","Lámina","text"],["muestra","Muestra","text"],["envase","Envase","text"],
          ["alto","Alto","number"],["cilindro","Cilindro","number"],["cierre","Cierre","number"],
        ] as [keyof ProdForm, string, string][]).map(([k, label, type]) => (
          <div key={k}>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 mb-1.5">{label}</label>
            <Input type={type} value={data[k]} onChange={set(k)} className={inp} />
          </div>
        ))}
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
            ? <ProductInlineForm key={p.id} data={form} onChange={setForm} onSave={save} onCancel={cancel} saving={saving} />
            : <ProductCard key={p.id} producto={p} idx={i} onEdit={() => startEdit(p)} onDelete={() => remove(p.id)} deleting={deleting === p.id} disabled={editingId !== null} />
        )}

        {editingId === "new"
          ? <ProductInlineForm data={form} onChange={setForm} onSave={save} onCancel={cancel} saving={saving} isNew />
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
  "cuit","telefono","domicilio","localidad","provincia","pais","transporte","observaciones",
]

interface ClienteDetailDialogProps {
  cliente: Cliente | null
  onClose: () => void
  onUpdate: (updated: Cliente) => void
}

export function ClienteDetailDialog({ cliente, onClose, onUpdate }: ClienteDetailDialogProps) {
  const [tab, setTab] = useState<TabKey>("general")
  const [editing, setEditing] = useState(false)
  const [editData, setEditData] = useState<Record<string, unknown>>({})
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<"success" | "error" | "">("")
  const [hermanas, setHermanas] = useState<{ id: number; id_cliente: number | null; marca: string | null }[]>([])
  const [productos, setProductos] = useState<ClienteProducto[]>([])

  useEffect(() => { setProductos(cliente?.productos ?? []) }, [cliente?.id])

  useEffect(() => {
    if (!cliente?.razon_social_id || editing) { setHermanas([]); return }
    api.razonessociales.get(cliente.razon_social_id)
      .then((rs) => setHermanas(rs.marcas.filter((m) => m.id !== cliente.id)))
      .catch(() => setHermanas([]))
  }, [cliente?.razon_social_id, cliente?.id, editing])

  const handleOpen = (open: boolean) => {
    if (!open) { onClose(); setEditing(false); setSaveMsg(""); setTab("general") }
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
      const numeric = ["id_cliente", "razon_social_id"]
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
      case "ubicacion":
        return (
          <div className="grid grid-cols-3 gap-4">
            <FieldCard label="Domicilio" fieldKey="domicilio" value={d?.domicilio as string} full {...fieldProps} />
            <FieldCard label="Localidad" fieldKey="localidad" value={d?.localidad as string} {...fieldProps} />
            <FieldCard label="Provincia" fieldKey="provincia" value={d?.provincia as string} {...fieldProps} />
            <FieldCard label="País"      fieldKey="pais"      value={d?.pais as string}      {...fieldProps} />
          </div>
        )
      case "contacto":
        return (
          <div className="grid grid-cols-3 gap-4">
            <FieldCard label="Teléfono" fieldKey="telefono" value={d?.telefono as string} {...fieldProps} />
          </div>
        )
      case "transporte":
        return (
          <div className="grid grid-cols-3 gap-4">
            <FieldCard label="Transporte" fieldKey="transporte" value={d?.transporte as string} full {...fieldProps} />
          </div>
        )
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
