export interface ClienteProducto {
  id: number
  cliente_id: number
  nombre: string | null
  envase: string | null
  envase_codificado: string | null
  volumen_cantidad: number | null
  volumen_unidad: string | null
  lamina: string | null
  muestra: string | null
  alto: number | null
  cilindro: number | null
  cierre: number | null
}

export interface RazonSocial {
  id: number
  numero: number | null
  razon_social: string
  cuit: string | null
  created_at: string | null
}

export interface Cliente {
  id: number
  id_cliente: number | null
  marca: string | null
  rubro: string | null
  razon_social_id: number | null
  razon_social: string | null
  domicilio: string | null
  localidad: string | null
  provincia: string | null
  pais: string | null
  cuit: string | null
  telefono: string | null
  producto: string | null
  volumen_cantidad: number | null
  volumen_unidad: string | null
  lamina: string | null
  muestra: string | null
  alto: number | null
  cilindro: number | null
  cierre: number | null
  envase: string | null
  observaciones: string | null
  transporte: string | null
  transporte_domicilio: string | null
  transporte_localidad: string | null
  latitud: number | null
  longitud: number | null
  created_at: string | null
  productos: ClienteProducto[]
}

export interface OrdenResumen {
  id: number
  numero: string
  cliente_nombre: string | null
  estado: string
  fecha: string | null
  cantidad: number | null
  created_at: string | null
  creador_nombre: string | null
  responsable_nombre: string | null
}

export interface DashboardStats {
  total_clientes: number
  total_razones_sociales: number
  total_productos: number
  marcas_sin_rs: number
  marcas_con_productos: number
  rubros: Array<{ nombre: string; cantidad: number }>
  provincias: Array<{ nombre: string; cantidad: number }>
  // Órdenes de trabajo
  ordenes_activas: number
  ordenes_por_estado: Record<string, number>
  ordenes_recientes: OrdenResumen[]
}

export interface Filtros {
  rubros: string[]
  provincias: string[]
  envases: string[]
}

export interface Usuario {
  id: number
  email: string
  full_name: string | null
  is_active: boolean
}
