import { createClient } from "@/lib/supabase/server"
import type { Filtros, Cliente } from "@/types/database"
import { ClientesTable } from "./_components/clientes-table"

export default async function ClientesPage() {
  const supabase = await createClient()

  const [filtrosResult, clientesResult] = await Promise.all([
    supabase.rpc("get_filtros"),
    supabase
      .from("clientes")
      .select("*", { count: "exact" })
      .order("numero_cliente")
      .range(0, 19),
  ])

  return (
    <ClientesTable
      initialClientes={(clientesResult.data as Cliente[]) ?? []}
      initialTotal={clientesResult.count ?? 0}
      filtros={(filtrosResult.data as Filtros) ?? { rubros: [], provincias: [] }}
    />
  )
}
