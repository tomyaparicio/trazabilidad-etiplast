import os
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import clientes, dashboard, auth

load_dotenv()

app = FastAPI(title="ERP Etiplast API", version="1.0.0")

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
