"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2, CheckCircle2 } from "lucide-react"
import { api } from "@/lib/api/client"

export default function PerfilPage() {
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const loadUser = async () => {
      try {
        const user = await api.auth.me()
        if (user) {
          setFullName(user.full_name || "")
          setEmail(user.email || "")
        }
      } catch {
        /* ignore */
      } finally {
        setLoading(false)
      }
    }
    loadUser()
  }, [])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setSaved(false)
    try {
      await fetch("/api/backend/auth/me", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: fullName.trim() || null }),
      })
      setSaved(true)
      router.refresh()
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 lg:p-8 flex items-center justify-center min-h-[300px]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="p-6 lg:p-8 space-y-5 max-w-[600px] mx-auto">
      <div className="flex items-center gap-3">
        <div className="w-1 h-6 rounded-full bg-gold" />
        <div>
          <h2 className="text-xl font-semibold text-foreground">Mi perfil</h2>
          <p className="text-muted-foreground text-sm">Configurá tu nombre para que aparezca en el sistema</p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-5">
        <div className="rounded-2xl border border-border bg-card/80 p-6 space-y-5">
          <div className="space-y-2">
            <label htmlFor="full_name" className="block text-sm font-medium text-foreground">
              Nombre
            </label>
            <Input
              id="full_name"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Tu nombre o apodo"
              className="h-11 rounded-xl"
            />
            <p className="text-xs text-muted-foreground">
              Este nombre se mostrará en el menú lateral en lugar del email.
            </p>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-muted-foreground">
              Email
            </label>
            <p className="text-sm text-foreground">{email}</p>
            <p className="text-xs text-muted-foreground">
              El email no se puede cambiar desde aquí.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            type="submit"
            disabled={saving}
            className="bg-primary hover:bg-primary/90"
          >
            {saving ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-2" />Guardando…</>
            ) : saved ? (
              <><CheckCircle2 className="w-4 h-4 mr-2" />Guardado</>
            ) : (
              <>Guardar nombre</>
            )}
          </Button>
          {saved && (
            <span className="text-sm text-green-600 dark:text-green-400">
              Cambios guardados correctamente
            </span>
          )}
        </div>
      </form>
    </div>
  )
}
