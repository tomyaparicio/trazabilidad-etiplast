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
  let userRole: string | undefined

  try {
    if (token) {
      // Decodimos el JWT localmente — sin llamada al backend en cada carga
      const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString())
      userEmail = payload.sub
      userRole  = payload.role
    }
  } catch { /* ignorar si el token es inválido */ }

  return (
    <DashboardShell userEmail={userEmail} userRole={userRole}>
      <main className="flex-1 overflow-auto min-w-0">{children}</main>
    </DashboardShell>
  )
}
