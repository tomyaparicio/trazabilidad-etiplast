/**
 * API centralizada - punto único de entrada para todas las llamadas al backend.
 *
 * Uso en Client Components:
 *   import { api, get, post } from "@/lib/api"
 *
 * Uso en Server Components:
 *   import { apiFetchServer } from "@/lib/api/server"
 *
 * Acciones: api.clientes.*, api.dashboard.stats(), api.dashboard.filtros()
 * Helpers: get<T>("/api/ruta"), post<T>("/api/ruta", body)
 * Auth: api.auth.login(), api.auth.logout()
 */

export {
  api,
  apiFetch,
  get,
  post,
  put,
  del,
} from "./client"

export type {
  Cliente,
  ClientesListParams,
  ClientesListResponse,
  DashboardStats,
  Filtros,
} from "./types"
