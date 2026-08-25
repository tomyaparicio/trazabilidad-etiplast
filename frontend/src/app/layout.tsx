import type { Metadata } from "next"
import Script from "next/script"
import { DM_Sans, Questrial } from "next/font/google"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"

// Body: DM Sans. Display: Century Gothic (@font-face en globals.css) con Questrial de fallback.
// (No usar next/font/local — rompe el server de Turbopack.)
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
    <html lang="es" className={`${dmSans.variable} ${questrial.variable}`} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem("etiplast-theme");document.documentElement.setAttribute("data-theme",t==="dark"?"dark":"light")})();`,
          }}
        />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
