import os
import logging
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from routers import clientes, dashboard, auth, admin

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
        {"name": "dashboard", "description": "Estadísticas y filtros"},
    ],
)


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
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}


app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(clientes.router)
app.include_router(dashboard.router)
