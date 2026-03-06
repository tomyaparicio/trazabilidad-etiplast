import os
import logging
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from routers import clientes, dashboard, auth

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="ERP Etiplast API", version="1.0.0")


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Log errores y devuelve detalle en desarrollo."""
    logger.exception("Error: %s", exc)
    detail = str(exc) if os.getenv("DEBUG") or not os.getenv("RAILWAY_ENVIRONMENT") else "Error interno"
    return JSONResponse(status_code=500, content={"detail": detail})

# CORS: en producción Railway, configurar ALLOWED_ORIGINS con la URL de Vercel
_default_origins = "http://localhost:3000,http://localhost:5173"
ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", _default_origins).split(",") if o.strip()]

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
app.include_router(clientes.router)
app.include_router(dashboard.router)
