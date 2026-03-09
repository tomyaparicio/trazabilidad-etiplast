import { ClientesTable } from "./_components/clientes-table"

// Página sin fetch SSR — los datos se cargan desde el cliente
// para evitar que el cold-start del backend bloquee la carga de la página
export default function ClientesPage() {
  return (
    <ClientesTable
      initialClientes={[]}
      initialTotal={0}
      filtros={{ rubros: [], provincias: [] }}
    />
  )
}
