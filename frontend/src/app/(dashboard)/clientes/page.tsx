import { apiFetchServer } from "@/lib/api/server"
import type { Filtros, Cliente } from "@/types/database"
import { ClientesTable } from "./_components/clientes-table"

export default async function ClientesPage() {
  const [filtrosResult, clientesResult] = await Promise.all([
    apiFetchServer<Filtros>("/api/filtros"),
    apiFetchServer<{ data: Cliente[]; total: number }>("/api/clientes?page=1&per_page=20"),
  ])

  return (
    <ClientesTable
      initialClientes={clientesResult.data ?? []}
      initialTotal={clientesResult.total ?? 0}
      filtros={filtrosResult ?? { rubros: [], provincias: [] }}
    />
  )
}
