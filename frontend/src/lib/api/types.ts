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
  /** Lote de trazabilidad (L-YYYYMMDD-NNNN). Nace con el primer escaneo. */
  lote: string | null
  /** Nombre del producto: lo que el operario necesita saber que está haciendo */
  producto_nombre: string | null
  /** Estado de la muestra del producto: "OK" | "NOOK" | null */
  producto_muestra: string | null
  /** Código del envase en el depósito (ej. STAR-260011) */
  envase_codificado: string | null
  /** Dónde está ese envase en el depósito (ej. A-1) */
  envase_ubicacion: string | null
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
  troquelado_cierre: number | null
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

  // Cierre — lo llena el cuarto escaneo, el que saca la orden de la planta
  /**
   * Momento del cierre: ISO completo con offset («2026-11-08T01:00:00+00:00»),
   * NO un día suelto como las `fecha_*` de las etapas. La columna es
   * TIMESTAMPTZ porque el tablero muestra «hace cuánto» y con un día suelto no
   * se puede.
   *
   * Formatealo con `fechaCorta`/`desdeHace` de `@/lib/fechas`, que lo pasan a
   * hora local. Cortar el string a mano mostraría el día de Greenwich: una
   * orden cerrada el viernes a las 22 ART diría sábado.
   */
  fecha_cierre: string | null
  /**
   * Quién escaneó el cierre. Lo escribe el backend desde el token, nunca algo
   * que venga en el request — es la garantía que protege ese endpoint.
   */
  operador_cierre: string | null

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

// ─── Producción: dónde está cada pedido ──────────────────────────────────────
// Sale de los escaneos del QR. Una fila por paso de una orden por una máquina.

export type EtapaProduccion = "extrusion" | "impresion" | "troquelado"

/**
 * Lo que acepta el escaneo del QR: las tres etapas + el cierre.
 *
 * `finalizado` está ACÁ y no dentro de `EtapaProduccion` a propósito, igual que
 * en el backend (`ETAPAS_PRODUCCION` sigue siendo de tres):
 *
 *  - No es una etapa de producción: no ocupa máquina ni tiene columnas
 *    `fecha_finalizado`/`operador_finalizado` — el cierre escribe
 *    `fecha_cierre` y `operador_cierre`. Todo lo que resuelve una columna con
 *    `fecha_${etapa}` se rompería.
 *  - `OrdenEnMaquina.etapa` y `EtapaTablero.etapa` son lugares donde la orden
 *    está EN la planta. Una orden finalizada ya salió.
 */
export type EtapaEscaneable = EtapaProduccion | "finalizado"

export interface MaquinaTablero {
  id: number
  codigo: string | null
  nombre: string
  tipo: string | null
  /** El trabajo que está ocupando la máquina ahora, o null si está libre */
  orden: OrdenEnMaquina | null
}

export interface OrdenEnMaquina {
  id: number
  numero: string
  lote: string | null
  cliente: string | null
  producto: string | null
  cantidad: number | null
  etapa: EtapaProduccion
  /** Momento del escaneo (ISO) */
  desde: string | null
  operario: string | null
}

export interface OrdenSinUbicar {
  id: number
  numero: string
  lote: string | null
  cliente: string | null
  cantidad: number | null
}

/**
 * Las etapas donde importa en qué máquina se hizo.
 *
 * Sólo impresión: Venus, ReinaFlex, Taurus y la Autoadhesiva hacen cosas
 * distintas. En extrusión y troquelado las máquinas son intercambiables y
 * alcanza con saber que la etapa pasó.
 */
export const ETAPAS_CON_MAQUINA: EtapaProduccion[] = ["impresion"]

/** Una etapa que no elige máquina, con los trabajos que están en ella */
export interface EtapaTablero {
  etapa: EtapaProduccion
  titulo: string
  ordenes: OrdenEnMaquina[]
}

/**
 * El PRIMER paso del flujo: la orden está emitida y todavía no arrancó.
 *
 * Son las órdenes en estado «borrador» o «pendiente»: ya se cargaron en
 * Órdenes de Trabajo pero nadie escaneó el QR en ninguna máquina, así que no
 * entraron a la planta. La lista viene con tope (las 20 más recientes), así
 * que su largo NO es el total: para eso está `resumen.pendientes_total`.
 */
export interface OrdenPendiente {
  id: number
  numero: string
  lote: string | null
  cliente: string | null
  producto: string | null
  cantidad: number | null
  /**
   * Cuándo se EMITIÓ la orden (`created_at`), no cuándo se editó: de una orden
   * que todavía no arrancó lo que importa es hace cuánto que está esperando.
   */
  fecha: string | null
}

