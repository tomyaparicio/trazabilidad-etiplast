import type { Metadata } from "next"
import Script from "next/script"
import { DM_Sans, Questrial, Poppins, Jost } from "next/font/google"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { RecargaPorActualizacion } from "@/components/recarga-por-actualizacion"

// Body: DM Sans. Wordmark/marca: Jost (geométrica ≈ Century Gothic, CON pesos → puede ir gorda).
// UI display (títulos, números): Poppins. Questrial queda de fallback. (No next/font/local — rompe Turbopack.)
const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
})

const questrial = Questrial({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-questrial",
  display: "swap",
})

const display = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-display",
  display: "swap",
})

const brand = Jost({
  subsets: ["latin"],
  variable: "--font-brand",
  display: "swap",
})

export const metadata: Metadata = {
  title: "Etiplast ERP",
  description: "Sistema de gestión empresarial para la industria del packaging",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" className={`${dmSans.variable} ${questrial.variable} ${display.variable} ${brand.variable}`} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem("etiplast-theme");document.documentElement.setAttribute("data-theme",t==="light"?"light":"dark")})();`,
          }}
        />
        {/* Escucha los fallos de carga de archivos del sistema (típicos cuando
            se sube una versión nueva con el ERP abierto) y recarga una vez. */}
        <RecargaPorActualizacion />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
