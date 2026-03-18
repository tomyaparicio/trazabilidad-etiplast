// Definición de las tools que Gemini puede invocar para interactuar con el ERP

export const GEMINI_TOOLS = [
  {
    functionDeclarations: [
      {
        name: "buscar_clientes",
        description: "Busca clientes/marcas en el ERP por nombre de marca o rubro. Usar antes de crear una orden para obtener el cliente_id.",
        parameters: {
          type: "OBJECT",
          properties: {
            query: {
              type: "STRING",
              description: "Nombre de la marca, empresa o cliente a buscar",
            },
            rubro: {
              type: "STRING",
              description: "Filtrar por rubro (opcional). Ej: 'alimenticio', 'cosmético'",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "obtener_cliente",
        description: "Obtiene el detalle completo de un cliente por su ID numérico",
        parameters: {
          type: "OBJECT",
          properties: {
            cliente_id: {
              type: "NUMBER",
              description: "ID numérico del cliente",
            },
          },
          required: ["cliente_id"],
        },
      },
      {
        name: "listar_ordenes",
        description: "Lista las órdenes de trabajo con filtros opcionales. Si no se dan filtros, devuelve las más recientes.",
        parameters: {
          type: "OBJECT",
          properties: {
            estado: {
              type: "STRING",
              description: "Filtrar por estado: borrador, pendiente, en_proceso, completada, cancelada",
            },
            cliente_id: {
              type: "NUMBER",
              description: "Filtrar por ID de cliente (opcional)",
            },
            buscar: {
              type: "STRING",
              description: "Buscar por número de OT o nombre de cliente",
            },
          },
          required: [],
        },
      },
      {
        name: "obtener_orden",
        description: "Obtiene el detalle completo de una orden de trabajo por su ID",
        parameters: {
          type: "OBJECT",
          properties: {
            orden_id: {
              type: "NUMBER",
              description: "ID numérico de la orden de trabajo",
            },
          },
          required: ["orden_id"],
        },
      },
      {
        name: "preparar_formulario_orden",
        description: "Abre el formulario visual de nueva orden de trabajo con los datos ya cargados para que el usuario lo revise y confirme. SIEMPRE usar esto en lugar de crear_orden_borrador cuando el usuario pide crear una orden por voz. Recopilar datos antes de llamar.",
        parameters: {
          type: "OBJECT",
          properties: {
            cliente_id:            { type: "NUMBER", description: "ID numérico del cliente (obligatorio)" },
            cliente_nombre:        { type: "STRING", description: "Nombre del cliente para mostrar en el formulario" },
            extrusion_color:       { type: "STRING", description: "Color de extrusión. Ej: Blanco, Natural, Negro" },
            extrusion_trat:        { type: "STRING", description: "Tratamiento corona: 'Con' o 'Sin'" },
            extrusion_espesor:     { type: "NUMBER", description: "Micronaje en µ. Ej: 60" },
            extrusion_formulacion: { type: "STRING", description: "Formulación. Ej: 2045/208" },
            extrusion_ancho:       { type: "NUMBER", description: "Ancho de extrusión en mm" },
            extrusion_cant_bob:    { type: "NUMBER", description: "Cantidad de bobinas" },
            troquelado_alto:       { type: "NUMBER", description: "Alto del troquelado en mm" },
            troquelado_ancho:      { type: "NUMBER", description: "Ancho del troquelado en mm" },
            troquelado_envase:     { type: "STRING", description: "Tipo de envase. Ej: Jubahi, Doypack" },
            impresion_colores:     { type: "STRING", description: "Colores de impresión separados por coma" },
            cantidad:              { type: "NUMBER", description: "Cantidad de unidades a producir" },
            observaciones:         { type: "STRING", description: "Observaciones generales" },
            fecha_entrega:         { type: "STRING", description: "Fecha de entrega YYYY-MM-DD" },
          },
          required: ["cliente_id"],
        },
      },
      {
        name: "navegar_a",
        description: "Navega a una sección del ERP cuando el usuario lo pide. Ej: 'llevame a clientes', 'ir a órdenes', 'mostrar dashboard'.",
        parameters: {
          type: "OBJECT",
          properties: {
            seccion: {
              type: "STRING",
              description: "Sección a la que navegar: 'ordenes', 'clientes', 'dashboard', 'administracion'",
            },
          },
          required: ["seccion"],
        },
      },
      {
        name: "crear_orden_borrador",
        description: "Crea una orden directamente sin mostrar el formulario. Usar SOLO si el usuario dice explícitamente 'creala directo' o 'sin preguntar'. Normalmente usar preparar_formulario_orden.",
        parameters: {
          type: "OBJECT",
          properties: {
            cliente_id: {
              type: "NUMBER",
              description: "ID numérico del cliente (obligatorio)",
            },
            cantidad: {
              type: "NUMBER",
              description: "Cantidad de unidades a producir",
            },
            observaciones: {
              type: "STRING",
              description: "Observaciones generales de la orden",
            },
            fecha_entrega: {
              type: "STRING",
              description: "Fecha de entrega en formato YYYY-MM-DD",
            },
            // Extrusión
            extrusion_color: {
              type: "STRING",
              description: "Color de extrusión. Ej: Blanco, Natural, Negro",
            },
            extrusion_trat: {
              type: "STRING",
              description: "Tratamiento corona: 'Con' o 'Sin'",
            },
            extrusion_espesor: {
              type: "NUMBER",
              description: "Micronaje en µ. Ej: 60",
            },
            extrusion_formulacion: {
              type: "STRING",
              description: "Formulación. Ej: 2045/208",
            },
            extrusion_ancho: {
              type: "NUMBER",
              description: "Ancho de extrusión en mm",
            },
            extrusion_cant_bob: {
              type: "NUMBER",
              description: "Cantidad de bobinas",
            },
            extrusion_maquina: {
              type: "STRING",
              description: "Máquina de extrusión",
            },
            extrusion_observaciones: {
              type: "STRING",
              description: "Observaciones de extrusión",
            },
            // Troquelado
            troquelado_alto: {
              type: "NUMBER",
              description: "Alto del troquelado en mm",
            },
            troquelado_ancho: {
              type: "NUMBER",
              description: "Ancho del troquelado en mm",
            },
            troquelado_envase: {
              type: "STRING",
              description: "Tipo de envase para troquelado. Ej: Jubahi, Doypack",
            },
            troquelado_maquina: {
              type: "STRING",
              description: "Máquina de troquelado",
            },
            // Impresión
            impresion_frente: {
              type: "STRING",
              description: "Tipo de frente de impresión",
            },
            impresion_cilindro: {
              type: "NUMBER",
              description: "Cilindro de impresión en mm",
            },
            impresion_colores: {
              type: "STRING",
              description: "Colores de impresión separados por coma. Ej: Rojo,Azul,Negro",
            },
          },
          required: ["cliente_id"],
        },
      },
      {
        name: "actualizar_estado_orden",
        description: "Cambia el estado de una orden de trabajo existente",
        parameters: {
          type: "OBJECT",
          properties: {
            orden_id: {
              type: "NUMBER",
              description: "ID numérico de la orden",
            },
            nuevo_estado: {
              type: "STRING",
              description: "Nuevo estado: borrador, pendiente, en_proceso, completada, cancelada",
            },
          },
          required: ["orden_id", "nuevo_estado"],
        },
      },
      {
        name: "buscar_en_internet",
        description: "Busca información en internet usando Google. Usá cuando el usuario pregunte algo que no está en el ERP: precios, noticias, clima, cotizaciones, proveedores, definiciones, etc.",
        parameters: {
          type: "OBJECT",
          properties: {
            query: {
              type: "STRING",
              description: "La consulta a buscar en Google. Ej: 'dólar blue hoy Argentina', 'precio polietileno Argentina 2026'",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "editar_orden",
        description: "Edita los campos de una orden de trabajo existente. Usar cuando el usuario pida cambiar algo de una OT: 'cambiá el color de la OT-0042', 'actualizá la formulación', 'modificá la cantidad de la orden 15'. Acepta el número de OT o solo el número.",
        parameters: {
          type: "OBJECT",
          properties: {
            numero_ot:             { type: "STRING", description: "Número de la orden. Ej: 'OT-0042' o simplemente '42'" },
            extrusion_color:       { type: "STRING", description: "Nuevo color de extrusión. Ej: Blanco, Negro, Cristal" },
            extrusion_trat:        { type: "STRING", description: "Tratamiento corona: 'Con' o 'Sin'" },
            extrusion_espesor:     { type: "NUMBER", description: "Nuevo micronaje en µ" },
            extrusion_formulacion: { type: "STRING", description: "Nueva formulación/lámina. Ej: 2045/208" },
            extrusion_ancho:       { type: "NUMBER", description: "Nuevo ancho en mm" },
            extrusion_cant_bob:    { type: "NUMBER", description: "Nueva cantidad de bobinas" },
            troquelado_alto:       { type: "NUMBER", description: "Nuevo alto de troquelado en mm" },
            troquelado_ancho:      { type: "NUMBER", description: "Nuevo ancho de troquelado en mm" },
            troquelado_envase:     { type: "STRING", description: "Nuevo tipo de envase" },
            impresion_colores:     { type: "STRING", description: "Nuevos colores de impresión separados por coma" },
            cantidad:              { type: "NUMBER", description: "Nueva cantidad de unidades" },
            observaciones:         { type: "STRING", description: "Nuevas observaciones" },
            fecha_entrega:         { type: "STRING", description: "Nueva fecha de entrega YYYY-MM-DD" },
            operador:              { type: "STRING", description: "Nombre del operador asignado" },
          },
          required: ["numero_ot"],
        },
      },
      {
        name: "estadisticas_dashboard",
        description: "Obtiene el resumen general del sistema: total de clientes, órdenes por estado, actividad reciente",
        parameters: {
          type: "OBJECT",
          properties: {},
          required: [],
        },
      },
    ],
  },
]

export const TOOL_LABELS: Record<string, string> = {
  buscar_clientes:           "Buscando clientes...",
  obtener_cliente:           "Obteniendo cliente...",
  listar_ordenes:            "Consultando órdenes...",
  obtener_orden:             "Buscando orden...",
  crear_orden_borrador:      "Creando orden...",
  preparar_formulario_orden: "Abriendo formulario...",
  navegar_a:                 "Navegando...",
  actualizar_estado_orden:   "Actualizando orden...",
  editar_orden:              "Editando orden...",
  estadisticas_dashboard:    "Consultando estadísticas...",
  buscar_en_internet:        "Buscando en internet...",
}
