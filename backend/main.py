import os
import logging
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from core.middleware import SecurityHeadersMiddleware, limiter
from routers import (
    admin, auth, calidad, catalogos, clientes, dashboard, notificaciones,
    facturas, ordenes, presupuestos, produccion, razones_sociales, remitos,
    reportes, roles, stock,
)

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="ERP Etiplast API",
    version="1.0.0",
    openapi_tags=[
        {"name": "auth", "description": "Login y registro de usuarios"},
        {"name": "admin", "description": "Gestión de usuarios (solo admin)"},
        {"name": "clientes", "description": "CRUD de clientes"},
        {"name": "ordenes", "description": "Órdenes de trabajo"},
        {"name": "dashboard", "description": "Estadísticas y filtros"},
        {"name": "presupuestos", "description": "Presupuestos y cotizaciones"},
        {"name": "facturas", "description": "Facturas emitidas (alimenta el dashboard)"},
        {"name": "stock", "description": "Inventario y movimientos de stock"},
        {"name": "remitos", "description": "Remitos de entrega"},
        {"name": "calidad", "description": "Control de calidad"},
        {"name": "reportes", "description": "Reportes y KPIs"},
        {"name": "notificaciones", "description": "Notificaciones internas"},
        {"name": "catalogos", "description": "Catálogos de solo lectura"},
    ],
)

# ── Rate limiting (slowapi): global 120/min, login 5/min (en routers/auth.py) ──
app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": "Demasiadas solicitudes. Esperá un momento y volvé a intentar."},
    )


app.add_middleware(SlowAPIMiddleware)

# ── Headers de seguridad en todas las respuestas ──
app.add_middleware(SecurityHeadersMiddleware)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Log errores y devuelve detalle en desarrollo."""
    logger.exception("Error: %s", exc)
    detail = str(exc) if os.getenv("DEBUG") or not os.getenv("RAILWAY_ENVIRONMENT") else "Error interno"
    return JSONResponse(status_code=500, content={"detail": detail})

# CORS: en producción Railway, configurar ALLOWED_ORIGINS con la URL de Vercel
_default_origins = "http://localhost:3000,http://localhost:5173"
ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", _default_origins).split(",") if o.strip()]
# Swagger (/docs) corre en el mismo origen: añadir URL del backend para que funcione
if domain := os.getenv("RAILWAY_PUBLIC_DOMAIN"):
    backend_url = f"https://{domain}"
    if backend_url not in ALLOWED_ORIGINS:
        ALLOWED_ORIGINS.append(backend_url)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}


app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(roles.router)
app.include_router(clientes.router)
app.include_router(razones_sociales.router)
app.include_router(ordenes.router)
app.include_router(produccion.router)
app.include_router(dashboard.router)
app.include_router(presupuestos.router)
app.include_router(facturas.router)
app.include_router(stock.router)
app.include_router(remitos.router)
app.include_router(calidad.router)
app.include_router(reportes.router)
app.include_router(notificaciones.router)
app.include_router(catalogos.router)
