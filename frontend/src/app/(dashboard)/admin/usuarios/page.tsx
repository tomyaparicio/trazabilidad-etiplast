"use client"

import { useEffect, useState, useCallback } from "react"
import { PageContainer } from "@/components/ui/page-container"
import { toast } from "sonner"
import { api } from "@/lib/api"
import type { UserAdmin } from "@/lib/api/types"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select } from "@/components/ui/select"
import { PageHeader } from "@/components/ui/page-header"
import { DataTable, type ColumnDef } from "@/components/ui/data-table"
import { EmptyState } from "@/components/ui/empty-state"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Shield, Plus, UserCheck, UserX, Loader2, Users, Pencil, AlertCircle, RefreshCw } from "lucide-react"

/** Colores por rol para el <Select> de la tabla (incluye variante dark explícita
 * para no depender del orden de cascada con el `dark:bg-white/[0.04]` base). */
const ROLE_SELECT_CLASS: Record<string, string> = {
  admin: "bg-amber-500/10 text-amber-400 border-amber-500/20 dark:bg-amber-500/10",
  operario: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 dark:bg-emerald-500/10",
  user: "bg-blue-500/10 text-blue-400 border-blue-500/20 dark:bg-blue-500/10",
}

export default function AdminUsuariosPage() {
  const [users, setUsers] = useState<UserAdmin[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [nuevoOpen, setNuevoOpen] = useState(false)
  const [editUser, setEditUser] = useState<UserAdmin | null>(null)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const data = await api.admin.listUsers()
      setUsers(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar usuarios")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const handleToggleActive = async (user: UserAdmin) => {
    try {
      const updated = await api.admin.updateUser(user.id, { is_active: !user.is_active })
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)))
      toast.success(updated.is_active ? "Usuario activado" : "Usuario desactivado")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo actualizar el usuario")
    }
  }

  const handleRoleChange = async (user: UserAdmin, newRole: string) => {
    try {
      const updated = await api.admin.updateUser(user.id, { role: newRole })
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)))
      toast.success("Rol actualizado")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo actualizar el rol")
    }
  }

  const handleUserCreated = (newUser: UserAdmin) => {
    setUsers((prev) => [...prev, newUser])
    setNuevoOpen(false)
  }

  const handleUserUpdated = (updated: UserAdmin) => {
    setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)))
    setEditUser(null)
  }

  const columns: ColumnDef<UserAdmin>[] = [
    {
      key: "id",
      header: "ID",
      cellClassName: "font-mono text-xs text-muted-foreground tabular-nums",
      cell: (u) => u.id,
    },
    {
      key: "usuario",
      header: "Usuario",
      cell: (u) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center text-xs font-bold text-primary-foreground shrink-0 border border-border">
            {(u.nombre || u.email)[0]?.toUpperCase()}
          </div>
          <span className="text-sm font-medium text-foreground">{u.nombre_completo}</span>
        </div>
      ),
    },
    {
      key: "email",
      header: "Email",
      cell: (u) => <span className="text-sm text-muted-foreground">{u.email}</span>,
    },
    {
      key: "rol",
      header: "Rol",
      cell: (u) => (
        <Select
          aria-label={`Rol de ${u.nombre_completo}`}
          value={u.role}
          onChange={(e) => handleRoleChange(u, e.target.value)}
          className={`h-8 text-xs md:text-xs font-medium ${ROLE_SELECT_CLASS[u.role] ?? ""}`}
        >
          <option value="admin">Admin</option>
          <option value="user">Usuario</option>
          <option value="operario">Operario</option>
        </Select>
      ),
    },
    {
      key: "estado",
      header: "Estado",
      cell: (u) =>
        u.is_active ? (
          <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Activo</Badge>
        ) : (
          <Badge className="bg-red-500/10 text-red-400 border border-red-500/20">Inactivo</Badge>
        ),
    },
    {
      key: "acciones",
      header: "Acciones",
      headerClassName: "text-right",
      cellClassName: "text-right",
      cell: (u) => (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditUser(u)}
            className="h-8 rounded-lg text-xs gap-1.5 border-border text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            <Pencil className="w-3.5 h-3.5" />
            Editar
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleToggleActive(u)}
            className={`h-8 rounded-lg text-xs gap-1.5 transition-all ${
              u.is_active
                ? "border-red-500/20 text-red-400 hover:bg-red-500/10"
                : "border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10"
            }`}
          >
            {u.is_active ? (
              <><UserX className="w-3.5 h-3.5" />Desactivar</>
            ) : (
              <><UserCheck className="w-3.5 h-3.5" />Activar</>
            )}
          </Button>
        </div>
      ),
    },
  ]

  return (
    <PageContainer>

      {/* Header */}
      <PageHeader
        title="Usuarios"
        subtitle={`${users.length} usuarios registrados`}
        actions={
          <Button
            onClick={() => setNuevoOpen(true)}
            className="h-11 gap-2 rounded-xl bg-gold px-4 text-sm font-semibold text-gold-foreground hover:bg-gold hover:brightness-95"
          >
            <Plus className="w-4 h-4" />
            Nuevo usuario
          </Button>
        }
      />

      {/* Tabla / Error */}
      {error ? (
        <EmptyState
          icon={<AlertCircle className="w-8 h-8" strokeWidth={1.5} />}
          title="No se pudieron cargar los usuarios"
          description={error}
          action={
            <Button variant="outline" size="sm" onClick={fetchUsers} className="gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" />
              Reintentar
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={users}
          loading={loading}
          skeletonRows={4}
          keyExtractor={(u) => u.id}
          emptyIcon={<Users className="w-8 h-8 text-muted-foreground" strokeWidth={1.5} />}
          emptyTitle="Sin usuarios"
          emptyDescription="Todavía no se registraron usuarios."
        />
      )}

      {/* Dialog crear */}
      <CrearUsuarioDialog open={nuevoOpen} onClose={() => setNuevoOpen(false)} onCreated={handleUserCreated} />

      {/* Dialog editar */}
      {editUser && (
        <EditarUsuarioDialog user={editUser} onClose={() => setEditUser(null)} onUpdated={handleUserUpdated} />
      )}
    </PageContainer>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Dialog crear usuario
// ─────────────────────────────────────────────────────────────────────────────

function CrearUsuarioDialog({ open, onClose, onCreated }: {
  open: boolean
  onClose: () => void
  onCreated: (user: UserAdmin) => void
}) {
  const [form, setForm] = useState({ email: "", password: "", nombre: "", apellido: "", role: "user" })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  // Reset del formulario cada vez que se abre (el diálogo permanece montado).
  useEffect(() => {
    if (open) {
      setForm({ email: "", password: "", nombre: "", apellido: "", role: "user" })
      setError("")
    }
  }, [open])

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.email.trim() || !form.password.trim()) return
    if (form.password.length < 6) { setError("La contrasena debe tener al menos 6 caracteres"); return }
    setSaving(true); setError("")
    try {
      const created = await api.admin.createUser({
        email: form.email.trim(),
        password: form.password,
        nombre: form.nombre.trim() || undefined,
        apellido: form.apellido.trim() || undefined,
        role: form.role,
      })
      toast.success("Usuario creado")
      onCreated(created)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "No se pudo crear el usuario"
      setError(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !saving) onClose() }}>
      <DialogContent className="sm:max-w-[460px] bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Shield className="w-5 h-5 text-gold" />
            Nuevo usuario
          </DialogTitle>
          <DialogDescription>Completa los datos del nuevo usuario.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">{error}</div>}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Nombre</label>
              <Input autoFocus value={form.nombre} onChange={(e) => set("nombre", e.target.value)} placeholder="Juan" className="h-10 rounded-xl bg-input border-border focus-visible:border-gold/40 focus-visible:ring-gold/15" />
            </div>
            <div className="space-y-1.5">
              <label className="block text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Apellido</label>
              <Input value={form.apellido} onChange={(e) => set("apellido", e.target.value)} placeholder="Perez" className="h-10 rounded-xl bg-input border-border focus-visible:border-gold/40 focus-visible:ring-gold/15" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Email <span className="text-red-400">*</span></label>
            <Input type="email" required value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="usuario@etiplast.com" className="h-10 rounded-xl bg-input border-border focus-visible:border-gold/40 focus-visible:ring-gold/15" />
          </div>

          <div className="space-y-1.5">
            <label className="block text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Contrasena <span className="text-red-400">*</span></label>
            <Input type="password" required minLength={6} value={form.password} onChange={(e) => set("password", e.target.value)} placeholder="Minimo 6 caracteres" className="h-10 rounded-xl bg-input border-border focus-visible:border-gold/40 focus-visible:ring-gold/15" />
          </div>

          <div className="space-y-1.5">
            <label className="block text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Rol</label>
            <Select value={form.role} onChange={(e) => set("role", e.target.value)} className="h-10 text-sm">
              <option value="user">Usuario</option>
              <option value="operario">Operario</option>
              <option value="admin">Administrador</option>
            </Select>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving} className="rounded-xl border-border">Cancelar</Button>
            <Button type="submit" disabled={saving || !form.email.trim() || !form.password.trim()} className="rounded-xl bg-gold/10 hover:bg-gold/20 text-gold border border-gold/25 gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Crear usuario
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Dialog editar usuario
// ─────────────────────────────────────────────────────────────────────────────

