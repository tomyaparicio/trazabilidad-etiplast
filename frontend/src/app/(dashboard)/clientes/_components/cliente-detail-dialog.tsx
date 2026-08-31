"use client"

import { useState, useEffect, useRef } from "react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import type { Cliente, ClienteProducto, Maquina, RazonSocial } from "@/types/database"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Pencil, Check, Loader2, AlertCircle, CheckCircle2, Plus, Trash2,
  Building2, MapPin, Phone, FileText, Hash, Boxes, Truck, TriangleAlert,
  MessageCircle, Navigation, ChevronLeft,
} from "lucide-react"

// Detalle de cliente: hero + overview interactivo + tabs.
// ─── Tabs ─────────────────────────────────────────────────────────────────────
const TABS = [
  { key: "general",    label: "General",      icon: Hash      },
  { key: "razon",      label: "Razón Social", icon: Building2 },
  { key: "ubicacion",  label: "Ubicación",    icon: MapPin    },
  { key: "contacto",   label: "Contacto",     icon: Phone     },
  { key: "transporte", label: "Transporte",   icon: Truck     },
  { key: "notas",      label: "Notas",        icon: FileText  },
] as const
type TabKey = typeof TABS[number]["key"]

// Extrae el tamaño/presentación del nombre: "Agua x 500 ml" → "500 ml"; sin " x " → null.
const sizeFrom = (n?: string | null) => {
  if (!n) return null
  const p = n.split(/\s+x\s+/i)
  return p.length > 1 ? p[p.length - 1].trim() : null
}

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
    if (!query.trim() || creating) return; setCreating(true)
    try {
      const rs = await api.razonessociales.create({ razon_social: query.trim() })
      setOpen(false); onChange(rs.id, rs.razon_social, rs.cuit)
      toast.success("Razón social creada")
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "No se pudo crear la razón social")
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
  nombre: string; envase: string; envase_codificado: string; ubicacion: string
  volumen_cantidad: string; volumen_unidad: string
  lamina: string; muestra: string; alto: string; cilindro: string; cierre: string
  maquina_impresora_id: string
}
const EMPTY: ProdForm = { nombre:"", envase:"", envase_codificado:"", ubicacion:"", volumen_cantidad:"", volumen_unidad:"", lamina:"", muestra:"", alto:"", cilindro:"", cierre:"", maquina_impresora_id:"" }
const toForm = (p: ClienteProducto): ProdForm => ({
  nombre: p.nombre ?? "", envase: p.envase ?? "",
  envase_codificado: p.envase_codificado ?? "",
  ubicacion: p.ubicacion ?? "",
  volumen_cantidad: p.volumen_cantidad != null ? String(p.volumen_cantidad) : "",
  volumen_unidad: p.volumen_unidad ?? "", lamina: p.lamina ?? "", muestra: p.muestra ?? "",
  alto: p.alto != null ? String(p.alto) : "",
  cilindro: p.cilindro != null ? String(p.cilindro) : "",
  cierre: p.cierre != null ? String(p.cierre) : "",
  maquina_impresora_id: p.maquina_impresora_id != null ? String(p.maquina_impresora_id) : "",
})
const toBody = (f: ProdForm) => ({
  nombre: f.nombre || null, envase: f.envase || null,
  envase_codificado: f.envase_codificado || null,
  ubicacion: f.ubicacion || null,
  volumen_cantidad: f.volumen_cantidad ? Number(f.volumen_cantidad) : null,
  volumen_unidad: f.volumen_unidad || null, lamina: f.lamina || null, muestra: f.muestra || null,
  alto: f.alto ? Number(f.alto) : null,
  cilindro: f.cilindro ? Number(f.cilindro) : null,
  cierre: f.cierre ? Number(f.cierre) : null,
  maquina_impresora_id: f.maquina_impresora_id ? Number(f.maquina_impresora_id) : null,
})

