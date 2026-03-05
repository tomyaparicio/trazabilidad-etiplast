"""Dependencias compartidas (auth, etc.)."""
import os
import httpx
from fastapi import Header, HTTPException

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")


async def verify_token(authorization: str = Header(...)):
    """Verifica el token JWT de Supabase via HTTP."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token inválido")
    token = authorization.replace("Bearer ", "")
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{SUPABASE_URL}/auth/v1/user",
                headers={
                    "Authorization": f"Bearer {token}",
                    "apikey": SUPABASE_KEY,
                },
            )
        if response.status_code != 200:
            raise HTTPException(status_code=401, detail="Token inválido o expirado")
        return response.json()
    except httpx.HTTPError:
        raise HTTPException(status_code=401, detail="Error verificando token")
