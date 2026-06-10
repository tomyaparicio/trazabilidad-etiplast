import os
from dotenv import load_dotenv

load_dotenv()

# SECRET_KEY o JWT_SECRET para JWT
SECRET_KEY = os.getenv("SECRET_KEY") or os.getenv("JWT_SECRET")
if not SECRET_KEY:
    if os.getenv("RAILWAY_ENVIRONMENT"):
        raise ValueError("SECRET_KEY o JWT_SECRET debe estar configurada en Railway")
    # Desarrollo local: clave por defecto (no usar en producción)
    SECRET_KEY = "dev-local-cambiar-en-produccion"

# En producción la clave debe ser fuerte: mínimo 32 caracteres
if os.getenv("RAILWAY_ENVIRONMENT") and len(SECRET_KEY) < 32:
    raise ValueError(
        "SECRET_KEY demasiado corta para producción: debe tener al menos 32 caracteres. "
        "Generá una con: python -c \"import secrets; print(secrets.token_urlsafe(48))\""
    )

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = int(os.getenv("ACCESS_TOKEN_EXPIRE_HOURS", "168"))  # 7 días
