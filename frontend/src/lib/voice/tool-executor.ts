// Ejecuta las tools de Gemini llamando al backend directamente (server-side)
// Este archivo SOLO se usa desde route handlers de Next.js

const API_URL     = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
const GEMINI_KEY  = process.env.GEMINI_API_KEY
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash"

async function backendGet(path: string, token: string, params?: Record<string, string | number | undefined>) {
  let url = `${API_URL}/api/${path}`
  if (params) {
    const sp = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) sp.set(k, String(v))
    })
    const q = sp.toString()
    if (q) url += `?${q}`
  }
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`Error ${res.status} al consultar ${path}`)
  return res.json()
}

async function backendPost(path: string, token: string, body: object) {
  const res = await fetch(`${API_URL}/api/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    let msg = `Error ${res.status}`
    try { msg = JSON.parse(text).detail || msg } catch { /* ignore */ }
    throw new Error(msg)
  }
  return res.json()
}

async function backendPut(path: string, token: string, body: object) {
  const res = await fetch(`${API_URL}/api/${path}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    let msg = `Error ${res.status}`
    try { msg = JSON.parse(text).detail || msg } catch { /* ignore */ }
    throw new Error(msg)
  }
  return res.json()
}

// ─── Conversión de números en español ────────────────────────────────────────

const ES_ONES: Record<string, number> = {
  cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4,
  cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15,
  dieciséis: 16, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
  veinte: 20, veintiuno: 21, veintiún: 21, veintiuna: 21,
  veintidós: 22, veintidos: 22, veintitrés: 23, veintitres: 23,
  veinticuatro: 24, veinticinco: 25, veintiséis: 26, veintiseis: 26,
  veintisiete: 27, veintiocho: 28, veintinueve: 29,
}
const ES_TENS: Record<string, number> = {
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60,
  setenta: 70, ochenta: 80, noventa: 90,
}
const ES_HUNDREDS: Record<string, number> = {
  cien: 100, ciento: 100, doscientos: 200, doscientas: 200,
  trescientos: 300, trescientas: 300, cuatrocientos: 400, cuatrocientas: 400,
  quinientos: 500, quinientas: 500, seiscientos: 600, seiscientas: 600,
  setecientos: 700, setecientas: 700, ochocientos: 800, ochocientas: 800,
  novecientos: 900, novecientas: 900,
}
const ES_ORDINALS: Record<string, number> = {
  primero: 1, primer: 1, primera: 1,
  segundo: 2, segunda: 2,
  tercero: 3, tercer: 3, tercera: 3,
  cuarto: 4, cuarta: 4,
  quinto: 5, quinta: 5,
  sexto: 6, sexta: 6,
  séptimo: 7, septimo: 7, séptima: 7, septima: 7,
  octavo: 8, octava: 8,
  noveno: 9, novena: 9,
  décimo: 10, decimo: 10,
}

/**
 * Convierte un texto a número entero.
 * Acepta: "42", "cuarenta y dos", "el tercero", "ciento veinte", etc.
 * Devuelve null si no puede convertir.
 */
export function spanishToInt(raw: unknown): number | null {
  if (raw == null) return null
  const n = Number(raw)
  if (!isNaN(n) && Number.isInteger(n)) return n

  const t = String(raw).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()

  // Número puro con posibles caracteres extra: "el 42", "número 5", "n° 7"
  const pureNum = t.match(/\b(\d+)\b/)
  if (pureNum) return parseInt(pureNum[1])

  // Ordinal: "el segundo", "la primera"
  for (const [word, val] of Object.entries(ES_ORDINALS)) {
    if (t.includes(word)) return val
  }

  // Ones directas: "cinco", "doce"
  if (ES_ONES[t] !== undefined) return ES_ONES[t]
  if (ES_TENS[t] !== undefined) return ES_TENS[t]
  if (ES_HUNDREDS[t] !== undefined) return ES_HUNDREDS[t]

  // "treinta y dos", "cuarenta y cinco", etc.
  const tensOnesMatch = t.match(
    /^(treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa)\s+y\s+(\w+)/
  )
  if (tensOnesMatch) {
    const ten = ES_TENS[tensOnesMatch[1]]
    const one = ES_ONES[tensOnesMatch[2]]
    if (ten !== undefined && one !== undefined) return ten + one
  }

  // "ciento X"
  const cientoMatch = t.match(/^ciento?\s+(.+)/)
  if (cientoMatch) {
    const rest = spanishToInt(cientoMatch[1])
    if (rest !== null) return 100 + rest
  }

  // "doscientos X", etc.
  for (const [word, val] of Object.entries(ES_HUNDREDS)) {
    if (t.startsWith(word)) {
      const rest = spanishToInt(t.slice(word.length).trim())
      return rest !== null ? val + rest : val
    }
  }

  return null
}

