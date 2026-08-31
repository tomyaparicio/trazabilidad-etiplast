"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { api } from "@/lib/api"
import type { RoleCatalogo, RolePermisos, RoleInput } from "@/lib/api/types"
import { PageContainer } from "@/components/ui/page-container"
import { PageHeader } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty-state"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import {
  ShieldCheck, Plus, Check, Trash2, Loader2, Lock, AlertCircle, RefreshCw, Save, Eye,
} from "lucide-react"

// Vistas/módulos que pertenecen a la sección Administración del sistema. La UI
// las agrupa aparte y las marca como reservadas: su enforcement queda del lado
// del admin (backend `verify_admin`), no se delega por acción a otros roles.
const VISTAS_ADMIN = new Set(["usuarios", "roles", "razones_sociales", "rubros", "envases", "maquinas", "calidad", "auditoria"])
const MODULOS_ADMIN = new Set(["usuarios", "roles", "catalogos", "auditoria"])

const ACCION_LABEL: Record<string, string> = {
  ver: "Ver", crear: "Crear", editar: "Editar", borrar: "Borrar", aprobar: "Aprobar",
}

function sameSet(a: Set<string>, b: string[]): boolean {
  if (a.size !== b.length) return false
  return b.every((x) => a.has(x))
}

export default function RolesPage() {
  const [catalogo, setCatalogo] = useState<RoleCatalogo | null>(null)
  const [roles, setRoles] = useState<RolePermisos[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [nuevoOpen, setNuevoOpen] = useState(false)
  const [toDelete, setToDelete] = useState<RolePermisos | null>(null)

  // Borrador editable del rol seleccionado.
  const [nombre, setNombre] = useState("")
  const [vistas, setVistas] = useState<Set<string>>(new Set())
  const [acciones, setAcciones] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  const selected = roles.find((r) => r.id === selectedId) ?? null

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const [cat, list] = await Promise.all([api.roles.catalogo(), api.admin.roles.list()])
      setCatalogo(cat)
      setRoles(list.data)
      setSelectedId((prev) => prev ?? list.data[0]?.id ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar los roles")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Cargar el borrador cada vez que cambia la selección (o llega data nueva).
  useEffect(() => {
    const r = roles.find((x) => x.id === selectedId)
    if (r) {
      setNombre(r.nombre)
      setVistas(new Set(r.vistas))
      setAcciones(new Set(r.acciones))
    }
  }, [selectedId, roles])

  const dirty = useMemo(() => {
    if (!selected || selected.protegido) return false
    return (
      nombre.trim() !== selected.nombre ||
      !sameSet(vistas, selected.vistas) ||
      !sameSet(acciones, selected.acciones)
    )
  }, [selected, nombre, vistas, acciones])

  const readOnly = !selected || selected.protegido || saving

  const toggleVista = (clave: string) =>
    setVistas((s) => {
      const n = new Set(s)
      n.has(clave) ? n.delete(clave) : n.add(clave)
      return n
    })

  const toggleAccion = (key: string) =>
    setAcciones((s) => {
      const n = new Set(s)
      n.has(key) ? n.delete(key) : n.add(key)
      return n
    })

  const toggleModulo = (mod: RoleCatalogo["modulos"][number]) => {
    const keys = mod.acciones.map((a) => `${mod.clave}:${a}`)
    const allOn = keys.every((k) => acciones.has(k))
    setAcciones((s) => {
      const n = new Set(s)
      keys.forEach((k) => (allOn ? n.delete(k) : n.add(k)))
      return n
    })
  }

  const handleSave = async () => {
    if (!selected || selected.protegido) return
    setSaving(true)
    try {
      const payload: RoleInput = {
        nombre: nombre.trim() || selected.nombre,
        vistas: [...vistas],
        acciones: [...acciones],
      }
      const updated = await api.admin.roles.update(selected.id, payload)
      setRoles((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
      toast.success("Permisos guardados")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudieron guardar los permisos")
    } finally {
      setSaving(false)
    }
  }

  const handleCreated = (rol: RolePermisos) => {
    setRoles((prev) => [...prev, rol])
    setSelectedId(rol.id)
    setNuevoOpen(false)
  }

  return (
    <PageContainer>
      <PageHeader
        eyebrow="ADMINISTRACIÓN"
        title="Roles y permisos"
        subtitle="Definí qué secciones ve y qué acciones puede hacer cada rol."
        icon={ShieldCheck}
        actions={
          <Button
            onClick={() => setNuevoOpen(true)}
            className="h-11 gap-2 rounded-xl bg-gold px-4 text-sm font-semibold text-gold-foreground hover:bg-gold hover:brightness-95"
          >
            <Plus className="h-4 w-4" />
            Nuevo rol
          </Button>
        }
      />

      {error ? (
        <EmptyState
          icon={<AlertCircle className="h-8 w-8" strokeWidth={1.5} />}
          title="No se pudieron cargar los roles"
          description={error}
          action={
            <Button variant="outline" size="sm" onClick={fetchAll} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" />
              Reintentar
            </Button>
          }
        />
      ) : loading ? (
        <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
          <div className="h-72 animate-pulse rounded-2xl bg-muted" />
          <div className="h-[28rem] animate-pulse rounded-2xl bg-muted" />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
          {/* ── Lista de roles ── */}
          <aside className="space-y-2 lg:sticky lg:top-6 lg:self-start">
            {roles.map((r) => {
              const active = r.id === selectedId
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedId(r.id)}
                  className={`w-full rounded-2xl border p-4 text-left transition-colors ${
                    active
                      ? "border-gold/40 bg-gold/[0.07] ring-1 ring-gold/25"
                      : "border-border bg-card hover:bg-muted/60"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-foreground">{r.nombre}</span>
                    {r.protegido && (
                      <Lock className="h-3.5 w-3.5 shrink-0 text-gold" aria-label="Rol protegido" />
                    )}
                  </div>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{r.clave}</p>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    {r.vistas.length} vistas · {r.acciones.length} acciones
                  </p>
                </button>
              )
            })}
          </aside>

          {/* ── Editor del rol seleccionado ── */}
          {selected && catalogo ? (
            <section className="min-w-0 space-y-6 rounded-2xl border border-border bg-card p-5 sm:p-6">
              {/* Cabecera del editor */}
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Nombre del rol
                  </label>
                  <Input
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    disabled={readOnly}
                    className="h-11 max-w-sm rounded-xl bg-input text-base font-semibold"
                  />
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge className="border border-border bg-muted font-mono text-[11px] text-muted-foreground">
                      {selected.clave}
                    </Badge>
                    {selected.protegido && (
                      <Badge className="border border-gold/25 bg-gold/10 text-gold">
                        <Lock className="mr-1 h-3 w-3" /> Protegido · acceso total
                      </Badge>
                    )}
                  </div>
                </div>

                {!selected.protegido && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setToDelete(selected)}
                      className="h-10 gap-1.5 rounded-xl border-red-500/20 text-red-400 hover:bg-red-500/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Eliminar
                    </Button>
                    <Button
                      onClick={handleSave}
                      disabled={!dirty || saving}
                      className="h-10 gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-50"
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Guardar cambios
                    </Button>
                  </div>
                )}
              </div>

              {selected.protegido && (
                <p className="rounded-xl border border-gold/20 bg-gold/[0.06] px-4 py-3 text-sm text-muted-foreground">
                  El rol <strong className="text-foreground">Administrador</strong> tiene acceso total y no puede
                  modificarse: garantiza que el sistema nunca quede sin administrador.
                </p>
              )}

              {/* ── Vistas ── */}
              <PermSection
                icon={<Eye className="h-4 w-4 text-gold" />}
                titulo="Vistas"
                descripcion="Secciones que el rol ve en el menú lateral."
              >
                <VistasGrid
                  vistas={catalogo.vistas.filter((v) => !VISTAS_ADMIN.has(v.clave))}
                  isOn={(c) => (selected.protegido ? true : vistas.has(c))}
                  onToggle={toggleVista}
                  disabled={readOnly}
                />
                <GrupoAdmin>
                  <VistasGrid
                    vistas={catalogo.vistas.filter((v) => VISTAS_ADMIN.has(v.clave))}
                    isOn={(c) => (selected.protegido ? true : vistas.has(c))}
                    onToggle={toggleVista}
                    disabled={readOnly}
                  />
                </GrupoAdmin>
              </PermSection>

              {/* ── Acciones ── */}
              <PermSection
                icon={<ShieldCheck className="h-4 w-4 text-gold" />}
                titulo="Acciones"
                descripcion="Qué puede hacer el rol dentro de cada módulo."
              >
                <div className="space-y-3">
                  {catalogo.modulos.filter((m) => !MODULOS_ADMIN.has(m.clave)).map((mod) => (
                    <ModuloRow
                      key={mod.clave} mod={mod} acciones={acciones} protegido={selected.protegido}
                      disabled={readOnly} onToggleAccion={toggleAccion} onToggleModulo={() => toggleModulo(mod)}
                    />
                  ))}
                </div>
                <GrupoAdmin>
                  <div className="space-y-3">
                    {catalogo.modulos.filter((m) => MODULOS_ADMIN.has(m.clave)).map((mod) => (
                      <ModuloRow
                        key={mod.clave} mod={mod} acciones={acciones} protegido={selected.protegido}
                        disabled={readOnly} onToggleAccion={toggleAccion} onToggleModulo={() => toggleModulo(mod)}
                      />
                    ))}
                  </div>
                </GrupoAdmin>
              </PermSection>
            </section>
          ) : (
            <section className="rounded-2xl border border-border bg-card p-10">
              <EmptyState
                icon={<ShieldCheck className="h-8 w-8 text-muted-foreground" strokeWidth={1.5} />}
                title="Elegí un rol"
                description="Seleccioná un rol de la lista para configurar sus permisos, o creá uno nuevo."
              />
            </section>
          )}
        </div>
      )}

      <CrearRolDialog open={nuevoOpen} onClose={() => setNuevoOpen(false)} onCreated={handleCreated} />

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => { if (!o) setToDelete(null) }}
        title={`Eliminar rol "${toDelete?.nombre ?? ""}"`}
        description="Se quitará el rol del sistema. Los usuarios que lo tengan asignado deberán reasignarse primero. Esta acción no se puede deshacer."
        confirmLabel="Eliminar rol"
        onConfirm={async () => {
          if (!toDelete) return
          await api.admin.roles.delete(toDelete.id)
          const rest = roles.filter((r) => r.id !== toDelete.id)
          setRoles(rest)
          if (selectedId === toDelete.id) setSelectedId(rest[0]?.id ?? null)
          toast.success("Rol eliminado")
        }}
      />
    </PageContainer>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Subcomponentes de presentación
// ─────────────────────────────────────────────────────────────────────────────

function PermSection({ icon, titulo, descripcion, children }: {
  icon: React.ReactNode; titulo: string; descripcion: string; children: React.ReactNode
}) {
  return (
    <div className="space-y-3 border-t border-border pt-5">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-semibold text-foreground">{titulo}</h3>
      </div>
      <p className="text-xs text-muted-foreground">{descripcion}</p>
      <div className="space-y-4 pt-1">{children}</div>
    </div>
  )
}

/** Envuelve el bloque "Administración (reservado)" con una etiqueta discreta. */
function GrupoAdmin({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border/70 bg-muted/30 p-3">
      <p className="mb-3 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        <Lock className="h-3 w-3" /> Administración · reservado a administradores
      </p>
      {children}
    </div>
  )
}

function VistasGrid({ vistas, isOn, onToggle, disabled }: {
  vistas: { clave: string; nombre: string }[]
  isOn: (clave: string) => boolean
  onToggle: (clave: string) => void
  disabled: boolean
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {vistas.map((v) => (
        <Toggle key={v.clave} label={v.nombre} on={isOn(v.clave)} disabled={disabled} onClick={() => onToggle(v.clave)} />
      ))}
    </div>
  )
}

function ModuloRow({ mod, acciones, protegido, disabled, onToggleAccion, onToggleModulo }: {
  mod: RoleCatalogo["modulos"][number]
  acciones: Set<string>
  protegido: boolean
  disabled: boolean
  onToggleAccion: (key: string) => void
  onToggleModulo: () => void
}) {
  const keys = mod.acciones.map((a) => `${mod.clave}:${a}`)
  const allOn = protegido || keys.every((k) => acciones.has(k))
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border bg-background/40 px-4 py-3">
      <button
        type="button"
        onClick={onToggleModulo}
        disabled={disabled}
        className="w-32 shrink-0 text-left text-sm font-medium text-foreground disabled:cursor-not-allowed"
      >
        {mod.nombre}
        <span className={`ml-1.5 text-[11px] ${allOn ? "text-gold" : "text-muted-foreground"}`}>
          {allOn ? "· todo" : ""}
        </span>
      </button>
      <div className="flex flex-1 flex-wrap gap-2">
        {mod.acciones.map((a) => {
          const key = `${mod.clave}:${a}`
          return (
            <Toggle
              key={key}
              label={ACCION_LABEL[a] ?? a}
              on={protegido ? true : acciones.has(key)}
              disabled={disabled}
              onClick={() => onToggleAccion(key)}
              size="sm"
            />
          )
        })}
      </div>
    </div>
  )
}

function Toggle({ label, on, disabled, onClick, size = "md" }: {
  label: string; on: boolean; disabled: boolean; onClick: () => void; size?: "sm" | "md"
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      className={`inline-flex items-center gap-1.5 rounded-lg border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${
        size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-[13px]"
      } ${
        on
          ? "border-gold/40 bg-gold/15 text-gold"
          : "border-border bg-background text-muted-foreground hover:bg-muted"
      }`}
    >
      <span
        className={`flex h-3.5 w-3.5 items-center justify-center rounded-[4px] border ${
          on ? "border-gold bg-gold text-gold-foreground" : "border-muted-foreground/40"
        }`}
      >
        {on && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
      </span>
      {label}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Dialog: crear rol (solo nombre; luego se configuran los permisos)
// ─────────────────────────────────────────────────────────────────────────────

function CrearRolDialog({ open, onClose, onCreated }: {
  open: boolean; onClose: () => void; onCreated: (rol: RolePermisos) => void
}) {
  const [nombre, setNombre] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (open) { setNombre(""); setError("") }
  }, [open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nombre.trim()) return
    setSaving(true)
    setError("")
    try {
      const rol = await api.admin.roles.create({ nombre: nombre.trim(), vistas: [], acciones: [] })
      toast.success("Rol creado")
      onCreated(rol)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "No se pudo crear el rol"
      setError(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !saving) onClose() }}>
      <DialogContent className="border-border bg-card sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <ShieldCheck className="h-5 w-5 text-gold" />
            Nuevo rol
          </DialogTitle>
          <DialogDescription>Dale un nombre. Después configurás sus vistas y acciones.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">{error}</div>
          )}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Nombre del rol <span className="text-red-400">*</span>
            </label>
            <Input
              autoFocus
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Vendedor, Supervisor de producción…"
              className="h-11 rounded-xl bg-input"
            />
          </div>
          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving} className="rounded-xl border-border">
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={saving || !nombre.trim()}
              className="gap-2 rounded-xl bg-gold text-gold-foreground hover:bg-gold hover:brightness-95"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Crear rol
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
