"""
Catálogo RBAC — Etiplast ERP
============================
Fuente única de las **vistas** (secciones del sidebar) y **acciones**
(`modulo:accion`) que un rol puede tener asignadas. Usado para:
  - sembrar los roles por defecto (migrate.py),
  - validar lo que llega desde la pantalla de administración de roles,
  - exponer el catálogo al frontend (para pintar la matriz de checkboxes).

Los permisos de cada rol se guardan en la tabla `roles` (editables por un admin);
esto es sólo el catálogo de lo POSIBLE y los defaults iniciales.
"""

# Vistas disponibles (clave de navegación, etiqueta legible)
VISTAS = [
    ("panel", "Panel de control"),
    ("clientes", "Clientes"),
    ("ordenes", "Órdenes de trabajo"),
    ("presupuestos", "Presupuestos"),
    ("facturas", "Facturas"),
    ("stock", "Stock"),
    ("remitos", "Remitos"),
    ("reportes", "Reportes"),
    ("usuarios", "Usuarios"),
    ("roles", "Roles y permisos"),
    ("razones_sociales", "Razones sociales"),
    ("rubros", "Rubros"),
    ("envases", "Envases"),
    ("maquinas", "Máquinas"),
    ("calidad", "Calidad"),
    ("auditoria", "Auditoría"),
]

# Módulos con sus acciones posibles (clave, etiqueta, [acciones])
MODULOS = [
    ("clientes", "Clientes", ["ver", "crear", "editar", "borrar"]),
    ("ordenes", "Órdenes de trabajo", ["ver", "crear", "editar", "borrar"]),
    ("presupuestos", "Presupuestos", ["ver", "crear", "editar", "borrar", "aprobar"]),
    # Facturas: sólo admin por defecto (no se suma a los roles user/operario).
    ("facturas", "Facturas", ["ver", "crear", "editar", "borrar"]),
    ("stock", "Stock", ["ver", "crear", "editar", "borrar"]),
    ("remitos", "Remitos", ["ver", "crear", "editar", "borrar"]),
    ("calidad", "Calidad", ["ver", "crear", "editar", "borrar"]),
    ("reportes", "Reportes", ["ver"]),
    ("usuarios", "Usuarios", ["ver", "crear", "editar", "borrar"]),
    ("roles", "Roles y permisos", ["ver", "crear", "editar", "borrar"]),
    ("catalogos", "Catálogos (rubros, envases, máquinas, RS)", ["ver", "crear", "editar", "borrar"]),
    ("auditoria", "Auditoría", ["ver"]),
]

VISTAS_CLAVES = [v[0] for v in VISTAS]
ACCIONES_CLAVES = [f"{m[0]}:{a}" for m in MODULOS for a in m[2]]


def catalogo() -> dict:
    """Catálogo completo para la matriz de permisos del frontend."""
    return {
        "vistas": [{"clave": c, "nombre": n} for c, n in VISTAS],
        "modulos": [{"clave": c, "nombre": n, "acciones": acc} for c, n, acc in MODULOS],
    }


# Roles por defecto (se siembran una vez; luego se editan desde la UI).
# Las claves admin/user/operario coinciden con los `role` ya existentes en users.
ROLES_DEFAULT = [
    {
        "clave": "admin",
        "nombre": "Administrador",
        "protegido": True,  # no se puede borrar ni quitarle permisos (evita quedar sin admin)
        "vistas": list(VISTAS_CLAVES),
        "acciones": list(ACCIONES_CLAVES),
    },
    {
        "clave": "user",
        "nombre": "General",
        "protegido": False,
        "vistas": ["panel", "clientes", "ordenes", "presupuestos", "stock", "remitos", "reportes"],
        "acciones": [
            "clientes:ver", "clientes:crear", "clientes:editar",
            "ordenes:ver", "ordenes:crear", "ordenes:editar",
            "presupuestos:ver", "presupuestos:crear", "presupuestos:editar", "presupuestos:aprobar",
            "stock:ver",
            "remitos:ver", "remitos:crear", "remitos:editar",
            "reportes:ver",
        ],
    },
    {
        "clave": "operario",
        "nombre": "Operario",
        "protegido": False,
        "vistas": ["panel", "ordenes", "stock", "calidad"],
        "acciones": [
            "ordenes:ver", "ordenes:editar",
            "stock:ver", "stock:editar",
            "calidad:ver", "calidad:crear", "calidad:editar",
        ],
    },
]
