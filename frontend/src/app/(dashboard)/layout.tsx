import { cookies } from "next/headers"
import { DashboardShell } from "@/components/dashboard-shell"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const cookieStore = await cookies()
  const token = cookieStore.get("auth-token")?.value
  let userEmail: string | undefined
  try {
    if (token) {
      const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString())
      userEmail = payload.sub
    }
  } catch { /* ignore */ }

  return (
    <DashboardShell userEmail={userEmail}>
      {children}
    </DashboardShell>
  )
}
