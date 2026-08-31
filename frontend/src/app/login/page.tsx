"use client"

import { useState, useEffect, Suspense } from "react"
import { api } from "@/lib/api"
import { useRouter, useSearchParams } from "next/navigation"
import Image from "next/image"
import { Eye, EyeOff, Loader2, AlertCircle, Mail, Lock, ArrowRight } from "lucide-react"

/**
 * Login — diseño aprobado "split de marca":
 * izquierda azul pleno con wordmark, titular editorial gigante, datos reales y
 * la cinta de etiquetas en movimiento (lo que produce la planta); derecha el
 * formulario en navy con inputs de 60px pensados para usuarios mayores.
 * Animaciones (.login-tape / .login-swirl) viven en globals.css.
 */

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
    "w-full h-[60px] rounded-[15px] border-[1.5px] border-border bg-input pl-12 pr-4 text-[18px] font-semibold text-foreground placeholder:font-normal placeholder:text-muted-foreground outline-none transition-all focus:border-gold focus:ring-4 focus:ring-gold/15"

  return (
    <div className="w-full max-w-[430px]">
      <h1 className="font-brand text-[36px] leading-tight tracking-tight text-foreground">
        Buen día
      </h1>
      <p className="mt-2 text-[17px] text-muted-foreground">Entrá con tu cuenta para abrir el sistema.</p>

      {sessionExpired && (
        <div className="mt-7 flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/10 p-4 text-[14.5px] leading-snug text-amber-200" role="alert">
          <AlertCircle className="mt-0.5 h-[18px] w-[18px] shrink-0" />
          <span>Tu sesión expiró. Ingresá de nuevo para continuar.</span>
        </div>
      )}

      {error && (
        <div className="mt-7 flex items-start gap-3 rounded-xl border border-red-500/25 bg-red-500/10 p-4 text-[14.5px] leading-snug text-red-200" role="alert">
          <AlertCircle className="mt-0.5 h-[18px] w-[18px] shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-8 space-y-6" noValidate>
        <div>
          <label htmlFor="login-email" className="mb-2.5 block text-[13.5px] font-extrabold uppercase tracking-[0.05em] text-muted-foreground">Email</label>
          <div className="relative">
            <Mail className="absolute left-[17px] top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <input
              id="login-email" name="email" type="email" autoComplete="email" required spellCheck={false}
              value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@etiplast.com" className={fieldCls}
            />
          </div>
        </div>

        <div>
          <label htmlFor="login-password" className="mb-2.5 block text-[13.5px] font-extrabold uppercase tracking-[0.05em] text-muted-foreground">Contraseña</label>
          <div className="relative">
            <Lock className="absolute left-[17px] top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <input
              id="login-password" name="password" type={showPassword ? "text" : "password"}
              autoComplete="current-password" required
              value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••" className={`${fieldCls} pr-14`}
            />
            <button
              type="button" onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              className="absolute right-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-[10px] text-muted-foreground transition-colors hover:text-foreground"
            >
              {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
        </div>

        <label className="flex w-fit cursor-pointer items-center gap-2.5 text-[15px] font-semibold text-muted-foreground">
          <input type="checkbox" defaultChecked className="h-[20px] w-[20px] rounded-[6px] border-[1.5px] border-border accent-gold" />
          Recordarme
        </label>

        <button
          type="submit" disabled={loading}
          className="flex h-[60px] w-full items-center justify-center gap-2.5 rounded-[15px] bg-gold text-[19px] font-extrabold text-gold-foreground shadow-[0_18px_34px_-16px_rgba(245,235,74,0.45)] transition hover:-translate-y-px hover:brightness-95 disabled:pointer-events-none disabled:opacity-60"
        >
          {loading ? (
            <><Loader2 className="h-5 w-5 animate-spin" />Ingresando…</>
          ) : (
            <>Entrar al sistema<ArrowRight className="h-5 w-5" strokeWidth={2.6} /></>
          )}
        </button>
      </form>

      <p className="mt-8 text-center text-[13.5px] text-muted-foreground/70">
        Etiplast ERP · © {new Date().getFullYear()} · Todos los derechos reservados
      </p>
    </div>
  )
}

// ── Página — split: marca (azul pleno) + formulario (navy) ───────────────────
export default function LoginPage() {
  return (
    <div className="grid min-h-screen grid-cols-1 bg-background text-foreground lg:grid-cols-[1.15fr_1fr]">

      {/* ══ Izquierda: la marca trabajando ══ */}
      {/* Azul de la empresa PLANO (#292d96) — igual que el hero de etiplastargentina.com (bg-primary-500). */}
      <section className="bg-brand relative flex flex-col justify-between overflow-hidden px-7 pt-8 text-white sm:px-12 sm:pt-11">
        {/* Swirl gigante girando imperceptible */}
        <Image
          src="/logoSOLO.png" alt="" aria-hidden width={560} height={560} priority
          className="login-swirl pointer-events-none select-none absolute -bottom-40 -right-40 w-[560px] max-w-none object-contain opacity-10 brightness-0 invert"
        />

        {/* Wordmark */}
        <div className="relative flex items-center gap-3.5">
          <Image src="/logoSOLO.png" alt="Etiplast" width={44} height={44} className="h-11 w-11 shrink-0 object-contain" />
          <span className="font-brand text-[30px] lowercase leading-none tracking-tight text-etiplast-500">
            etiplast
          </span>
        </div>

        {/* Titular editorial + datos reales */}
        <div className="relative my-8 lg:my-10">
          {/* Mismo tamaño que el hero de etiplastargentina.com (text-5xl→8xl, leading 0.92) */}
          <h2 className="font-brand text-5xl font-bold leading-[0.92] tracking-tight sm:text-7xl lg:text-8xl">
            La planta,<br />en <span className="text-etiplast-500">una sola</span><br />pantalla.
          </h2>
          <p className="mt-6 hidden max-w-[46ch] text-[18.5px] leading-relaxed text-white/75 lg:block">
            Clientes, presentaciones, órdenes de trabajo y stock — todo el circuito de Etiplast, ordenado y al alcance de un click.
          </p>
          <div className="mt-9 hidden gap-10 lg:flex">
            <div>
              <div className="font-brand text-[32px] leading-none tracking-tight">Desde <span className="text-etiplast-500">2008</span></div>
              <div className="mt-1.5 text-[12.5px] font-bold uppercase tracking-[0.14em] text-white/55">Fabricando en Córdoba</div>
            </div>
            <div>
              <div className="font-brand text-[32px] leading-none tracking-tight">8 <span className="text-etiplast-500">colores</span></div>
              <div className="mt-1.5 text-[12.5px] font-bold uppercase tracking-[0.14em] text-white/55">Impresión fotográfica</div>
            </div>
          </div>
        </div>

        <div className="pb-10" />
      </section>

      {/* ══ Derecha: formulario ══ */}
      <section className="flex items-center justify-center px-6 py-12 sm:px-10">
        <Suspense fallback={<div className="h-[520px] w-full max-w-[430px] animate-pulse rounded-3xl bg-white/5" />}>
          <LoginForm />
        </Suspense>
      </section>
    </div>
  )
}
