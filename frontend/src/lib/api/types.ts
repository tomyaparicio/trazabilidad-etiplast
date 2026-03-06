/**
 * Tipos para la API.
 */

export type { Cliente, DashboardStats, Filtros } from "@/types/database"

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
}
