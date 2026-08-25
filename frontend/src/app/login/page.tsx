"use client"

import { useState, useEffect, Suspense } from "react"
import { api } from "@/lib/api"
import { useRouter, useSearchParams } from "next/navigation"
import Image from "next/image"
import { Eye, EyeOff, Loader2, AlertCircle, Mail, Lock, ArrowRight } from "lucide-react"
import { Questrial } from "next/font/google"

// Questrial (Google) como fallback geométrico; Century Gothic vía @font-face abajo
const questrial = Questrial({ subsets: ["latin"], weight: "400", variable: "--font-questrial", display: "swap" })
const DISPLAY = "'Century Gothic ET', var(--font-questrial), sans-serif"

// ── Formulario ────────────────────────────────────────────────────────────────
function LoginForm() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [sessionExpired, setSessionExpired] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (searchParams.get("session") === "expired") {
      setSessionExpired(true)
      router.replace("/login", { scroll: false })
    }
  }, [searchParams, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const res = await api.auth.login(email, password)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || data.detail || "Error al iniciar sesión")
      }
      router.push("/")
      router.refresh()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setError(
        message === "Credenciales incorrectas"
          ? "Email o contraseña incorrectos. Verificá tus credenciales e intentá de nuevo."
          : message
      )
    } finally {
      setLoading(false)
    }
  }

  const fieldCls =
    "w-full h-[52px] rounded-[13px] border-[1.5px] border-[#e7e8f2] bg-[#f4f5fa] pl-11 pr-4 text-[15px] text-[#141733] placeholder:text-[#aab0c0] outline-none transition-all focus:border-[#292d96] focus:bg-white focus:ring-4 focus:ring-[#292d96]/10"

  return (
    <div className="w-full max-w-[410px]">
      <div className="rounded-[24px] bg-white p-8 sm:p-10 shadow-[0_40px_80px_-30px_rgba(6,8,40,0.7)] ring-1 ring-white/10">
        {/* Mobile logo */}
        <div className="lg:hidden flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#20236f] to-[#0e1046] flex items-center justify-center overflow-hidden">
            <Image src="/logoSOLO.png" alt="Etiplast" width={30} height={30} className="object-contain" />
          </div>
          <span className="text-2xl font-bold text-[#141733]" style={{ fontFamily: DISPLAY }}>
            eti<span className="text-[#d9c400]">plast</span>
          </span>
        </div>

        <h1 className="text-[29px] font-semibold text-[#141733] tracking-tight" style={{ fontFamily: DISPLAY }}>
          Bienvenido de vuelta
        </h1>
        <p className="text-[#7a7e9c] mt-1.5 text-[14.5px]">Ingresá tus credenciales para continuar</p>

        {sessionExpired && (
          <div className="mt-6 flex items-start gap-3 p-3.5 rounded-xl bg-[#fff8e6] border border-[#f4e2a2] text-[#8a6a00] text-[13.5px] leading-snug" role="alert">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>Tu sesión expiró. Ingresá de nuevo para continuar.</span>
          </div>
        )}

        {error && (
          <div className="mt-6 flex items-start gap-3 p-3.5 rounded-xl bg-[#fbecec] border border-[#f3c9c9] text-[#b3261e] text-[13.5px] leading-snug" role="alert">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-5" noValidate>
          <div>
            <label htmlFor="login-email" className="block text-[13px] font-medium text-[#141733] mb-2">Email</label>
            <div className="relative">
              <Mail className="w-[18px] h-[18px] absolute left-[15px] top-1/2 -translate-y-1/2 text-[#7a7e9c]" />
              <input
                id="login-email" name="email" type="email" autoComplete="email" required spellCheck={false}
                value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@etiplast.com" className={fieldCls}
              />
            </div>
          </div>

          <div>
            <label htmlFor="login-password" className="block text-[13px] font-medium text-[#141733] mb-2">Contraseña</label>
            <div className="relative">
              <Lock className="w-[18px] h-[18px] absolute left-[15px] top-1/2 -translate-y-1/2 text-[#7a7e9c]" />
              <input
                id="login-password" name="password" type={showPassword ? "text" : "password"}
                autoComplete="current-password" required
                value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••" className={`${fieldCls} pr-11`}
              />
              <button
                type="button" onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#7a7e9c] hover:text-[#141733] transition-colors"
              >
                {showPassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between text-[13.5px] pt-0.5">
            <label className="flex items-center gap-2 text-[#7a7e9c] cursor-pointer">
              <input type="checkbox" className="w-[17px] h-[17px] rounded-[5px] border-[1.5px] border-[#e7e8f2] accent-[#292d96]" />
              Recordarme
            </label>
            <a href="#" className="text-[#292d96] font-semibold hover:underline">¿Olvidaste tu contraseña?</a>
          </div>

          <button
            type="submit" disabled={loading}
            className="w-full h-[54px] rounded-[13px] bg-[#292d96] hover:bg-[#1b1e75] text-white font-semibold text-[16px] tracking-[0.2px] flex items-center justify-center gap-2.5 shadow-[0_16px_30px_-14px_rgba(41,45,150,0.55)] transition-colors disabled:opacity-60"
            style={{ fontFamily: DISPLAY }}
          >
            {loading ? (
              <><Loader2 className="w-5 h-5 animate-spin" />Ingresando…</>
            ) : (
              <>Ingresar
                <span className="w-[22px] h-[22px] rounded-full bg-[#f5eb4a] text-[#101248] flex items-center justify-center">
                  <ArrowRight className="w-[13px] h-[13px]" />
                </span>
              </>
            )}
          </button>
        </form>
      </div>

      <p className="text-center text-white/50 text-[12.5px] mt-6">
        Etiplast ERP · © {new Date().getFullYear()} · Todos los derechos reservados
      </p>
    </div>
  )
}

// ── Página — fondo azul siempre (azul + blanco + amarillo) ────────────────────
export default function LoginPage() {
  return (
    <div className={`${questrial.variable} min-h-screen relative overflow-hidden text-white bg-[#292d96]`}>
      <style dangerouslySetInnerHTML={{ __html: `
@font-face{font-family:'Century Gothic ET';src:url('/fonts/century-gothic.woff2') format('woff2');font-weight:400;font-style:normal;font-display:swap}
@font-face{font-family:'Century Gothic ET';src:url('/fonts/century-gothic-bold.woff2') format('woff2');font-weight:700;font-style:normal;font-display:swap}
      `}} />
      {/* Logo de marca de agua */}
      <Image
        src="/logoSOLO.png"
        alt=""
        aria-hidden
        width={820}
        height={820}
        priority
        className="pointer-events-none select-none absolute top-1/2 -left-40 -translate-y-1/2 w-[560px] lg:w-[820px] max-w-none opacity-[0.06]"
      />

      <div className="relative z-10 min-h-screen grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] items-center gap-10 px-6 sm:px-[6vw] py-12">
        {/* Marca */}
        <section className="hidden lg:block max-w-[460px]">
          <h1 className="text-[56px] leading-none font-bold tracking-[-1px]" style={{ fontFamily: DISPLAY }}>
            eti<span className="text-[#f5eb4a]">plast</span>
          </h1>
          <p className="mt-2 text-[12px] tracking-[0.44em] uppercase text-[#aab0ee] font-medium">Etiquetas y envases</p>
          <p className="mt-9 text-[27px] leading-[1.35] text-[#eef0ff]" style={{ fontFamily: DISPLAY, fontWeight: 400 }}>
            El sistema que hace girar tu <span className="text-[#f5eb4a] font-semibold">producción</span>, de la orden al despacho.
          </p>
          <div className="mt-11 flex gap-10">
            <div>
              <div className="text-[28px] font-bold text-[#f5eb4a]" style={{ fontFamily: DISPLAY }}>Desde 2008</div>
              <div className="text-[13px] text-[#aab0ee] mt-0.5">Fabricando en Córdoba</div>
            </div>
            <div>
              <div className="text-[28px] font-bold text-[#f5eb4a]" style={{ fontFamily: DISPLAY }}>8 colores</div>
              <div className="text-[13px] text-[#aab0ee] mt-0.5">Impresión fotográfica</div>
            </div>
          </div>
        </section>

        {/* Formulario */}
        <section className="flex justify-center">
          <Suspense fallback={<div className="w-full max-w-[410px] h-[440px] animate-pulse rounded-[24px] bg-white/10" />}>
            <LoginForm />
          </Suspense>
        </section>
      </div>
    </div>
  )
}