/**
 * El último paso del flujo: la orden ya salió de la planta.
 *
 * Una orden llega acá cuando queda en estado «completada», por dos caminos: el
 * cuarto escaneo del QR (`etapa: "finalizado"`, que además le escribe
 * `fecha_cierre` y `operador_cierre`) o la edición a mano desde Órdenes de
 * Trabajo, que sigue existiendo para la oficina.
 */
export interface OrdenFinalizada {
  id: number
  numero: string
  lote: string | null
  cliente: string | null
  producto: string | null
  cantidad: number | null
  /**
   * Cuándo se cerró: día suelto («2026-11-08») o momento ISO completo con
   * offset («2026-11-08T01:00:00+00:00»), que es lo que manda hoy el backend.
   * El momento viene en UTC: hay que pasarlo a hora local antes de mostrar el
   * día, o el turno noche aparece con la fecha del día siguiente.
   *
   * Sale de `fecha_cierre` y, para las órdenes que se cerraron antes de que esa
   * columna existiera, de `updated_at` — que es la fecha de la última edición,
   * no la del cierre. Mientras queden órdenes viejas, este dato no es exacto
   * para todas.
   */
  fecha: string | null
}

// ─── Los cinco pasos, con TODAS las órdenes adentro ──────────────────────────
//
// `maquinas` y `etapas` se armaban mirando sólo los pases ABIERTOS, y por eso
// el tablero se comía órdenes. Medido contra producción: de 3 órdenes en
// proceso se veía 1.
//
//   OT-0002  último pase en impresión, abierto    → se veía en el paso 3
//   OT-0001  último pase en impresión, CERRADO    → no se veía en ningún paso
//   OT-0003  nunca se escaneó                     → no se veía en ningún paso
//
// El pase de OT-0001 lo cerró el escaneo de OT-0002 al entrar a la misma
// impresora, que es correcto —una impresora no puede tener dos trabajos— pero
// dejaba a la orden fuera del tablero. Un flujo de planta que pierde órdenes es
// peor que no tener tablero: da confianza falsa.
//
// `pasos` lo resuelve del lado del backend: cada orden NO cancelada cae en
// EXACTAMENTE un paso, y las canceladas se cuentan aparte en
// `resumen.canceladas`. La invariante es
// `resumen.pasos_total + resumen.canceladas == total de órdenes`.

export type ClavePaso =
  | "orden_trabajo"
  | "extrusion"
  | "impresion"
  | "troquelado"
  | "finalizado"

/** Los cinco pasos en el orden del recorrido. Se dibujan SIEMPRE los cinco. */
export const PASOS_ORDENADOS: ClavePaso[] = [
  "orden_trabajo", "extrusion", "impresion", "troquelado", "finalizado",
]

export const TITULO_PASO: Record<ClavePaso, string> = {
  orden_trabajo: "Orden de trabajo",
  extrusion:     "Extrusión",
  impresion:     "Impresión",
  troquelado:    "Troquelado",
  finalizado:    "Finalizado",
}

/**
 * Los pasos que salen de un escaneo del QR.
 *
 * Importa para leer `en_maquina`: SÓLO acá «no está en máquina» significa que
 * la orden quedó trabada entre dos etapas. En el paso 1 la orden todavía no
 * entró a la planta y en el 5 ya salió: en esos dos, `en_maquina: false` es lo
 * normal y no hay nada que hacer al respecto.
 */
export const PASOS_DE_PLANTA: ClavePaso[] = ["extrusion", "impresion", "troquelado"]

/**
 * Qué falta que pase para que la orden se mueva de este paso.
 *
 * Es el dato accionable del tablero: si una orden está trabada, esto dice entre
 * qué dos etapas se quedó. Sólo los pasos de planta lo tienen.
 */
export const SIGUIENTE_DE: Partial<Record<ClavePaso, string>> = {
  extrusion:  "impresión",
  impresion:  "troquelado",
  troquelado: "el cierre de la orden",
}

/** `true` si la orden pasó por esta etapa y nadie la escaneó en la siguiente. */
export function estaTrabada(clave: ClavePaso, enMaquina: boolean): boolean {
  return !enMaquina && PASOS_DE_PLANTA.includes(clave)
}

/** Una orden dentro de un paso. Misma forma en los cinco, se dibuja igual. */
export interface OrdenEnPaso {
  id: number
  numero: string
  lote: string | null
  cliente: string | null
  producto: string | null
  cantidad: number | null
  /** Desde cuándo está en este paso (ISO) */
  desde: string | null
  operario: string | null
  /** Sólo impresión: en extrusión y troquelado las máquinas son intercambiables */
  maquina: string | null
  /**
   * `true` = el pase está ABIERTO: está en la máquina ahora.
   * `false` = el pase está cerrado: pasó por esta etapa y nadie la escaneó en
   * la siguiente, así que está físicamente entre dos máquinas.
   */
  en_maquina: boolean
}

