import os
from dotenv import load_dotenv

load_dotenv()

# SECRET_KEY o JWT_SECRET para JWT
SECRET_KEY = os.getenv("SECRET_KEY") or os.getenv("JWT_SECRET")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = int(os.getenv("ACCESS_TOKEN_EXPIRE_HOURS", "168"))  # 7 días

if not SECRET_KEY:
    raise ValueError(
        "SECRET_KEY o JWT_SECRET debe estar configurada en Railway. "
        "Variables → Add Variable → SECRET_KEY = tu-clave-secreta-muy-larga"
    )