// ─── Helpers de búsqueda fuzzy ────────────────────────────────────────────────

/** Elimina tildes y normaliza a minúsculas */
function removeAccents(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
}

/**
 * Normalización fonética para español:
 * Maneja las confusiones más comunes del STT (h muda, j/g, v/b, ll/y, etc.)
 */
function phoneticNormalize(text: string): string {
  return removeAccents(text)
    .replace(/h/g, "")          // h muda en español: "hauregui" → "auregui"
    .replace(/v/g, "b")         // v/b: "boca" = "voca"
    .replace(/z/g, "s")         // z/s en dialecto rioplatense
    .replace(/c([ei])/g, "s$1") // ce/ci → se/si
    .replace(/ll/g, "y")        // yeísmo: "llanos" = "yanos"
    .replace(/qu([ei])/g, "k$1") // que/qui → ke/ki
    .replace(/gue|gui/g, (m) => m.replace("u", "")) // gue→ge, gui→gi
    .replace(/j/g, "g")         // j/g ante e, i suenan igual
    .replace(/x/g, "s")         // en nombres como "Xiomara"
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Búsqueda de clientes con múltiples estrategias de fallback:
 * 1. Query original (ILIKE exacto)
 * 2. Sin tildes (ILIKE)
 * 3. Normalización fonética (ILIKE)
 * 4. Cada token por separado (el más largo primero)
 * 5. Prefijo de los primeros 4 chars
 * 6. Trigrama fuzzy del backend (pg_trgm) — captura errores fonéticos del STT
 */
async function buscarClientesFuzzy(
  query: string,
  rubro: string | undefined,
  token: string
): Promise<{ items: unknown[]; usedStrategy: string }> {

  const trySearch = async (q: string, fuzzy = false) => {
    if (!q || q.length < 2) return []
    const data = await backendGet("clientes", token, {
      search: q,
      rubro,
      per_page: 8,
      ...(fuzzy && { fuzzy: "true" }),
    })
    return (data.data ?? []) as unknown[]
  }

  // 1. Original
  let items = await trySearch(query)
  if (items.length > 0) return { items, usedStrategy: "exacto" }

  // 2. Sin tildes
  const noAccents = removeAccents(query)
  if (noAccents !== query.toLowerCase().trim()) {
    items = await trySearch(noAccents)
    if (items.length > 0) return { items, usedStrategy: "sin tildes" }
  }

  // 3. Fonético
  const phonetic = phoneticNormalize(query)
  if (phonetic !== noAccents) {
    items = await trySearch(phonetic)
    if (items.length > 0) return { items, usedStrategy: "fonético" }
  }

  // 4. Tokens individuales (de mayor a menor longitud)
  const tokens = query.split(/\s+/).filter((w) => w.length >= 3)
  for (const token_ of tokens.sort((a, b) => b.length - a.length)) {
    items = await trySearch(token_)
    if (items.length > 0) return { items, usedStrategy: `token "${token_}"` }
    // También sin tildes del token
    const tokenNorm = removeAccents(token_)
    if (tokenNorm !== token_.toLowerCase()) {
      items = await trySearch(tokenNorm)
      if (items.length > 0) return { items, usedStrategy: `token normalizado "${tokenNorm}"` }
    }
  }

  // 5. Prefijo (primeros 4-5 chars del query original o fonético)
  const prefix = query.slice(0, 5).trim()
  if (prefix.length >= 4) {
    items = await trySearch(prefix)
    if (items.length > 0) return { items, usedStrategy: `prefijo "${prefix}"` }
  }

  // 6. Trigrama fuzzy (pg_trgm) — último recurso, máxima tolerancia
  items = await trySearch(query, true)
  if (items.length > 0) return { items, usedStrategy: "fuzzy" }

  // Último intento: trigrama con query fonético
  items = await trySearch(phonetic, true)
  return { items, usedStrategy: "fuzzy fonético" }
}

// ─── Ejecutor principal ────────────────────────────────────────────────────────

export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  token: string
): Promise<string> {
  try {
    switch (toolName) {

      case "buscar_clientes": {
        const { items, usedStrategy } = await buscarClientesFuzzy(
          args.query as string,
          args.rubro as string | undefined,
          token
        )
        if (items.length === 0) {
          return `No encontré clientes con el nombre "${args.query}". Probé varias variaciones sin éxito. Intentá buscar con un nombre diferente o más corto.`
        }
        // Numerar la lista para que el usuario pueda decir "el 1", "el primero", etc.
        type ClienteItem = { id: number; id_cliente?: number; marca?: string; rubro?: string }
        const lista = (items as ClienteItem[])
          .map((c, i) => `${i + 1}. [ID interno: ${c.id}] ${c.marca ?? "Sin nombre"} (N°${c.id_cliente ?? "—"}) — Rubro: ${c.rubro ?? "N/A"}`)
          .join("\n")
        const hint = usedStrategy !== "exacto" ? ` (encontrado por coincidencia aproximada: ${usedStrategy})` : ""
        return `Encontré ${items.length} cliente(s)${hint}:\n${lista}\nUsá el ID interno para referirte a uno específico.`
      }

      case "obtener_cliente": {
        // Acepta tanto número directo como palabras en español ("cuarenta y dos")
        const clienteId = spanishToInt(args.cliente_id)
        if (!clienteId) return "No pude interpretar el ID del cliente."
        const c = await backendGet(`clientes/${clienteId}`, token)
        return `Cliente #${c.id_cliente}: ${c.marca ?? "Sin nombre"}. Rubro: ${c.rubro ?? "N/A"}. Localidad: ${c.localidad ?? "N/A"}, ${c.provincia ?? ""}. Contacto: ${c.contacto?.nombre_contacto ?? "N/A"} (${c.contacto?.email ?? "N/A"}).`
      }

      case "listar_ordenes": {
        const params: Record<string, string | number | undefined> = { per_page: 50 }
        if (args.estado) params.estado = args.estado as string
        if (args.cliente_id) {
          const cid = spanishToInt(args.cliente_id)
          if (cid) params.cliente_id = cid
        }
        if (args.buscar) params.search = args.buscar as string
        const data = await backendGet("ordenes", token, params)
        const items = data.data ?? []
        if (items.length === 0) return "No hay órdenes con esos filtros."
        const lista = items
          .map((o: { numero: string; cliente_nombre?: string; estado: string; fecha?: string; cantidad?: number }) =>
            `${o.numero} — ${o.cliente_nombre ?? "Sin cliente"} — ${o.estado}${o.fecha ? ` — ${o.fecha}` : ""}${o.cantidad ? ` — ${o.cantidad} uds` : ""}`
          )
          .join("\n")
        return `Hay ${data.total} orden(es) en total. Mostrando ${items.length}:\n${lista}`
      }

      case "obtener_orden": {
        // Acepta número directo, palabras en español, o normaliza OT a ID
        const ordenId = spanishToInt(args.orden_id)
        if (!ordenId) return "No pude interpretar el número de la orden."
        const o = await backendGet(`ordenes/${ordenId}`, token)
        return `Orden ${o.numero}: Cliente ${o.cliente_nombre ?? o.cliente_id}, Estado: ${o.estado}, Fecha: ${o.fecha ?? "N/A"}, Cantidad: ${o.cantidad ?? "N/A"}. Color extrusión: ${o.extrusion_color ?? "N/A"}, Formulación: ${o.extrusion_formulacion ?? "N/A"}.`
      }

      case "crear_orden_borrador": {
        const a = args as Record<string, unknown>
        const payload: Record<string, unknown> = {
          cliente_id: spanishToInt(a.cliente_id) ?? a.cliente_id,
          estado: "borrador",
          bobinas: [],
          impresion_colores: a.impresion_colores
            ? String(a.impresion_colores).split(",").map((s: string) => s.trim()).filter(Boolean)
            : [],
        }
        // Campos generales
        if (a.cantidad)      payload.cantidad      = a.cantidad
        if (a.observaciones) payload.observaciones = a.observaciones
        if (a.fecha_entrega) payload.fecha_entrega  = a.fecha_entrega
        // Extrusión
        if (a.extrusion_color)         payload.extrusion_color         = a.extrusion_color
        if (a.extrusion_trat)          payload.extrusion_trat          = a.extrusion_trat
        if (a.extrusion_espesor)       payload.extrusion_espesor       = a.extrusion_espesor
        if (a.extrusion_formulacion)   payload.extrusion_formulacion   = a.extrusion_formulacion
        if (a.extrusion_ancho)         payload.extrusion_ancho         = a.extrusion_ancho
        if (a.extrusion_cant_bob)      payload.extrusion_cant_bob      = a.extrusion_cant_bob
        if (a.extrusion_maquina)       payload.extrusion_maquina       = a.extrusion_maquina
        if (a.extrusion_observaciones) payload.extrusion_observaciones = a.extrusion_observaciones
        // Troquelado
        if (a.troquelado_alto)    payload.troquelado_alto    = a.troquelado_alto
        if (a.troquelado_ancho)   payload.troquelado_ancho   = a.troquelado_ancho
        if (a.troquelado_envase)  payload.troquelado_envase  = a.troquelado_envase
        if (a.troquelado_maquina) payload.troquelado_maquina = a.troquelado_maquina
        // Impresión
        if (a.impresion_frente)   payload.impresion_frente   = a.impresion_frente
        if (a.impresion_cilindro) payload.impresion_cilindro = a.impresion_cilindro

        const o = await backendPost("ordenes", token, payload)
        const campos = [
          a.extrusion_color     ? `color ${a.extrusion_color}`       : null,
          a.extrusion_espesor   ? `${a.extrusion_espesor}µ`          : null,
          a.troquelado_envase   ? `envase ${a.troquelado_envase}`     : null,
          a.cantidad            ? `${a.cantidad} unidades`            : null,
        ].filter(Boolean).join(", ")
        return `Orden ${o.numero} creada exitosamente${campos ? ` (${campos})` : ""}, estado: borrador.`
      }

      case "editar_orden": {
        const a = args as Record<string, unknown>
        // Normalizar número de OT:
        // "42", "cuarenta y dos" → OT-0042 | "OT-42" → OT-0042 | "OT-0042" → OT-0042
        const rawInput = String(a.numero_ot ?? "").trim()
        const numVal = spanishToInt(rawInput.replace(/^OT-?/i, "")) ?? spanishToInt(rawInput)
        const rawNum = numVal
          ? String(numVal)
          : rawInput.toUpperCase().replace(/^OT-?0*/, "")
        const buscarNum = `OT-${rawNum.padStart(4, "0")}`

        // Buscar la orden por número
        const data = await backendGet("ordenes", token, { search: buscarNum, per_page: 3 })
        const items = (data.data ?? []) as Array<{ id: number; numero: string }>
        const match = items.find((o) => o.numero === buscarNum) ?? items[0]
        if (!match) return `No encontré ninguna orden con el número ${buscarNum}.`

        // Construir payload solo con los campos proporcionados
        const payload: Record<string, unknown> = {}
        if (a.extrusion_color)         payload.extrusion_color         = a.extrusion_color
        if (a.extrusion_trat)          payload.extrusion_trat          = a.extrusion_trat
        if (a.extrusion_espesor != null) payload.extrusion_espesor     = a.extrusion_espesor
        if (a.extrusion_formulacion)   payload.extrusion_formulacion   = a.extrusion_formulacion
        if (a.extrusion_ancho != null) payload.extrusion_ancho         = a.extrusion_ancho
        if (a.extrusion_cant_bob != null) payload.extrusion_cant_bob   = a.extrusion_cant_bob
        if (a.troquelado_alto != null) payload.troquelado_alto         = a.troquelado_alto
        if (a.troquelado_ancho != null) payload.troquelado_ancho       = a.troquelado_ancho
        if (a.troquelado_envase)       payload.troquelado_envase       = a.troquelado_envase
        if (a.cantidad != null)        payload.cantidad                = a.cantidad
        if (a.observaciones)           payload.observaciones           = a.observaciones
        if (a.fecha_entrega)           payload.fecha_entrega           = a.fecha_entrega
        if (a.operador)                payload.operador                = a.operador
        if (a.impresion_colores)       payload.impresion_colores =
          String(a.impresion_colores).split(",").map((s: string) => s.trim()).filter(Boolean)

        if (Object.keys(payload).length === 0) return "No especificaste qué campos cambiar."

        const updated = await backendPut(`ordenes/${match.id}`, token, payload)
        const camposStr = Object.keys(payload)
          .map((k) => k.replace(/_/g, " "))
          .join(", ")
        return `${updated.numero} actualizada correctamente. Cambios aplicados: ${camposStr}.`
      }

      case "actualizar_estado_orden": {
        const ordenId = spanishToInt(args.orden_id)
        if (!ordenId) return "No pude interpretar el número de la orden."
        const o = await backendPut(`ordenes/${ordenId}`, token, { estado: args.nuevo_estado })
        return `Orden ${o.numero} actualizada al estado: ${o.estado}.`
      }

      case "estadisticas_dashboard": {
        const stats = await backendGet("dashboard/stats", token)
        const pe = stats.ordenes_por_estado ?? {}
        const total = Object.values(pe).reduce((a: number, b) => a + (b as number), 0)
        const recientes = (stats.ordenes_recientes ?? [])
          .map((o: { numero: string; cliente_nombre?: string; estado: string }) =>
            `${o.numero} (${o.cliente_nombre ?? "Sin cliente"}) — ${o.estado}`
          ).join(", ")
        return `ERP Etiplast: ${stats.total_clientes ?? "?"} clientes registrados. ` +
          `Órdenes: ${total} en total — ` +
          `${pe.borrador ?? 0} borrador, ${pe.pendiente ?? 0} pendiente, ` +
          `${pe.en_proceso ?? 0} en proceso, ${pe.completada ?? 0} completada(s), ${pe.cancelada ?? 0} cancelada(s). ` +
          `Órdenes activas: ${stats.ordenes_activas ?? 0}. ` +
          (recientes ? `Recientes: ${recientes}.` : "")
      }

      case "preparar_formulario_orden": {
        const a = args as Record<string, unknown>
        const payload = {
          cliente_id:            spanishToInt(a.cliente_id) ?? a.cliente_id,
          cliente_nombre:        a.cliente_nombre,
          extrusion_color:       a.extrusion_color,
          extrusion_trat:        a.extrusion_trat,
          extrusion_espesor:     a.extrusion_espesor,
          extrusion_formulacion: a.extrusion_formulacion,
          extrusion_ancho:       a.extrusion_ancho,
          extrusion_cant_bob:    a.extrusion_cant_bob,
          troquelado_alto:       a.troquelado_alto,
          troquelado_ancho:      a.troquelado_ancho,
          troquelado_envase:     a.troquelado_envase,
          impresion_colores:     a.impresion_colores
            ? String(a.impresion_colores).split(",").map((s: string) => s.trim()).filter(Boolean)
            : undefined,
          cantidad:              a.cantidad,
          observaciones:         a.observaciones,
          fecha_entrega:         a.fecha_entrega,
        }
        // Marcador especial que route.ts detecta y convierte en action
        return `__ETI_ACTION__:${JSON.stringify({ type: "open_order_form", payload })}`
      }

      case "navegar_a": {
        const RUTAS: Record<string, { path: string; label: string }> = {
          ordenes:        { path: "/ordenes",        label: "Órdenes de Trabajo" },
          clientes:       { path: "/clientes",       label: "Clientes" },
          dashboard:      { path: "/dashboard",      label: "Dashboard" },
          administracion: { path: "/administracion", label: "Administración" },
        }
        const seccion = String(args.seccion ?? "").toLowerCase().trim()
        const ruta = RUTAS[seccion] ?? RUTAS["dashboard"]
        return `__ETI_ACTION__:${JSON.stringify({ type: "navigate", payload: ruta })}`
      }

      case "buscar_en_internet": {
        // Sub-llamada a Gemini usando SOLO google_search (sin function calling)
        if (!GEMINI_KEY) return "No tengo acceso a búsqueda en este momento."
        const query = args.query as string
        const searchUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`
        const searchBody = {
          contents: [{ role: "user", parts: [{ text: query }] }],
          tools: [{ google_search: {} }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 256 },
        }
        const searchRes = await fetch(searchUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(searchBody),
        })
        if (!searchRes.ok) return "No pude obtener resultados de internet."
        const searchData = await searchRes.json()
        const text = searchData.candidates?.[0]?.content?.parts
          ?.find((p: { text?: string }) => p.text)?.text
        return text ?? "No encontré resultados relevantes."
      }

      default:
        return `Tool desconocida: ${toolName}`
    }
  } catch (err) {
    return `Error al ejecutar ${toolName}: ${err instanceof Error ? err.message : "Error desconocido"}`
  }
}
