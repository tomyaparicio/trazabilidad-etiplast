import { ClientesView } from "./_components/clientes-view"

// Página fina: solo compone. Toda la lógica vive en useClientes + ClientesView
// (datos client-side para no bloquear por el cold-start de Railway).
export default function ClientesPage() {
  return <ClientesView />
}
