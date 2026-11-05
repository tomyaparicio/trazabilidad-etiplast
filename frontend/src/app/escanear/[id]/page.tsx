/**
 * Pantalla del escaneo — lo que se abre al leer el QR de la ficha.
 *
 * Fuera del grupo `(dashboard)` a propósito: se usa en un celular parado al
 * lado de una máquina, no hace falta la barra lateral ni el resto del ERP.
 * El middleware igual la protege, así que el operario tiene que estar logueado
 * — que es justamente cómo el sistema sabe quién hizo el trabajo.
 */
import type { EtapaProduccion } from "@/lib/api/types"
import { EscanearCliente } from "./_components/escanear-cliente"

const ETAPAS: EtapaProduccion[] = ["extrusion", "impresion", "troquelado"]

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ etapa?: string }>
}

export default async function EscanearPage({ params, searchParams }: Props) {
  const { id } = await params
  const { etapa } = await searchParams

  // La etapa viene en el QR (hay uno por sección de la ficha). Si alguien entra
  // a mano o con un QR viejo, la pantalla la pregunta.
  const etapaInicial = ETAPAS.includes(etapa as EtapaProduccion)
    ? (etapa as EtapaProduccion)
    : null

  return <EscanearCliente ordenId={Number(id)} etapaInicial={etapaInicial} />
}
