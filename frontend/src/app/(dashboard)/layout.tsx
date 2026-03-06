import { getServerUser } from "@/lib/api/server"
import { DashboardShell } from "@/components/dashboard-shell"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getServerUser()

  return (
    <DashboardShell userEmail={user?.email} userName={user?.full_name ?? undefined}>
      {children}
    </DashboardShell>
  )
}
