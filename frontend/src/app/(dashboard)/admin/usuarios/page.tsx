"use client"

import { useEffect, useState, useCallback } from "react"
import { api } from "@/lib/api"
import type { UserAdmin } from "@/lib/api/types"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Shield, Plus, UserCheck, UserX, ChevronDown, Loader2, Users, SearchX } from "lucide-react"

export default function AdminUsuariosPage() {
  const [users, setUsers] = useState<UserAdmin[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [nuevoOpen, setNuevoOpen] = useState(false)

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

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  const handleToggleActive = async (user: UserAdmin) => {
    try {
      const updated = await api.admin.updateUser(user.id, { is_active: !user.is_active })
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)))
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al actualizar usuario")
    }
  }

  const handleRoleChange = async (user: UserAdmin, newRole: string) => {
    try {
      const updated = await api.admin.updateUser(user.id, { role: newRole })
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)))
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al actualizar rol")
    }
  }

  const handleUserCreated = (newUser: UserAdmin) => {
    setUsers((prev) => [...prev, newUser])
    setNuevoOpen(false)
  }

  return (
    <div className="p-6 lg:p-8 space-y-5 max-w-[1000px] mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-1 h-6 rounded-full bg-gold" />
          <div>
            <h2 className="text-xl font-semibold text-foreground">Usuarios</h2>
            <p className="text-muted-foreground text-sm">{users.length} usuarios registrados</p>
          </div>
        </div>
        <Button
          onClick={() => setNuevoOpen(true)}
          className="h-10 px-4 rounded-xl bg-gold/10 hover:bg-gold/20 text-gold border border-gold/25 text-sm font-medium gap-2 shrink-0"
        >
          <Plus className="w-4 h-4" />
          Nuevo usuario
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-card/80 border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {["ID", "Email", "Rol", "Estado", "Acciones"].map((h) => (
                  <th
                    key={h}
                    scope="col"
                    className="text-left px-5 py-3.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/50 last:border-0">
                    <td className="px-5 py-4"><div className="h-3 w-8 rounded-full bg-muted animate-pulse" /></td>
                    <td className="px-5 py-4"><div className="h-3.5 w-40 rounded-full bg-muted animate-pulse" /></td>
                    <td className="px-5 py-4"><div className="h-6 w-16 rounded-lg bg-muted animate-pulse" /></td>
                    <td className="px-5 py-4"><div className="h-6 w-16 rounded-lg bg-muted animate-pulse" /></td>
                    <td className="px-5 py-4"><div className="h-8 w-24 rounded-lg bg-muted animate-pulse" /></td>
                  </tr>
                ))
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="rounded-2xl bg-muted/50 border border-border p-5">
                        <Users className="w-8 h-8 text-muted-foreground" strokeWidth={1.5} />
                      </div>
                      <p className="text-muted-foreground text-sm font-medium">Sin usuarios</p>
                    </div>
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors duration-150">
                    <td className="px-5 py-3.5 text-xs font-mono text-muted-foreground tabular-nums">{user.id}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center text-xs font-bold text-primary-foreground shrink-0 border border-border">
                          {user.email[0]?.toUpperCase() || "U"}
                        </div>
                        <span className="text-sm font-medium text-foreground">{user.email}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="relative inline-block">
                        <select
                          value={user.role}
                          onChange={(e) => handleRoleChange(user, e.target.value)}
                          className={`h-8 pl-3 pr-8 rounded-lg text-xs font-medium border appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-gold/20 transition-all ${
                            user.role === "admin"
                              ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                              : "bg-blue-500/10 text-blue-400 border-blue-500/20"
                          }`}
                        >
                          <option value="admin">Admin</option>
                          <option value="user">Usuario</option>
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      {user.is_active ? (
                        <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/15">
                          Activo
                        </Badge>
                      ) : (
                        <Badge className="bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/15">
                          Inactivo
                        </Badge>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleToggleActive(user)}
                        className={`h-8 rounded-lg text-xs gap-1.5 transition-all ${
                          user.is_active
                            ? "border-red-500/20 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                            : "border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300"
                        }`}
                      >
                        {user.is_active ? (
                          <>
                            <UserX className="w-3.5 h-3.5" />
                            Desactivar
                          </>
                        ) : (
                          <>
                            <UserCheck className="w-3.5 h-3.5" />
                            Activar
                          </>
                        )}
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dialog crear usuario */}
      <CrearUsuarioDialog
        open={nuevoOpen}
        onClose={() => setNuevoOpen(false)}
        onCreated={handleUserCreated}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Dialog para crear usuario
// ─────────────────────────────────────────────────────────────────────────────

function CrearUsuarioDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (user: UserAdmin) => void
}) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState("user")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password.trim()) return
    if (password.length < 6) {
      setError("La contrasena debe tener al menos 6 caracteres")
      return
    }
    setSaving(true)
    setError("")
    try {
      const created = await api.admin.createUser({ email: email.trim(), password, role })
      onCreated(created)
      setEmail("")
      setPassword("")
      setRole("user")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear usuario")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-[440px] bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Shield className="w-5 h-5 text-gold" />
            Nuevo usuario
          </DialogTitle>
          <DialogDescription>
            Crea un nuevo usuario para el sistema ERP.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
              {error}
            </div>
          )}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Email
            </label>
            <Input
              type="email"
              required
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@ejemplo.com"
              className="h-11 rounded-xl bg-input border-border text-foreground placeholder:text-muted-foreground focus-visible:border-gold/40 focus-visible:ring-gold/15"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Contrasena
            </label>
            <Input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimo 6 caracteres"
              className="h-11 rounded-xl bg-input border-border text-foreground placeholder:text-muted-foreground focus-visible:border-gold/40 focus-visible:ring-gold/15"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Rol
            </label>
            <div className="relative">
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="h-11 w-full pl-4 pr-10 bg-input border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-gold/40 focus:ring-2 focus:ring-gold/10 transition-all cursor-pointer appearance-none"
              >
                <option value="user">Usuario</option>
                <option value="admin">Administrador</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            </div>
          </div>
          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="rounded-xl border-border"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={saving || !email.trim() || !password.trim()}
              className="rounded-xl bg-gold/10 hover:bg-gold/20 text-gold border border-gold/25 gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Crear usuario
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
