"use client"

import { useEffect, useState } from "react"
import { Toaster } from "sonner"
import { Header } from "@/components/header"
import { Sidebar } from "@/components/sidebar"
import { VoiceAgent } from "@/components/voice-agent"
import { AiAssistant } from "@/components/ai-assistant"
import { CommandPalette } from "@/components/command-palette"
import { AppDock } from "@/components/app-dock"
import { useTheme } from "@/components/theme-provider"

interface DashboardShellProps {
  userEmail?: string
  userName?: string
  userRole?: string
  children: React.ReactNode
}

export function DashboardShell({ userEmail, userName, userRole, children }: DashboardShellProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  // Colapsar el sidebar en desktop (recordado entre navegaciones/recargas).
  const [collapsed, setCollapsed] = useState(false)
  const themeCtx = useTheme()
  const isAdmin = userRole === "admin"

  useEffect(() => {
    if (localStorage.getItem("eti:sidebar-collapsed") === "1") setCollapsed(true)
  }, [])
  useEffect(() => {
    localStorage.setItem("eti:sidebar-collapsed", collapsed ? "1" : "0")
  }, [collapsed])

  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar
        userEmail={userEmail}
        userName={userName}
        userRole={userRole}
        menuOpen={menuOpen}
        onMenuOpenChange={setMenuOpen}
        collapsed={collapsed}
        visible
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header
          userName={userName}
          userEmail={userEmail}
          onMenuClick={() => setMenuOpen(true)}
          onToggleSidebar={() => setCollapsed((v) => !v)}
          sidebarCollapsed={collapsed}
        />
        <AppDock onMoreClick={() => setMenuOpen(true)} />
        {children}
      </div>

      <VoiceAgent />
      <AiAssistant />
      <CommandPalette isAdmin={isAdmin} />
      <Toaster
        richColors
        position="top-right"
        theme={themeCtx?.theme ?? "light"}
        toastOptions={{
          style: {
            borderRadius: "0.75rem",
            fontFamily: "var(--font-dm-sans), sans-serif",
          },
        }}
      />
    </div>
  )
}
