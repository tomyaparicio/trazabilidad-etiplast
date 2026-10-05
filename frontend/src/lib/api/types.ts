/**
 * Tipos para la API.
 */

export type { Cliente, ClienteProducto, DashboardStats, DashboardFinanzas, Filtros, RazonSocial, Maquina } from "@/types/database"

/** Respuesta paginada genérica del backend */
export type Paginated<T> = {
  data: T[]
  total: number
  page: number
  per_page: number
  total_pages: number
}

import type { Cliente as _Cliente } from "@/types/database"

export type ClientesListResponse = {
  data: _Cliente[]
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
  /** Razón social exacta, o SIN_RAZON_SOCIAL para los clientes que no tienen. */
  razon_social?: string
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

// ─── Roles y permisos (RBAC) ─────────────────────────────────────────────────

/** Catálogo de lo POSIBLE: vistas del sidebar + módulos con sus acciones. */
export type RoleCatalogo = {
  vistas: { clave: string; nombre: string }[]
  modulos: { clave: string; nombre: string; acciones: string[] }[]
}

/** Un rol configurable (fila de la tabla `roles`). */
export type RolePermisos = {
  id: number
  clave: string
  nombre: string
  vistas: string[]
  acciones: string[]
  protegido: boolean
}

/** Permisos del usuario autenticado (para el gate del frontend). */
export type MisPermisos = {
  id?: number
  clave: string
  nombre: string
  vistas: string[]
  acciones: string[]
  protegido: boolean
}

export type RoleInput = {
  nombre: string
  vistas: string[]
  acciones: string[]
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
  cliente_numero: number | null
  cliente_producto_id: number | null
  fecha: string | null
  estado: EstadoOrden
  created_by: number | null
  creador_nombre: string | null
  responsable_id: number | null
  responsable_nombre: string | null
  operador: string | null

  // Extrusión
  extrusion_ancho: number | null
  extrusion_color: string | null
  extrusion_trat: string | null
  extrusion_espesor: number | null
  extrusion_cant_bob: number | null
  extrusion_formulacion: string | null
  extrusion_maquina: string | null
  extrusion_observaciones: string | null
  operador_extrusion: string | null
  /** Metros de film a extrudir: cantidad de etiquetas × alto (mm→m) + 400 de margen. */
  extrusion_metros: number | null
  bobinas: Bobina[]

  // Impresión
  impresion_frente: string | null
  impresion_retroverso: string | null
  impresion_observaciones: string | null
  impresion_cilindro: number | null
  impresion_colores: string[]
  operador_impresion: string | null
  /** Marca de impresora con la que se hace (paso 0 del alta): Venus, ReinaFlex, Autoadhesiva. */
  impresion_maquina: string | null

  // Troquelado
  troquelado_ancho: number | null
  troquelado_alto: number | null
  troquelado_envase: string | null
  troquelado_maquina: string | null
  troquelado_observaciones: string | null
  operador_troquelado: string | null

  // Control de calidad
  control_calidad: string | null

  // Fechas por etapa
  fecha_diseno: string | null
  fecha_preprensa: string | null
  fecha_extrusion: string | null
  fecha_impresion: string | null
  fecha_troquelado: string | null
  fecha_entrega: string | null

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

// ─── Presupuestos ──────────────────────────────────────────────────────────

export type EstadoPresupuesto = "borrador" | "enviado" | "aprobado" | "rechazado" | "vencido" | "convertido"

export type PresupuestoItem = {
  id: number
  cliente_producto_id: number | null
  descripcion: string | null
  cantidad: number | null
  unidad: string | null
  precio_unitario: number | null
  subtotal: number | null
}

export type Presupuesto = {
  id: number
  numero: string
  cliente_id: number | null
  cliente_marca?: string | null
  prospecto_nombre: string | null
  fecha: string | null
  validez_dias: number | null
  estado: EstadoPresupuesto
  moneda: string | null
  condiciones_pago: string | null
  subtotal: number | null
  descuento_porcentaje: number | null
  iva_porcentaje: number | null
  total: number | null
  observaciones: string | null
  orden_trabajo_id: number | null
  items: PresupuestoItem[]
}

// ─── Facturas ──────────────────────────────────────────────────────────────

export type EstadoFactura = "pendiente" | "cobrada" | "anulada"
export type TipoFactura = "A" | "B" | "C" | "X"

export type Factura = {
  id: number
  numero: string
  tipo: TipoFactura | string
  cliente_id: number | null
  cliente_nombre?: string | null
  orden_trabajo_id: number | null
  orden_numero?: string | null
  fecha: string | null
  fecha_vencimiento: string | null
  estado: EstadoFactura
  fecha_cobro: string | null
  subtotal: number | null
  iva_porcentaje: number | null
  total: number | null
  observaciones: string | null
  creador_nombre?: string | null
  created_at?: string | null
}

export type FacturasListResponse = {
  data: Factura[]
  total: number
  page: number
  per_page: number
  total_pages: number
  /** Totales del listado ya filtrado (para la cabecera de la pantalla). */
  monto_total: number
  monto_cobrado: number
}

// ─── Stock ─────────────────────────────────────────────────────────────────

export type TipoStockItem = "materia_prima" | "producto_terminado" | "insumo"

export type TipoStockMovimiento = "ingreso" | "egreso" | "ajuste"

export type StockItem = {
  id: number
  codigo: string
  nombre: string
  tipo: TipoStockItem
  categoria: string | null
  unidad: string | null
  stock_actual: number | null
  stock_minimo: number | null
  cliente_id: number | null
  cliente_producto_id: number | null
  activo: boolean
}

export type StockMovimiento = {
  id: number
  stock_item_id: number
  tipo: TipoStockMovimiento
  cantidad: number | null
  motivo: string | null
  stock_anterior: number | null
  stock_resultante: number | null
  orden_trabajo_id: number | null
  remito_id: number | null
  lote: string | null
  observaciones: string | null
  created_at: string | null
}

// ─── Remitos ───────────────────────────────────────────────────────────────

export type EstadoRemito = "pendiente" | "despachado" | "entregado" | "anulado"

export type RemitoItem = {
  id: number
  orden_trabajo_id: number | null
  orden_numero?: string | null
  descripcion: string | null
  cantidad: number | null
  unidad: string | null
  lote: string | null
}

export type Remito = {
  id: number
  numero: string
  cliente_id: number | null
  cliente_marca?: string | null
  fecha: string | null
  estado: EstadoRemito
  transporte: string | null
  domicilio_entrega: string | null
  observaciones: string | null
  items: RemitoItem[]
}

// ─── Control de calidad ────────────────────────────────────────────────────

export type ResultadoQc = "aprobado" | "rechazado" | "observado"

export type QcPlantillaItem = {
  id: number
  descripcion: string
  orden: number | null
}

export type QcPlantilla = {
  id: number
  etapa: string
  nombre: string
  activa: boolean
  items: QcPlantillaItem[]
}

export type QcRegistroItem = {
  id: number
  item_descripcion: string | null
  cumple: boolean | null
  valor: string | null
  observacion: string | null
}

export type QcRegistro = {
  id: number
  orden_trabajo_id: number
  etapa: string
  plantilla_id: number | null
  user_email?: string | null
  resultado: ResultadoQc
  observaciones: string | null
  created_at: string | null
  items: QcRegistroItem[]
}

// ─── Notificaciones ────────────────────────────────────────────────────────

export type Notificacion = {
  id: number
  tipo: string
  titulo: string
  mensaje: string | null
  link: string | null
  leida: boolean
  created_at: string | null
}

// ─── Auditoría ─────────────────────────────────────────────────────────────

export type AuditEntry = {
  id: number
  user_email: string | null
  accion: string
  entidad: string
  entidad_id: number | null
  descripcion: string | null
  created_at: string | null
}

// ─── Reportes y KPIs ─────────────────────────────────────────────────────────
// Fuente única de los tipos de respuesta de /api/reportes/*. Los charts y la
// página de reportes importan estos tipos desde acá (no los redefinen).

export type ReporteResumen = {
  total_ots: number
  completadas: number
  en_proceso: number
  /** Porcentaje de entregas a tiempo (0-100) o null si no es calculable. */
  pct_a_tiempo: number | null
  items_bajo_stock: number
}

/** Punto del chart de producción (agrupado por máquina/cliente/operador/mes). */
export type ProduccionPunto = {
  grupo: string
  ots: number
  cantidad: number
  kg: number
}
export type ReporteProduccion = { data: ProduccionPunto[] }

/** Tiempo promedio entre etapas de la OT. */
export type TiempoEtapa = {
  clave: string
  etapa: string
  dias_promedio: number | null
  muestras: number
}
export type ReporteTiempos = { disponible: boolean; etapas: TiempoEtapa[] }

/** Punto de la serie temporal de órdenes (mensual). */
export type OrdenesSeriePunto = {
  /** "YYYY-MM" */
  mes: string
  cantidad: number
}
export type ReporteOrdenesSeries = { data: OrdenesSeriePunto[] }

export type ClienteTop = {
  cliente_id: number
  marca: string
  ots: number
  cantidad: number
}
export type ReporteClientesTop = { data: ClienteTop[] }

export type ReporteStockResumen = {
  total_items: number
  bajo_minimo: number
  por_tipo?: Array<{ tipo: string; cantidad: number }>
}

// ─── Trazabilidad por lote ───────────────────────────────────────────────────
// La respuesta de /api/trazabilidad enriquece las entidades base con campos extra.

export type TrazabilidadBobina = Bobina & { numero_lote?: string | null }

export type TrazabilidadOrden = Omit<OrdenTrabajo, "bobinas"> & {
  lote?: string | null
  bobinas: TrazabilidadBobina[]
}

export type TrazabilidadRemito = Remito & { cliente_nombre?: string | null }

export type TrazabilidadMovimiento = StockMovimiento & {
  stock_item_nombre?: string | null
  stock_item_codigo?: string | null
  usuario_nombre?: string | null
}

export type Trazabilidad = {
  lote: string
  ordenes: TrazabilidadOrden[]
  remitos: TrazabilidadRemito[]
  movimientos_stock: TrazabilidadMovimiento[]
}
