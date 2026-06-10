"use client"

import { useState, useEffect } from "react"
import { Header } from "@/components/header"
import { Sidebar } from "@/components/sidebar"
import { VoiceAgent } from "@/components/voice-agent"
import { AiAssistant } from "@/components/ai-assistant"

const SIDEBAR_STORAGE_KEY = "etiplast-sidebar-open"

interface DashboardShellProps {
  userEmail?: string
  userName?: string
  userRole?: string
  children: React.ReactNode
}

export function DashboardShell({ userEmail, userName, userRole, children }: DashboardShellProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY)
    if (stored === "false") setSidebarOpen(false)
  }, [])

  const handleSidebarToggle = () => {
    setSidebarOpen((prev) => {
      const next = !prev
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next))
      return next
    })
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <Header
        onMenuClick={() => setMenuOpen(true)}
        sidebarOpen={sidebarOpen}
        onSidebarToggle={handleSidebarToggle}
      />
      <div className="flex flex-1 overflow-hidden min-h-0">
        <Sidebar
          userEmail={userEmail}
          userName={userName}
          userRole={userRole}
          menuOpen={menuOpen}
          onMenuOpenChange={(open) => setMenuOpen(open)}
          visible={sidebarOpen}
        />
        {children}
      </div>
      <VoiceAgent />
      <AiAssistant />
    </div>
  )
}
