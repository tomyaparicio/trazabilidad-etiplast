export interface ClienteProducto {
  id: number
  cliente_id: number
  nombre: string | null
  envase: string | null
  envase_codificado: string | null
  ubicacion: string | null
  volumen_cantidad: number | null
  volumen_unidad: string | null
  lamina: string | null
  muestra: string | null
  alto: number | null
  cilindro: number | null
  cierre: number | null
  maquina_impresora_id: number | null
  maquina_impresora_nombre: string | null
}

export interface Maquina {
  id: number
  codigo: string
  nombre: string
  tipo: string
  activa: boolean
  /**
   * Cuántos espacios de color tiene la ORDEN DE TRABAJO EN PAPEL de esta
   * impresora. La empresa no tiene una hoja: tiene una POR MÁQUINA, y no son
   * iguales — la de ReinaFlex trae ocho y el sistema imprimía seis para todas.
   * `null` = todavía no lo cargaron, y la ficha usa su valor por defecto.
   */
  ficha_colores: number | null
  /**
   * QUÉ HOJA imprime esta máquina. Distinto de `ficha_colores`, que sólo dice
   * cuántos renglones de color dejarle: acá cambia la ESTRUCTURA de la ficha,
   * porque el proceso no es el mismo.
   *
   * `"film"` — Venus y ReinaFlex. El film se EXTRUDE acá adentro, así que el
   * paso 1 pide ancho, color, espesor y los kilos de cada bobina.
   *
   * `"autoadhesiva"` — el material se COMPRA en bobina (OPP blanco, papel): no
   * hay nada que extrudar. El paso 1 pregunta qué material es y de qué ancho
   * vino; el 2 agrega barniz y laminación; el 3 pide el troquel en alto×largo
   * y hacia dónde se bobina.
   *
   * `null` = `"film"`, que es la hoja que el sistema imprimía para todas.
   */
  ficha_tipo: "film" | "autoadhesiva" | null
}

export interface RazonSocial {
  id: number
  numero: number | null
  razon_social: string
  cuit: string | null
  created_at: string | null
}

/** Una razón social que puede ser la misma empresa que se está por crear: mismo
 *  nombre (sin mirar tildes, puntuación ni la sociedad del final) o parecida.
 *  Trae con qué reconocerla: su N° y cuántas marcas le cuelgan. */
export interface RazonSocialSimilar {
  id: number
  razon_social: string
  numero: number | null
  cuit: string | null
  cantidad_marcas: number
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
  // Finanzas (facturación = valor de órdenes; no es dinero cobrado)
  finanzas?: DashboardFinanzas
}

export interface DashboardFinanzas {
  facturacion_total: number
  facturacion_completadas: number
  facturacion_mom: number | null
  facturacion_mensual: { mes: string; monto: number }[]
  ticket_promedio: number
  presupuestos_aprobados_monto: number
  presupuestos_pendientes_monto: number
  presupuestos_aprobados: number
  presupuestos_pendientes: number
  presupuestos_total: number
  tasa_aprobacion: number
  /** Período aplicado (null/ausente = histórico completo). */
  anio?: number | null
  mes?: number | null
  /** Años con órdenes cargadas — para armar el filtro. */
  anios_disponibles?: number[]
}

export interface Filtros {
  rubros: string[]
  provincias: string[]
  envases: string[]
  /** Sólo las razones sociales que algún cliente usa (catálogo + texto libre legacy). */
  razones_sociales: string[]
  /** Valores ya usados en presentaciones, por frecuencia — sugerencias de carga. */
  laminas: string[]
  ubicaciones: string[]
  altos: number[]
  cilindros: number[]
}

export interface Usuario {
  id: number
  email: string
  full_name: string | null
  is_active: boolean
}
