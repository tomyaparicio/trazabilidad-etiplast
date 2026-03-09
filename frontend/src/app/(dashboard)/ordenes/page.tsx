import { OrdenesTable } from "./_components/ordenes-table"

// Página sin fetch SSR — los datos se cargan desde el cliente
export default function OrdenesPage() {
  return <OrdenesTable initialOrdenes={[]} initialTotal={0} />
}
