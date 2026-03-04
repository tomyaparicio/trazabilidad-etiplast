import os
import httpx
from fastapi import FastAPI, HTTPException, Query, Header, Depends, Body
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from typing import Optional, Dict, Any
from dotenv import load_dotenv
from database import get_db
from models import Cliente

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

app = FastAPI(title="ERP Etiplast API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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


@app.get("/api/clientes")
async def listar_clientes(
    authorization: str = Header(...),
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    rubro: Optional[str] = Query(None),
    provincia: Optional[str] = Query(None),
):
    await verify_token(authorization)

    query = db.query(Cliente)

    if search:
        search_filter = f"%{search}%"
        query = query.filter(
            or_(
                Cliente.marca.ilike(search_filter),
                Cliente.razon_social.ilike(search_filter),
                Cliente.localidad.ilike(search_filter),
                Cliente.producto.ilike(search_filter),
            )
        )

    if rubro:
        query = query.filter(Cliente.rubro == rubro)

    if provincia:
        query = query.filter(Cliente.provincia == provincia)

    total = query.count()
    offset = (page - 1) * per_page
    clientes = query.order_by(Cliente.numero_cliente).offset(offset).limit(per_page).all()

    return {
        "data": [c.to_dict() for c in clientes],
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": -(-total // per_page) if total else 0,
    }


@app.get("/api/clientes/{cliente_id}")
async def obtener_cliente(
    cliente_id: int,
    authorization: str = Header(...),
    db: Session = Depends(get_db),
):
    await verify_token(authorization)

    cliente = db.query(Cliente).filter(Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    return cliente.to_dict()


@app.get("/api/dashboard/stats")
async def dashboard_stats(
    authorization: str = Header(...),
    db: Session = Depends(get_db),
):
    await verify_token(authorization)

    total_clientes = db.query(func.count(Cliente.id)).scalar()

    rubros_query = (
        db.query(Cliente.rubro, func.count(Cliente.id))
        .group_by(Cliente.rubro)
        .order_by(func.count(Cliente.id).desc())
        .all()
    )
    rubros = [
        {"nombre": r or "Sin rubro", "cantidad": c}
        for r, c in rubros_query
    ]

    provincias_query = (
        db.query(Cliente.provincia, func.count(Cliente.id))
        .group_by(Cliente.provincia)
        .order_by(func.count(Cliente.id).desc())
        .limit(10)
        .all()
    )
    provincias = [
        {"nombre": p or "Sin provincia", "cantidad": c}
        for p, c in provincias_query
    ]

    return {
        "total_clientes": total_clientes,
        "rubros": rubros,
        "provincias": provincias,
    }


@app.get("/api/filtros")
async def obtener_filtros(
    authorization: str = Header(...),
    db: Session = Depends(get_db),
):
    await verify_token(authorization)

    rubros = sorted([
        r[0] for r in db.query(Cliente.rubro).distinct().all()
        if r[0]
    ])
    provincias = sorted([
        p[0] for p in db.query(Cliente.provincia).distinct().all()
        if p[0]
    ])

    return {"rubros": rubros, "provincias": provincias}


@app.put("/api/clientes/{cliente_id}")
async def actualizar_cliente(
    cliente_id: int,
    authorization: str = Header(...),
    db: Session = Depends(get_db),
    datos: Dict[str, Any] = Body(...),
):
    await verify_token(authorization)

    cliente = db.query(Cliente).filter(Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    campos_permitidos = [
        "numero_cliente", "marca", "rubro", "razon_social", "domicilio",
        "localidad", "provincia", "pais", "cuit", "telefono", "producto",
        "lamina", "muestra", "alto", "cilindro", "cierre", "envase",
        "lamina_2", "cilindro_2", "observaciones",
    ]

    for campo in campos_permitidos:
        if campo in datos:
            setattr(cliente, campo, datos[campo])

    db.commit()
    db.refresh(cliente)
    return cliente.to_dict()
