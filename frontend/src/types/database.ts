export interface Cliente {
  id: number
  id_cliente: number | null
  marca: string | null
  rubro: string | null
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
  created_at: string | null
}

export interface DashboardStats {
  total_clientes: number
  rubros: Array<{ nombre: string; cantidad: number }>
  provincias: Array<{ nombre: string; cantidad: number }>
}

export interface Filtros {
  rubros: string[]
  provincias: string[]
}

export interface Usuario {
  id: number
  email: string
  full_name: string | null
  is_active: boolean
}