function ProductCard({ producto, idx, onEdit, onDelete, deleting, disabled }: {
  producto: ClienteProducto; idx: number
  onEdit: () => void; onDelete: () => void; deleting: boolean; disabled: boolean
}) {
  // El tamaño sale del nombre ("Agua x 500 cc" → "500 cc"); si no, del volumen cargado.
  const nameSize = sizeFrom(producto.nombre)
  const volSize = producto.volumen_cantidad != null
    ? `${producto.volumen_cantidad}${producto.volumen_unidad ? ` ${producto.volumen_unidad}` : ""}`
    : null
  const size = nameSize ?? volSize
  const tipo = (producto.nombre || "").split(/\s+x\s+/i)[0].trim()
  const code = `P-${String(idx + 1).padStart(2, "0")}`
  // La celda Envase va SIEMPRE y concentra sus datos: nombre + código + ubicación.
  const envaseSub = [
    { label: "Código",    value: producto.envase_codificado || null },
    { label: "Ubicación", value: producto.ubicacion || null },
  ]
  const specs = [
    { k: "Envase", v: producto.envase || "—", sub: envaseSub },
    producto.lamina                   && { k: "Lámina",    v: producto.lamina },
    producto.alto                     && { k: "Alto",      v: String(producto.alto) },
    // El cilindro se expresa por DIÁMETRO → se muestra con "ø".
    producto.cilindro                 && { k: "Cilindro",  v: `ø ${producto.cilindro}` },
    // El cierre siempre es medida INTERIOR → se muestra con "(int)".
    producto.cierre                   && { k: "Cierre",    v: `${producto.cierre} (int)` },
    producto.muestra                  && { k: "Muestra",   v: producto.muestra },
    producto.maquina_impresora_nombre && { k: "Impresora", v: producto.maquina_impresora_nombre },
  ].filter(Boolean) as { k: string; v: string; sub?: { label: string; value: string | null }[] }[]

  return (
    <div className="group relative grid grid-cols-1 overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-white/15 md:grid-cols-[220px_1fr]">
      <div className="absolute right-3 top-3 z-10 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <button type="button" onClick={onEdit} disabled={disabled}
          className="grid h-8 w-8 place-items-center rounded-lg bg-card/80 text-muted-foreground backdrop-blur-sm transition-colors hover:bg-muted/60 hover:text-foreground disabled:opacity-30">
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={onDelete} disabled={deleting || disabled}
          className="grid h-8 w-8 place-items-center rounded-lg bg-card/80 text-muted-foreground backdrop-blur-sm transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-30">
          {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Lead: identidad de la presentación */}
      <div
        className="relative border-b border-white/10 p-5 md:border-b-0 md:border-r"
        style={{ background: "var(--color-brand)" }}
      >
        <div className="font-mono text-[12px] font-bold tracking-[0.12em] text-white/55">{code}</div>
        {size ? (
          <>
            <div className="mt-3 text-[13.5px] font-extrabold uppercase tracking-[0.2em] text-white/85">{tipo || "Producto"}</div>
            <div className="mt-0.5 text-[40px] font-extrabold leading-[0.95] tracking-tight text-white">{size}</div>
          </>
        ) : (
          <div className="mt-3 text-2xl font-extrabold leading-tight text-white">
            {producto.nombre || <span className="text-base font-normal italic text-white/40">Sin nombre</span>}
          </div>
        )}
      </div>

      {/* Specs: grilla técnica de producción */}
      {specs.length > 0 ? (
        <dl className="flex h-full flex-wrap">
          {specs.map(({ k, v, sub }, i) => (
            <div key={k} className={`flex min-w-[112px] flex-1 flex-col justify-center px-5 py-3.5 ${i > 0 ? "border-l border-border" : ""}`}>
              <dt className="font-mono text-[11.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{k}</dt>
              <dd className={`mt-1.5 text-[21px] font-extrabold tabular-nums ${v === "—" ? "text-muted-foreground/40" : "text-foreground"}`}>{v}</dd>
              {sub && (
                <div className="mt-1.5 flex flex-col gap-0.5">
                  {sub.map((s) => (
                    <div key={s.label} className="flex items-baseline gap-2">
                      <span className="font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{s.label}</span>
                      <span className={`font-mono text-[14px] font-bold tracking-wide ${s.value ? "text-gold" : "text-muted-foreground/40"}`}>{s.value || "—"}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </dl>
      ) : (
        <div className="flex items-center px-6 py-6 text-[15px] italic text-muted-foreground/40">Sin especificaciones cargadas</div>
      )}
    </div>
  )
}

function ProductInlineForm({ data, onChange, onSave, onCancel, saving, isNew, envases, impresoras }: {
  data: ProdForm; onChange: (d: ProdForm) => void
  onSave: () => void; onCancel: () => void; saving: boolean; isNew?: boolean
  envases: string[]
  impresoras: Maquina[]
}) {
  const set = (k: keyof ProdForm) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...data, [k]: e.target.value })
  const inp = "h-9 rounded-lg bg-input border-border text-sm focus-visible:border-gold/40 focus-visible:ring-gold/10"
  const sel = `${inp} w-full px-3 py-1.5`

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
          ["envase_codificado","Cód. Envase","text"],["ubicacion","Ubicación","text"],
          ["alto","Alto","number"],["cilindro","Cilindro (ø)","number"],["cierre","Cierre (int)","number"],
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
        <div className="col-span-4 sm:col-span-2">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 mb-1.5">Impresora</label>
          <select
            value={data.maquina_impresora_id}
            onChange={(e) => onChange({ ...data, maquina_impresora_id: e.target.value })}
            className={sel}
          >
            <option value="">Sin asignar</option>
            {data.maquina_impresora_id
              && !impresoras.some((m) => String(m.id) === data.maquina_impresora_id) && (
              <option value={data.maquina_impresora_id}>
                Impresora guardada (id {data.maquina_impresora_id})
              </option>
            )}
            {impresoras.map((m) => (
              <option key={m.id} value={String(m.id)}>
                {m.nombre}{m.activa ? "" : " (inactiva)"}
              </option>
            ))}
          </select>
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
  const [impresoras, setImpresoras] = useState<Maquina[]>([])

  useEffect(() => {
    api.admin.envases.list().then((r) => setEnvases(r.map((e: { nombre: string }) => e.nombre))).catch(() => {})
  }, [])

  useEffect(() => {
    api.admin.maquinas.list("impresion").then(setImpresoras).catch(() => {})
  }, [])

  const startEdit = (p: ClienteProducto) => { setForm(toForm(p)); setEditingId(p.id); setError("") }
  const startNew  = () => { setForm(EMPTY); setEditingId("new"); setError("") }
  const cancel    = () => { setEditingId(null); setForm(EMPTY); setError("") }

  const save = async () => {
    if (saving) return
    setSaving(true); setError("")
    try {
      const body = toBody(form)
      if (editingId === "new") {
        const n = await api.productos.create(clienteId, body)
        onProductosChange([...productos, n])
        toast.success("Producto agregado")
      } else {
        const u = await api.productos.update(clienteId, editingId as number, body)
        onProductosChange(productos.map((p) => p.id === editingId ? u : p))
        toast.success("Producto actualizado")
      }
      cancel()
    } catch (e) {
      setError("Error al guardar el producto")
      toast.error(e instanceof Error && e.message ? e.message : "No se pudo guardar el producto")
    }
    finally { setSaving(false) }
  }

  const remove = async (id: number) => {
    if (deleting != null) return
    setDeleting(id); setError("")
    try {
      await api.productos.delete(clienteId, id)
      onProductosChange(productos.filter((p) => p.id !== id))
      toast.success("Producto eliminado")
    } catch (e) {
      setError("Error al eliminar")
      toast.error(e instanceof Error && e.message ? e.message : "No se pudo eliminar el producto")
    }
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

      <div className="flex flex-col gap-3">
        {productos.map((p, i) =>
          editingId === p.id
            ? <ProductInlineForm key={p.id} data={form} onChange={setForm} onSave={save} onCancel={cancel} saving={saving} envases={envases} impresoras={impresoras} />
            : <ProductCard key={p.id} producto={p} idx={i} onEdit={() => startEdit(p)} onDelete={() => remove(p.id)} deleting={deleting === p.id} disabled={editingId !== null} />
        )}

        {editingId === "new"
          ? <ProductInlineForm data={form} onChange={setForm} onSave={save} onCancel={cancel} saving={saving} isNew envases={envases} impresoras={impresoras} />
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

interface ClienteDetalleProps {
  cliente: Cliente | null
  onBack: () => void
  onUpdate: (updated: Cliente) => void
  onDelete?: (id: number) => void
}

export function ClienteDetalle({ cliente, onBack, onUpdate, onDelete }: ClienteDetalleProps) {
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

  const handleDelete = async () => {
    if (!cliente || deleting) return
    setDeleting(true)
    try {
      await api.clientes.delete(cliente.id)
      onDelete?.(cliente.id)
      toast.success(`Cliente "${cliente.marca ?? ""}" eliminado`)
      onBack()
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "No se pudo eliminar el cliente")
    }
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
    if (!cliente || saving) return
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
      toast.success("Cambios guardados")
      setTimeout(() => setSaveMsg(""), 3000)
    } catch (e) {
      setSaveMsg("error")
      toast.error(e instanceof Error && e.message ? e.message : "No se pudieron guardar los cambios")
    }
    finally { setSaving(false) }
  }

  const set = (key: string, val: string) => setEditData((p) => ({ ...p, [key]: val || null }))
  const d = editing ? editData : (cliente as Record<string, unknown> | null)

  // Acciones rápidas del hero (modo vista).
  const heroTel = cliente?.telefono ?? null
  const heroWa = heroTel ? heroTel.replace(/[\s\-()]/g, "").replace(/^0/, "54").replace(/^(?!\+)/, "54") : null
  const heroWaUrl = heroWa ? `https://wa.me/${heroWa}` : null
  const heroTelUrl = heroTel ? `tel:${heroTel.replace(/[^\d+]/g, "")}` : null
  const heroAddr = [cliente?.domicilio, cliente?.localidad, cliente?.provincia, "Argentina"].filter(Boolean)
  const heroMapsUrl = cliente?.latitud != null && cliente?.longitud != null
    ? `https://www.google.com/maps?q=${cliente.latitud},${cliente.longitud}`
    : heroAddr.length > 1
      ? `https://www.google.com/maps/search/${encodeURIComponent(heroAddr.join(", "))}`
      : null

  // Datos del cliente (grilla técnica bajo las presentaciones).
  const datos: { label: string; value: string | null }[] = cliente ? [
    { label: "Localidad",       value: cliente.localidad },
    { label: "Provincia",       value: cliente.provincia },
    { label: "País",            value: cliente.pais },
    { label: "CUIT",            value: cliente.cuit },
    { label: "Teléfono",        value: cliente.telefono },
    { label: "Domicilio",       value: cliente.domicilio },
    { label: "Transporte",      value: cliente.transporte },
    { label: "Dom. transporte", value: cliente.transporte_domicilio },
    { label: "Loc. transporte", value: cliente.transporte_localidad },
    { label: "Coordenadas",     value: cliente.latitud != null && cliente.longitud != null ? `${cliente.latitud}, ${cliente.longitud}` : null },
  ] : []

  const fieldProps = { editing, editData, onChange: set }

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
    }
  }

  return (
    <div className="min-h-full w-full overflow-y-auto bg-background pb-12">
      {/* ── Hero (banda a lo ancho, con Volver adentro) ── */}
      <div
        className="relative overflow-hidden border-b border-white/10 px-5 pb-8 pt-5 text-white sm:px-8 lg:px-10"
        style={{ background: "var(--color-brand)" }}
      >
          {/* Logo Etiplast como marca de agua */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logoSOLO.png"
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute -right-12 top-1/2 h-96 w-96 -translate-y-1/2 select-none object-contain opacity-[0.13] brightness-0 invert"
          />

          <div className="relative mb-3 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onBack}
              className="-ml-1 inline-flex items-center gap-1.5 rounded-lg px-1 py-1 text-[13px] font-semibold text-white/70 transition-colors hover:text-white"
            >
              <ChevronLeft className="h-4 w-4" /> Volver a clientes
            </button>

            <div className="flex items-center gap-2 shrink-0">
              {confirmDelete ? (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-red-100">
                    <TriangleAlert className="h-3.5 w-3.5" />
                    ¿Eliminar &ldquo;{cliente?.marca}&rdquo;?
                  </div>
                  <button type="button" onClick={() => setConfirmDelete(false)} disabled={deleting}
                    className="h-9 rounded-lg border border-white/25 bg-white/10 px-3 text-xs font-bold text-white transition-colors hover:bg-white/20 disabled:opacity-50">
                    Cancelar
                  </button>
                  <button type="button" onClick={handleDelete} disabled={deleting}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-red-300/40 bg-red-500/30 px-3 text-xs font-bold text-white transition-colors hover:bg-red-500/45 disabled:opacity-50">
                    {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    Eliminar
                  </button>
                </div>
              ) : (
                <>
                  {saveMsg === "success" && (
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-200">
                      <CheckCircle2 className="h-3.5 w-3.5" />Guardado
                    </span>
                  )}
                  {saveMsg === "error" && (
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-red-200">
                      <AlertCircle className="h-3.5 w-3.5" />Error
                    </span>
                  )}
                  {!editing && (
                    <button type="button" onClick={() => setConfirmDelete(true)} aria-label="Eliminar"
                      className="grid h-9 w-9 place-items-center rounded-lg border border-red-300/30 bg-red-500/15 text-red-100 transition-colors hover:bg-red-500/30">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                  {!editing ? (
                    <button type="button" onClick={startEditing}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/25 bg-white/10 px-3.5 text-[13px] font-bold text-white transition-colors hover:bg-white/20">
                      <Pencil className="h-3.5 w-3.5" />Editar
                    </button>
                  ) : (
                    <>
                      <button type="button" onClick={cancelEditing}
                        className="h-9 rounded-lg border border-white/25 bg-white/10 px-3.5 text-[13px] font-bold text-white transition-colors hover:bg-white/20">
                        Cancelar
                      </button>
                      <button type="button" onClick={handleSave} disabled={saving}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-gold px-3.5 text-[13px] font-bold text-gold-foreground transition hover:brightness-95 disabled:opacity-50">
                        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}Guardar
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          <p className="relative text-[11px] font-bold uppercase tracking-[0.2em] text-white/70">Ficha de cliente</p>

          <div className="relative mt-3 flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <div className="grid h-[76px] w-[76px] shrink-0 place-items-center rounded-2xl bg-gold text-[32px] font-black text-gold-foreground shadow-lg ring-1 ring-white/25">
                {String(d?.marca || "?")[0]?.toUpperCase()}
              </div>
              <div className="min-w-0">
                <h1 className="font-display truncate text-[40px] font-bold leading-[1.05] text-white">
                  {String(d?.marca || "—")}
                </h1>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <p className="text-[13px] font-semibold text-white/75">Cliente #{cliente?.id_cliente}</p>
                  {cliente?.rubro && (
                    <span className="rounded-full border border-white/25 bg-white/15 px-2.5 py-0.5 text-[11px] font-bold text-white">
                      {cliente.rubro}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {!editing && (
            <div className="relative mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
              <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2">
                {cliente?.razon_social && (
                  <span className="inline-flex min-w-0 items-center gap-2 text-[15px] font-semibold text-white/90">
                    <Building2 className="h-4 w-4 shrink-0 text-white/60" />
                    <span className="truncate">{cliente.razon_social}</span>
                  </span>
                )}
                {cliente?.transporte && (
                  <span className="inline-flex items-center gap-2 text-[15px] font-semibold text-white/90">
                    <Truck className="h-4 w-4 shrink-0 text-white/60" />
                    <span className="text-[11px] font-bold uppercase tracking-wide text-white/55">Transp.</span>
                    {cliente.transporte}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                {heroWaUrl ? (
                  <a href={heroWaUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl bg-gold px-4 py-2 text-[13.5px] font-bold text-gold-foreground transition hover:brightness-95">
                    <MessageCircle className="h-4 w-4" /> WhatsApp
                  </a>
                ) : (
                  <button type="button" onClick={() => { startEditing(); setTab("contacto") }} title="Sin teléfono cargado — clic para agregar"
                    className="inline-flex items-center gap-1.5 rounded-xl bg-gold px-4 py-2 text-[13.5px] font-bold text-gold-foreground transition hover:brightness-95">
                    <MessageCircle className="h-4 w-4" /> WhatsApp
                  </button>
                )}
                {heroTelUrl ? (
                  <a href={heroTelUrl}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-white/25 bg-white/10 px-4 py-2 text-[13.5px] font-bold text-white transition hover:bg-white/20">
                    <Phone className="h-4 w-4" /> Llamar
                  </a>
                ) : (
                  <button type="button" onClick={() => { startEditing(); setTab("contacto") }} title="Sin teléfono cargado — clic para agregar"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-white/25 bg-white/10 px-4 py-2 text-[13.5px] font-bold text-white transition hover:bg-white/20">
                    <Phone className="h-4 w-4" /> Llamar
                  </button>
                )}
                {heroMapsUrl ? (
                  <a href={heroMapsUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-white/25 bg-white/10 px-4 py-2 text-[13.5px] font-bold text-white transition hover:bg-white/20">
                    <Navigation className="h-4 w-4" /> Mapa
                  </a>
                ) : (
                  <button type="button" onClick={() => { startEditing(); setTab("ubicacion") }} title="Sin coordenadas — clic para agregar"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-white/25 bg-white/10 px-4 py-2 text-[13.5px] font-bold text-white transition hover:bg-white/20">
                    <Navigation className="h-4 w-4" /> Mapa
                  </button>
                )}
              </div>
            </div>
          )}
      </div>

      <div className="px-5 pt-7 sm:px-8 lg:px-10">
        {editing ? (
          <>
            {/* ── Tabs de edición ── */}
            <div className="mb-6 flex items-center gap-1.5 overflow-x-auto border-b border-border pb-3">
              {TABS.map(({ key, label, icon: Icon }) => {
                const isActive = tab === key
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTab(key)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all shrink-0 border ${
                      isActive
                        ? "bg-gold/15 text-gold border-gold/35 shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50 border-transparent"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" strokeWidth={2} />
                    {label}
                  </button>
                )
              })}
            </div>
            {renderTab()}
          </>
        ) : (
          <div>
            {/* ── Presentaciones (protagonista) ── */}
            <div className="mb-6 flex flex-wrap items-baseline gap-3">
              <span className="text-2xl leading-none text-gold">★</span>
              <h2 className="font-display text-[28px] font-bold text-foreground">Presentaciones</h2>
              {productos.length > 0 && (
                <span className="rounded-full bg-gold/15 px-3 py-0.5 text-sm font-bold text-gold">{productos.length}</span>
              )}
              <span className="ml-auto text-[15px] font-medium text-muted-foreground">Lo que le producimos a este cliente</span>
            </div>
            {cliente && (
              <ProductosTab clienteId={cliente.id} productos={productos} onProductosChange={setProductos} />
            )}

            {/* ── Datos del cliente ── */}
            <div className="mt-10">
              <div className="mb-4 flex items-center gap-2.5">
                <Building2 className="h-6 w-6 text-gold" />
                <h2 className="text-[26px] font-bold text-foreground">Datos del cliente</h2>
              </div>
              <div className="grid grid-cols-2 overflow-hidden rounded-2xl border border-border sm:grid-cols-3 lg:grid-cols-4">
                {datos.map((f) => (
                  <div key={f.label} className="border-b border-r border-border p-5">
                    <div className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{f.label}</div>
                    <div className="mt-2 text-[19px] font-bold text-foreground">
                      {f.value || <span className="font-medium text-muted-foreground/40">—</span>}
                    </div>
                  </div>
                ))}
              </div>
              {cliente?.observaciones && (
                <div className="mt-3 rounded-2xl border border-border p-5">
                  <div className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Observaciones</div>
                  <div className="mt-2 text-[15px] font-medium leading-relaxed text-foreground/90">{cliente.observaciones}</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
