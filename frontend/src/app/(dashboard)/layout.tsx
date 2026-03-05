import { createClient } from "@/lib/supabase/server"
import { DashboardShell } from "@/components/dashboard-shell"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const fullName = (user?.user_metadata?.full_name as string) || undefined

  return (
    <DashboardShell userEmail={user?.email} userName={fullName}>
      {children}
    </DashboardShell>
  )
}
