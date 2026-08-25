"use client"

import { useEffect, useState } from "react"
import { Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useTheme } from "@/components/theme-provider"
import { cn } from "@/lib/utils"

const STORAGE_KEY = "etiplast-theme"

export function ThemeToggle({ className }: { className?: string }) {
  const ctx = useTheme()
  const [fallbackTheme, setFallbackTheme] = useState<"light" | "dark">("light")

  useEffect(() => {
    const t = localStorage.getItem(STORAGE_KEY) as "light" | "dark" | null
    if (t === "light" || t === "dark") setFallbackTheme(t)
  }, [])

  const theme = ctx?.theme ?? fallbackTheme
  const toggleTheme = ctx?.toggleTheme ?? (() => {
    const next = fallbackTheme === "dark" ? "light" : "dark"
    setFallbackTheme(next)
    document.documentElement.setAttribute("data-theme", next)
    localStorage.setItem(STORAGE_KEY, next)
  })

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      aria-label={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      className={cn("text-muted-foreground hover:text-foreground hover:bg-accent/50", className)}
    >
      {theme === "dark" ? (
        <Sun className="size-4" />
      ) : (
        <Moon className="size-4" />
      )}
    </Button>
  )
}
