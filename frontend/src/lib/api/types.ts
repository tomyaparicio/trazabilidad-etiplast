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

export type UserAdmin = {
  id: number
  email: string
  is_active: boolean
  role: string
}

export type CreateUserRequest = {
  email: string
  password: string
  role?: string
}

export type UpdateUserRequest = {
  role?: string
  is_active?: boolean
}
