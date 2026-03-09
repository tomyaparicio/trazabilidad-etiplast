/**
 * Tipos para la API.
 */

export type { Cliente, ClienteProducto, DashboardStats, Filtros, RazonSocial } from "@/types/database"

export type ClientesListResponse = {
  data: unknown[]
  total: number
  page: number
  per_page: number
  total_pages: number
}

export type ClientesListParams = {
  page?: number
  per_page?: number
  search?: string
  rubro?: string
  provincia?: string
  sort_by?: string
  sort_dir?: "asc" | "desc"
}

export type UserAdmin = {
  id: number
  email: string
  nombre: string | null
  apellido: string | null
  nombre_completo: string
  is_active: boolean
  role: string
}

export type CreateUserRequest = {
  email: string
  password: string
  nombre?: string
  apellido?: string
  role?: string
}

export type UpdateUserRequest = {
  nombre?: string
  apellido?: string
  role?: string
  is_active?: boolean
}

// ─── Órdenes de Trabajo ────────────────────────────────────────────────────

export type EstadoOrden = "borrador" | "pendiente" | "en_proceso" | "completada" | "cancelada"

export type Bobina = {
  id?: number
  orden_id?: number
  metros: number | null
  kg_bob: number | null
}

export type OrdenTrabajo = {
  id: number
  numero: string
  cliente_id: number
  cliente_nombre: string | null
  cliente_producto_id: number | null
  fecha: string | null
  estado: EstadoOrden
  created_by: number | null

  extrusion_ancho: number | null
  extrusion_color: string | null
  extrusion_trat: string | null
  extrusion_espesor: number | null
  extrusion_cant_bob: number | null
  extrusion_formulacion: string | null
  bobinas: Bobina[]

  impresion_frente: string | null
  impresion_retroverso: string | null
  impresion_observaciones: string | null
  impresion_cilindro: number | null
  impresion_colores: string[]

  troquelado_ancho: number | null
  troquelado_alto: number | null
  troquelado_envase: string | null

  cantidad: number | null
  total_final: number | null
  observaciones: string | null
  created_at: string | null
  updated_at: string | null
}

export type OrdenesListResponse = {
  data: OrdenTrabajo[]
  total: number
  page: number
  per_page: number
  total_pages: number
}

export type OrdenesListParams = {
  page?: number
  per_page?: number
  estado?: string
  cliente_id?: number
  search?: string
}

export type CreateOrdenRequest = Partial<OrdenTrabajo> & {
  cliente_id: number
  bobinas?: Bobina[]
  impresion_colores?: string[]
}
