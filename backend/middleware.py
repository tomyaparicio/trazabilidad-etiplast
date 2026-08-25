"""
Middleware de seguridad — Etiplast ERP
=======================================
- SecurityHeadersMiddleware: headers de seguridad en todas las respuestas.
- limiter: rate limiter compartido (slowapi) con key por IP real detrás de proxy.
"""
import os

from fastapi import Request
from slowapi import Limiter
from starlette.middleware.base import BaseHTTPMiddleware


def obtener_ip_cliente(request: Request) -> str:
    """
    IP real del cliente para el rate limiter.

    X-Forwarded-For es una lista "cliente, proxy1, proxy2, ...". El PRIMER valor
    lo controla el atacante (puede enviar cualquier IP), así que usarlo permitiría
    evadir el rate limit rotando IPs falsas. El proxy de Railway APENDEA la IP real
    del hop entrante al FINAL de la cadena, por lo que tomamos el ÚLTIMO valor: es
    el único hop de confianza. Fallback a la conexión directa.
    """
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[-1].strip()
    return request.client.host if request.client else "desconocido"


# Limiter compartido: lo importan main.py (registro global) y routers/auth.py (login)
limiter = Limiter(key_func=obtener_ip_cliente, default_limits=["120/minute"])


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Agrega headers de seguridad estándar a todas las respuestas."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        # HSTS solo en producción (Railway): en local rompe el desarrollo por http
        if os.getenv("RAILWAY_ENVIRONMENT"):
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        # Respuestas de API y auth nunca deben cachearse
        path = request.url.path
        if path.startswith("/api") or path.startswith("/auth"):
            response.headers["Cache-Control"] = "no-store"
        return response
