"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Eye, EyeOff, Loader2, AlertCircle } from "lucide-react"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password })
      if (err) throw err
      router.push("/")
      router.refresh()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setError(
        message === "Invalid login credentials"
          ? "Email o contraseña incorrectos. Verifica tus credenciales e intenta de nuevo."
          : message
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex bg-[#08080f] relative overflow-hidden">
      {/* Ambient glows */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        <div className="absolute top-[-10%] left-[20%] w-[700px] h-[700px] bg-[#1a1866]/25 rounded-full blur-[160px]" />
        <div className="absolute bottom-[-10%] right-[10%] w-[600px] h-[600px] bg-[#f5eb4a]/6 rounded-full blur-[160px]" />
        <div className="absolute top-[40%] left-[45%] w-[400px] h-[400px] bg-[#292d96]/15 rounded-full blur-[120px]" />
      </div>

      {/* Left branding panel */}
      <div className="hidden lg:flex lg:w-[48%] relative items-center justify-center p-16">
        {/* Subtle grid */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)`,
            backgroundSize: "60px 60px",
          }}
        />
        <div className="relative z-10 flex flex-col items-center text-center">
          {/* Logo mark */}
          <div className="relative mb-14">
            <div className="w-32 h-32 rounded-[32px] bg-gradient-to-br from-[#100f3a] to-[#1a1866] border border-white/10 flex items-center justify-center shadow-[0_0_80px_rgba(30,27,75,0.6)] overflow-hidden">
              <Image
                src="/logoSOLO.png"
                alt="Etiplast logo"
                width={96}
                height={96}
                className="drop-shadow-2xl object-contain"
                priority
              />
            </div>
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-[#f5eb4a] rounded-full opacity-70 blur-[3px]" />
            <div className="absolute -bottom-1 -left-1 w-3 h-3 bg-[#6366f1] rounded-full opacity-50 blur-[3px]" />
          </div>

          <h1 className="text-6xl font-bold tracking-tight mb-3">
            <span className="text-white">eti</span>
            <span className="text-[#f5eb4a]">plast</span>
          </h1>
          <p className="text-[#6b6b8a] text-xs uppercase tracking-[0.3em] mb-10">
            Etiquetas y Envases
          </p>

          <div className="flex items-center gap-4 mb-10">
            <div className="flex-1 h-px bg-gradient-to-r from-transparent to-[#f5eb4a]/40" />
            <div className="w-1.5 h-1.5 rounded-full bg-[#f5eb4a]/60" />
            <div className="flex-1 h-px bg-gradient-to-l from-transparent to-[#f5eb4a]/40" />
          </div>

          <p className="text-[#6b6b8a] text-sm max-w-[280px] leading-relaxed">
            Sistema de gestión empresarial para la industria del packaging
          </p>

          {/* Stats */}
          <div className="mt-14 grid grid-cols-3 gap-8">
            {[
              { value: "100%", label: "Digital" },
              { value: "24/7", label: "Disponible" },
              { value: "AR", label: "Argentina" },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <p className="text-[#f5eb4a] text-xl font-bold">{s.value}</p>
                <p className="text-[#6b6b8a] text-xs mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-8 relative z-10">
        <div className="w-full max-w-[420px]">
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-10">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[#100f3a] to-[#1a1866] border border-white/10 mb-5 overflow-hidden">
              <Image src="/logoSOLO.png" alt="Etiplast" width={44} height={44} className="object-contain" />
            </div>
            <h1 className="text-2xl font-bold text-white">
              eti<span className="text-[#f5eb4a]">plast</span>
            </h1>
          </div>

          {/* Card */}
          <div className="bg-[#0d0d1a]/90 backdrop-blur-2xl border border-white/[0.07] rounded-2xl p-8 shadow-[0_0_60px_rgba(0,0,0,0.5)]">
            <div className="mb-8">
              <h2 className="text-[22px] font-semibold text-white mb-1.5">
                Bienvenido de vuelta
              </h2>
              <p className="text-[#6b6b8a] text-sm">
                Ingresá tus credenciales para continuar
              </p>
            </div>

            {error && (
              <div className="mb-6 flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-sm" role="alert">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              <div className="space-y-2">
                <label htmlFor="login-email" className="block text-sm font-medium text-[#a0a0b8]">
                  Email
                </label>
                <Input
                  id="login-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  spellCheck={false}
                  placeholder="usuario@etiplast.com"
                  className="h-12 rounded-xl bg-white/[0.04] border-white/[0.08] text-white placeholder:text-[#4a4a6a] focus-visible:border-[#f5eb4a]/40 focus-visible:ring-[#f5eb4a]/20 transition-colors"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="login-password" className="block text-sm font-medium text-[#a0a0b8]">
                  Contraseña
                </label>
                <div className="relative">
                  <Input
                    id="login-password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="h-12 rounded-xl pr-12 bg-white/[0.04] border-white/[0.08] text-white placeholder:text-[#4a4a6a] focus-visible:border-[#f5eb4a]/40 focus-visible:ring-[#f5eb4a]/20 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#4a4a6a] hover:text-[#a0a0b8] transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="pt-1">
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-12 rounded-xl font-medium text-sm transition-all duration-300
                    bg-gradient-to-r from-[#1a1866] to-[#292d96]
                    hover:from-[#292d96] hover:to-[#3832b0]
                    text-white border border-[#3832b0]/50
                    hover:border-[#f5eb4a]/30
                    shadow-[0_4px_20px_rgba(30,27,75,0.4)]
                    hover:shadow-[0_4px_30px_rgba(30,27,75,0.6)]
                    disabled:opacity-50"
                >
                  {loading ? (
                    <><Loader2 className="w-4 h-4 animate-spin mr-2" />Ingresando…</>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      Ingresar
                      <span className="text-[#f5eb4a]">→</span>
                    </span>
                  )}
                </Button>
              </div>
            </form>
          </div>

          <p className="text-center text-[#6b6b8a]/50 text-xs mt-7">
            Etiplast ERP · © {new Date().getFullYear()} Todos los derechos reservados
          </p>
        </div>
      </div>
    </div>
  )
}