function EditarUsuarioDialog({ user, onClose, onUpdated }: {
  user: UserAdmin
  onClose: () => void
  onUpdated: (user: UserAdmin) => void
}) {
  const [form, setForm] = useState({ nombre: user.nombre || "", apellido: user.apellido || "" })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true); setError("")
    try {
      const updated = await api.admin.updateUser(user.id, {
        nombre: form.nombre.trim() || undefined,
        apellido: form.apellido.trim() || undefined,
      })
      toast.success("Usuario actualizado")
      onUpdated(updated)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "No se pudo actualizar el usuario"
      setError(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v && !saving) onClose() }}>
      <DialogContent className="sm:max-w-[420px] bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Pencil className="w-4 h-4 text-gold" />
            Editar usuario
          </DialogTitle>
          <DialogDescription>{user.email}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">{error}</div>}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Nombre</label>
              <Input autoFocus value={form.nombre} onChange={(e) => set("nombre", e.target.value)} placeholder="Juan" className="h-10 rounded-xl bg-input border-border focus-visible:border-gold/40 focus-visible:ring-gold/15" />
            </div>
            <div className="space-y-1.5">
              <label className="block text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Apellido</label>
              <Input value={form.apellido} onChange={(e) => set("apellido", e.target.value)} placeholder="Perez" className="h-10 rounded-xl bg-input border-border focus-visible:border-gold/40 focus-visible:ring-gold/15" />
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving} className="rounded-xl border-border">Cancelar</Button>
            <Button type="submit" disabled={saving} className="rounded-xl bg-gold/10 hover:bg-gold/20 text-gold border border-gold/25 gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
