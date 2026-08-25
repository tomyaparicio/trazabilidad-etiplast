import Link from "next/link"

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-6 p-8">
      <div className="text-center space-y-3">
        <p className="text-8xl font-bold text-gold/20 tabular-nums">404</p>
        <h2 className="text-2xl font-semibold text-foreground">Página no encontrada</h2>
        <p className="text-muted-foreground text-sm max-w-xs">
          La página que buscás no existe o fue movida.
        </p>
      </div>
      <Link
        href="/"
        className="inline-flex items-center gap-2 bg-brand hover:bg-brand-strong text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-colors"
      >
        Volver al inicio
      </Link>
    </div>
  )
}
