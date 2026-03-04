export interface Cliente {
  id: number
  numero_cliente: number | null
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
  lamina: string | null
  muestra: string | null
  alto: number | null
  cilindro: number | null
  cierre: string | null
  envase: string | null
  lamina_2: string | null
  cilindro_2: number | null
  observaciones: string | null
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
