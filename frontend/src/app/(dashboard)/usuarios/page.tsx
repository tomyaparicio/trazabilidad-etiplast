import { apiFetchServer } from "@/lib/api/server"
import type { Usuario } from "@/types/database"
import { UsuariosTable } from "./_components/usuarios-table"

export default async function UsuariosPage() {
  const result = await apiFetchServer<{ data: Usuario[]; total: number }>(
    "/api/usuarios?page=1&per_page=20"
  )

  return (
    <UsuariosTable
      initialUsuarios={result.data ?? []}
      initialTotal={result.total ?? 0}
    />
  )
}
