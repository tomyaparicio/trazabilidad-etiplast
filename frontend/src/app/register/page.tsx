"use client"

import { useState } from "react"
import { api } from "@/lib/api"
import { useRouter } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Eye, EyeOff, Loader2, AlertCircle } from "lucide-react"

export default function RegisterPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [fullName, setFullName] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const res = await api.auth.register(email, password)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || data.detail || "Error al registrarse")
      }
      // Login automático después de registrar
      const loginRes = await api.auth.login(email, password)
      if (loginRes.ok) {
        router.push("/")
        router.refresh()
      } else {
        router.push("/login")
        router.refresh()
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-background">
      <div className="w-full max-w-[420px]">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <Image src="/logoSOLO.png" alt="Etiplast" width={64} height={64} className="mx-auto mb-4" />
          </Link>
          <h1 className="text-2xl font-bold text-foreground">
            eti<span className="text-gold">plast</span>
          </h1>
          <p className="text-muted-foreground text-sm mt-2">Crear cuenta</p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Nombre (opcional)</label>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Tu nombre"
                className="h-11 rounded-xl"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="usuario@etiplast.com"
                className="h-11 rounded-xl"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Contraseña</label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="Mínimo 6 caracteres"
                  className="h-11 rounded-xl pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" disabled={loading} className="w-full h-11">
              {loading ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Creando…</> : "Crear cuenta"}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-4">
            ¿Ya tenés cuenta?{" "}
            <Link href="/login" className="text-gold hover:underline">
              Iniciar sesión
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
