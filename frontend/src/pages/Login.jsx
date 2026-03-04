import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const { signIn } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signIn(email, password)
      navigate('/')
    } catch (err) {
      setError(err.message === 'Invalid login credentials'
        ? 'Email o contraseña incorrectos. Verifica tus credenciales e intenta de nuevo.'
        : err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex bg-[var(--bg-sidebar)]">
      <div className="hidden lg:flex lg:w-[45%] relative overflow-hidden items-center justify-center bg-neutral-950">
        <div className="absolute inset-0 opacity-30" aria-hidden>
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-[120px]"></div>
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-indigo-500/20 rounded-full blur-[100px]"></div>
        </div>
        <div className="relative z-10 text-center px-16">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/5 border border-white/10 mb-10" aria-hidden>
            <span className="text-2xl font-bold text-white">E</span>
          </div>
          <h1 className="text-4xl font-bold text-white tracking-tight mb-3" style={{ textWrap: 'balance' }}>ETIPLAST</h1>
          <p className="text-neutral-400 text-sm max-w-[280px] mx-auto leading-relaxed">
            Sistema de gestión empresarial para la industria del packaging
          </p>
        </div>
      </div>

      <div id="main-content" className="flex-1 flex items-center justify-center p-8 bg-[var(--bg-app)]" tabIndex={-1}>
        <div className="w-full max-w-[380px]">
          <div className="lg:hidden text-center mb-12">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-neutral-900 mb-4" aria-hidden>
              <span className="text-xl font-bold text-white">E</span>
            </div>
            <h1 className="text-xl font-semibold text-[var(--text-primary)]">ETIPLAST</h1>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-semibold text-[var(--text-primary)] mb-1" style={{ textWrap: 'balance' }}>Bienvenido</h2>
            <p className="text-[var(--text-secondary)] text-sm">Ingresa tus credenciales para acceder</p>
          </div>

          {error && (
            <div
              className="mb-6 flex items-center gap-3 p-3.5 bg-red-50 border border-red-100 text-red-600 rounded-xl text-sm"
              role="alert"
              aria-live="polite"
            >
              <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <div>
              <label htmlFor="login-email" className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
                Email
              </label>
              <input
                id="login-email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                spellCheck={false}
                className="w-full px-4 py-3 bg-white border border-[var(--border-muted)] rounded-xl text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:border-[var(--accent)] transition-[box-shadow,border-color] text-sm"
                placeholder="ej: usuario@empresa.com…"
              />
            </div>

            <div>
              <label htmlFor="login-password" className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-4 py-3 pr-12 bg-white border border-[var(--border-muted)] rounded-xl text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:border-[var(--accent)] transition-[box-shadow,border-color] text-sm"
                  placeholder="Tu contraseña…"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors p-1 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:rounded"
                >
                  {showPassword ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-[var(--accent)] text-white rounded-xl font-medium hover:bg-[var(--accent-hover)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
            >
              {loading ? (
                <>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24" aria-hidden><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                  Ingresando…
                </>
              ) : 'Ingresar'}
            </button>
          </form>

          <p className="text-center text-[var(--text-muted)] text-xs mt-10">
            Etiplast ERP · Sistema de gestión empresarial
          </p>
        </div>
      </div>
    </div>
  )
}