export interface PasoTablero {
  clave: ClavePaso
  /** El lugar en el recorrido (1 a 5). No es el número de la ficha impresa. */
  numero: number
  titulo: string
  /** Cuántas hay EN TOTAL en este paso, sin tope. Esto es lo que se muestra. */
  total: number
  /** Las 20 más recientes de este paso — su largo NO es el total */
  ordenes: OrdenEnPaso[]
}

/** Una fila del depósito: lo que hay de un producto terminado contra su mínimo */
export interface StockTableroItem {
  id: number
  codigo: string | null
  nombre: string
  unidad: string | null
  stock_actual: number | null
  stock_minimo: number | null
  bajo_minimo: boolean
  cliente_nombre: string | null
}

/**
 * El depósito, resumido para el tablero.
 *
 * `terminado` viene recortado (los bajo mínimo primero, el resto por nombre),
 * así que su largo NO es el total: para eso está `total_items`.
 *
 * `bajo_minimo` cuenta items de cualquier tipo —materia prima incluida—, no
 * sólo los de `terminado`: lo que frena la planta es que falte el insumo.
 */
export interface StockTablero {
  terminado: StockTableroItem[]
  total_items: number
  bajo_minimo: number
}

export interface TableroProduccion {
  /** Columnas por máquina — hoy sólo las impresoras */
  maquinas: MaquinaTablero[]
  /** Columnas por etapa — extrusión y troquelado, que no eligen máquina */
  etapas: EtapaTablero[]
  /** En producción pero sin escanear: no se sabe dónde están */
  sin_ubicar: OrdenSinUbicar[]
  /**
   * Paso 1: las emitidas que todavía no arrancaron (borrador o pendiente), las
   * 20 más recientes primero. Viene con tope — el total está en
   * `resumen.pendientes_total`.
   */
  pendientes: OrdenPendiente[]
  /** Paso 5: las completadas, las más recientes primero */
  finalizadas: OrdenFinalizada[]
  /** El depósito de producto terminado, después del último paso */
  stock: StockTablero
  /**
   * Los CINCO pasos, con todas las órdenes repartidas sin perder ninguna.
   *
   * Siempre vienen los cinco y en orden: `normalizar()` en `use-tablero.ts` lo
   * garantiza, incluso en la ventana de deploy en la que la API todavía no
   * manda el campo (Vercel y Railway se deployan por separado).
   */
  pasos: PasoTablero[]
  resumen: {
    ocupadas: number
    libres: number
    en_etapas: number
    sin_ubicar: number
    /** Cuántas trae `pendientes` — la lista viene con tope, así que NO es el total */
    pendientes: number
    /** Cuántas órdenes sin arrancar hay en total, sin el tope: esto es lo que se muestra */
    pendientes_total: number
    /** Cuántas trae `finalizadas` — la lista viene con tope, así que NO es el total */
    finalizadas: number
    /** Cuántas órdenes completadas hay en total, sin el tope: esto es lo que se muestra */
    finalizadas_total: number
    /** Mismo número que `stock.bajo_minimo` */
    bajo_minimo: number
    /** Suma de los `total` de los cinco pasos */
    pasos_total: number
    /**
     * Las canceladas no caen en ningún paso, pero no pueden desaparecer en
     * silencio: con este número cierra
     * `pasos_total + canceladas == total de órdenes`.
     */
    canceladas: number
  }
}

/**
 * La versión del tablero: un string opaco que cambia cuando cambia algo.
 *
 * Es lo único que se pide cada 3 s. El cliente no lo interpreta: sólo compara
 * si es distinto del último que vio y, si lo es, pide el tablero completo.
 */
export interface VersionProduccion {
  v: string
}

export interface EscaneoEtapaRequest {
  /** Las tres etapas o `finalizado`, que cierra la orden y la saca de la planta */
  etapa: EtapaEscaneable
  /** Obligatoria sólo en impresión; en las otras etapas y en el cierre se ignora */
  maquina_id?: number
  /** Sólo para la tablet compartida: quién está realmente en la máquina */
  operario?: string
}

export interface EscaneoEtapaResponse {
  orden_id: number
  numero: string
  lote: string | null
  estado_orden: string
  etapa: EtapaEscaneable
  /** null en las etapas que no eligen máquina y en el cierre */
  maquina: { id: number; codigo: string | null; nombre: string; tipo: string | null } | null
  operario: string | null
  /**
   * Sólo en el cierre, y sólo cuando la orden no tiene NINGÚN pase de planta.
   *
   * Significa una de dos cosas y las dos importan: o los operarios nunca
   * escanearon —y el tablero estuvo mintiendo todo el pedido— o la orden nunca
   * se produjo. El backend deja cerrar igual (la oficina cierra entregas hechas
   * con stock) y manda esto para que la pantalla lo diga EN EL MOMENTO, que es
   * el único en que alguien puede averiguar qué pasó. Null en todo el resto.
   */
  advertencia: string | null
}
