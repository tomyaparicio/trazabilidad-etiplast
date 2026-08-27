"use client"

import { useState, useEffect, useCallback } from "react"
import { api } from "@/lib/api"
import type { UserAdmin } from "@/lib/api/types"
import { User, Mail, Shield, CheckCircle, XCircle, Hash, TriangleAlert, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { PageContainer } from "@/components/ui/page-container"
import { PageHeader } from "@/components/ui/page-header"

const ROLE_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  admin: { label: "Administrador", color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
  user:  { label: "Usuario",       color: "text-blue-400",  bg: "bg-blue-500/10  border-blue-500/20"  },
}

function RoleBadge({ role }: { role: string }) {
  const s = ROLE_LABELS[role] ?? { label: role, color: "text-muted-foreground", bg: "bg-muted/50 border-border" }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${s.bg} ${s.color}`}>
      <Shield className="w-3 h-3" />
      {s.label}
    </span>
  )
}

function AvatarBlock({ user }: { user: UserAdmin }) {
  const initials = [user.nombre?.[0], user.apellido?.[0]]
    .filter(Boolean)
    .join("")
    .toUpperCase() || user.email[0].toUpperCase()

  return (
    <div className="flex items-center gap-4">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand to-[#3b37a0] flex items-center justify-center text-xl font-bold text-white shadow-lg shrink-0">
        {initials}
      </div>
      <div>
        <p className="text-lg font-semibold text-foreground">{user.nombre_completo}</p>
        <p className="text-sm text-muted-foreground">{user.email}</p>
      </div>
    </div>
  )
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3.5 border-b border-border last:border-0">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Icon className="w-4 h-4 shrink-0" />
        <span>{label}</span>
      </div>
      <div className="text-sm font-medium text-foreground">{value}</div>
    </div>
  )
}

export default function PerfilPage() {
  const [user, setUser] = useState<UserAdmin | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const loadProfile = useCallback(() => {
    setLoading(true)
    setError("")
    api.auth.me()
      .then(setUser)
      .catch(() => setError("No se pudo cargar la información del perfil."))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadProfile() }, [loadProfile])

  return (
    <PageContainer>

      {/* ── Header ── */}
      <PageHeader title="Mi perfil" subtitle="Información de tu cuenta" />

      <div className="max-w-[640px] space-y-6">
      {loading && (
        <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
          <div className="flex items-center gap-4">
            <Skeleton className="w-16 h-16 rounded-2xl shrink-0" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-52" />
            </div>
          </div>
          <div className="border-t border-border pt-4 space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
            ))}
          </div>
        </div>
      )}

      {error && !loading && (
        <div className="rounded-2xl border border-border bg-card px-6 py-12 flex flex-col items-center gap-3 text-center">
          <div className="rounded-2xl border border-destructive/20 bg-destructive/10 p-4 text-destructive">
            <TriangleAlert className="w-6 h-6" strokeWidth={1.5} />
          </div>
          <p className="text-sm font-medium text-foreground">{error}</p>
          <Button onClick={loadProfile} variant="outline" className="mt-1 gap-2">
            <RefreshCw className="w-3.5 h-3.5" />
            Reintentar
          </Button>
        </div>
      )}

      {user && !loading && (
        <>
          {/* ── Tarjeta principal ── */}
          <div className="rounded-2xl border border-border bg-card/80 p-6 space-y-5">
            <AvatarBlock user={user} />

            <div className="border-t border-border pt-4 space-y-0.5">
              <InfoRow
                icon={Hash}
                label="ID de usuario"
                value={<span className="font-mono text-muted-foreground">#{user.id}</span>}
              />
              <InfoRow
                icon={Mail}
                label="Email"
                value={user.email}
              />
              <InfoRow
                icon={User}
                label="Nombre"
                value={user.nombre_completo}
              />
              <InfoRow
                icon={Shield}
                label="Rol"
                value={<RoleBadge role={user.role} />}
              />
              <InfoRow
                icon={user.is_active ? CheckCircle : XCircle}
                label="Estado de la cuenta"
                value={
                  user.is_active
                    ? <span className="inline-flex items-center gap-1.5 text-emerald-400 text-xs font-semibold"><CheckCircle className="w-3.5 h-3.5" /> Activa</span>
                    : <span className="inline-flex items-center gap-1.5 text-red-400 text-xs font-semibold"><XCircle className="w-3.5 h-3.5" /> Inactiva</span>
                }
              />
            </div>
          </div>
        </>
      )}
      </div>
    </PageContainer>
  )
}
