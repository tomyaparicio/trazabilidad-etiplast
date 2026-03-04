"use client"

import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { RefreshCw } from "lucide-react"

export function RefreshButton() {
  const router = useRouter()
  return (
    <Button variant="outline" size="sm" onClick={() => router.refresh()} className="bg-white/[0.04] border-white/[0.08] text-[#c8c8d8] hover:bg-white/[0.08] hover:text-white">
      <RefreshCw className="w-3.5 h-3.5 mr-2" />
      Reintentar
    </Button>
  )
}
