import type { Metadata } from "next"
import Script from "next/script"
import { Plus_Jakarta_Sans } from "next/font/google"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta",
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
    <html lang="es" className={plusJakarta.variable} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem("etiplast-theme");document.documentElement.setAttribute("data-theme",t==="light"?"light":"dark")})();`,
          }}
        />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
