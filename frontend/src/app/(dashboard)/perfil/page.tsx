"use client"

import { useState, useEffect } from "react"
import { getUserEmail } from "@/lib/auth"

export default function PerfilPage() {
  const [email, setEmail] = useState("")

  useEffect(() => {
    setEmail(getUserEmail() || "")
  }, [])

  return (
    <div className="p-6 lg:p-8 space-y-5 max-w-[600px] mx-auto">
      <div className="flex items-center gap-3">
        <div className="w-1 h-6 rounded-full bg-gold" />
        <div>
          <h2 className="text-xl font-semibold text-foreground">Mi perfil</h2>
          <p className="text-muted-foreground text-sm">Información de tu cuenta</p>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card/80 p-6 space-y-5">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-muted-foreground">
            Email
          </label>
          <p className="text-sm text-foreground">{email}</p>
        </div>
      </div>
    </div>
  )
}
