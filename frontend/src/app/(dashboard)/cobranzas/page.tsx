import { CobranzasView } from "./_components/cobranzas-view"

/**
 * Cobranzas — la plata que entra. Sin SSR: los datos se piden del lado del
 * cliente para que un arranque frío de Railway no deje la pantalla colgada.
 * Visible según RBAC (vista `cobranzas`).
 */
export default function CobranzasPage() {
  return <CobranzasView />
}
