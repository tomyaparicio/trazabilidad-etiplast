"""Rutas de administración de usuarios y catálogos (solo admin)."""
import logging
import re
import unicodedata

import bcrypt
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session
from typing import Optional

from database import get_db
from models import User, Rubro, Cliente, Envase, ClienteProducto, Maquina
from dependencies import verify_admin

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/admin", tags=["admin"])


class CreateUserRequest(BaseModel):
    email: str
    password: str
    nombre: Optional[str] = None
    apellido: Optional[str] = None
    role: str = "user"


class UpdateUserRequest(BaseModel):
    nombre: Optional[str] = None
    apellido: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


@router.get("/usuarios", summary="Listar usuarios")
def listar_usuarios(
    admin: dict = Depends(verify_admin),
    db: Session = Depends(get_db),
):
    usuarios = db.query(User).order_by(User.id).all()
    return [u.to_dict() for u in usuarios]


@router.post("/usuarios", summary="Crear usuario")
def crear_usuario(
    data: CreateUserRequest,
    admin: dict = Depends(verify_admin),
    db: Session = Depends(get_db),
):
    email = (data.email or "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="El email es requerido")
    if not data.password or len(data.password) < 6:
        raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 6 caracteres")
    if data.role not in ("admin", "user", "operario"):
        raise HTTPException(status_code=400, detail="El rol debe ser 'admin', 'user' u 'operario'")
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=400, detail="El usuario ya existe")

    hashed = _hash_password(data.password)
    user = User(
        email=email,
        hashed_password=hashed,
        nombre=(data.nombre or "").strip() or None,
        apellido=(data.apellido or "").strip() or None,
        role=data.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    logger.info("Admin %s creó usuario: %s (rol=%s)", admin["email"], email, data.role)
    return user.to_dict()


@router.put("/usuarios/{user_id}", summary="Actualizar usuario")
def actualizar_usuario(
    user_id: int,
    data: UpdateUserRequest,
    admin: dict = Depends(verify_admin),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if data.nombre is not None:
        user.nombre = data.nombre.strip() or None
    if data.apellido is not None:
        user.apellido = data.apellido.strip() or None
    if data.role is not None:
        if data.role not in ("admin", "user", "operario"):
            raise HTTPException(status_code=400, detail="El rol debe ser 'admin', 'user' u 'operario'")
        user.role = data.role
    if data.is_active is not None:
        user.is_active = data.is_active
    db.commit()
    db.refresh(user)
    logger.info("Admin %s actualizó usuario %s: role=%s, active=%s", admin["email"], user.email, user.role, user.is_active)
    return user.to_dict()


# ─────────────────────────────────────────────────────────────────────────────
# Rubros
# ─────────────────────────────────────────────────────────────────────────────

class RubroRequest(BaseModel):
    nombre: str


@router.get("/rubros", summary="Listar rubros con cantidad de clientes")
def listar_rubros(
    admin: dict = Depends(verify_admin),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(Rubro, func.count(Cliente.id).label("cantidad"))
        .outerjoin(Cliente, Cliente.rubro_id == Rubro.id)
        .group_by(Rubro.id)
        .order_by(Rubro.nombre)
        .all()
    )
    return [
        {
            "id": r.id,
            "nombre": r.nombre,
            "cantidad_clientes": cantidad,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r, cantidad in rows
    ]


@router.post("/rubros", summary="Crear rubro", status_code=201)
def crear_rubro(
    data: RubroRequest,
    admin: dict = Depends(verify_admin),
    db: Session = Depends(get_db),
):
    nombre = data.nombre.strip()
    if not nombre:
        raise HTTPException(status_code=400, detail="El nombre es requerido")
    if db.query(Rubro).filter(func.lower(Rubro.nombre) == nombre.lower()).first():
        raise HTTPException(status_code=400, detail="Ya existe un rubro con ese nombre")
    rubro = Rubro(nombre=nombre)
    db.add(rubro)
    db.commit()
    db.refresh(rubro)
    return {"id": rubro.id, "nombre": rubro.nombre, "cantidad_clientes": 0}


@router.put("/rubros/{rubro_id}", summary="Renombrar rubro")
def renombrar_rubro(
    rubro_id: int,
    data: RubroRequest,
    admin: dict = Depends(verify_admin),
    db: Session = Depends(get_db),
):
    rubro = db.query(Rubro).filter(Rubro.id == rubro_id).first()
    if not rubro:
        raise HTTPException(status_code=404, detail="Rubro no encontrado")
    nombre = data.nombre.strip()
    if not nombre:
        raise HTTPException(status_code=400, detail="El nombre es requerido")
    existente = db.query(Rubro).filter(func.lower(Rubro.nombre) == nombre.lower(), Rubro.id != rubro_id).first()
    if existente:
        raise HTTPException(status_code=400, detail="Ya existe un rubro con ese nombre")
    rubro.nombre = nombre
    db.commit()
    db.refresh(rubro)
    return {"id": rubro.id, "nombre": rubro.nombre}


@router.delete("/rubros/{rubro_id}", summary="Eliminar rubro (opcionalmente mover clientes)")
def eliminar_rubro(
    rubro_id: int,
    mover_a: Optional[int] = None,
    admin: dict = Depends(verify_admin),
    db: Session = Depends(get_db),
):
    rubro = db.query(Rubro).filter(Rubro.id == rubro_id).first()
    if not rubro:
        raise HTTPException(status_code=404, detail="Rubro no encontrado")

    clientes_count = db.query(func.count(Cliente.id)).filter(Cliente.rubro_id == rubro_id).scalar()

    if clientes_count > 0:
        if mover_a is None:
            raise HTTPException(
                status_code=409,
                detail=f"El rubro tiene {clientes_count} cliente(s). Indicá ?mover_a=<id> para moverlos antes de eliminar."
            )
        destino = db.query(Rubro).filter(Rubro.id == mover_a).first()
        if not destino:
            raise HTTPException(status_code=404, detail="Rubro destino no encontrado")
        db.query(Cliente).filter(Cliente.rubro_id == rubro_id).update({"rubro_id": mover_a})

    db.delete(rubro)
    db.commit()
    logger.info("Admin %s eliminó rubro '%s' (id=%s)", admin["email"], rubro.nombre, rubro_id)
    return {"ok": True}


# ─────────────────────────────────────────────────────────────────────────────
# Envases
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/envases", summary="Listar envases con cantidad de productos")
def listar_envases(
    admin: dict = Depends(verify_admin),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(Envase, func.count(ClienteProducto.id).label("cantidad"))
        .outerjoin(ClienteProducto, func.lower(func.trim(ClienteProducto.envase)) == func.lower(Envase.nombre))
        .group_by(Envase.id)
        .order_by(Envase.nombre)
        .all()
    )
    return [
        {
            "id": e.id,
            "nombre": e.nombre,
            "cantidad_productos": cantidad,
            "created_at": e.created_at.isoformat() if e.created_at else None,
        }
        for e, cantidad in rows
    ]


@router.post("/envases", summary="Crear envase", status_code=201)
def crear_envase(
    data: RubroRequest,
    admin: dict = Depends(verify_admin),
    db: Session = Depends(get_db),
):
    nombre = data.nombre.strip()
    if not nombre:
        raise HTTPException(status_code=400, detail="El nombre es requerido")
    if db.query(Envase).filter(func.lower(Envase.nombre) == nombre.lower()).first():
        raise HTTPException(status_code=400, detail="Ya existe un envase con ese nombre")
    envase = Envase(nombre=nombre)
    db.add(envase)
    db.commit()
    db.refresh(envase)
    return {"id": envase.id, "nombre": envase.nombre, "cantidad_productos": 0}


@router.put("/envases/{envase_id}", summary="Renombrar envase")
def renombrar_envase(
    envase_id: int,
    data: RubroRequest,
    admin: dict = Depends(verify_admin),
    db: Session = Depends(get_db),
):
    envase = db.query(Envase).filter(Envase.id == envase_id).first()
    if not envase:
        raise HTTPException(status_code=404, detail="Envase no encontrado")
    nombre = data.nombre.strip()
    if not nombre:
        raise HTTPException(status_code=400, detail="El nombre es requerido")
    existente = db.query(Envase).filter(func.lower(Envase.nombre) == nombre.lower(), Envase.id != envase_id).first()
    if existente:
        raise HTTPException(status_code=400, detail="Ya existe un envase con ese nombre")
    envase.nombre = nombre
    db.commit()
    db.refresh(envase)
    return {"id": envase.id, "nombre": envase.nombre}


@router.delete("/envases/{envase_id}", summary="Eliminar envase")
def eliminar_envase(
    envase_id: int,
    admin: dict = Depends(verify_admin),
    db: Session = Depends(get_db),
):
    envase = db.query(Envase).filter(Envase.id == envase_id).first()
    if not envase:
        raise HTTPException(status_code=404, detail="Envase no encontrado")
    db.delete(envase)
    db.commit()
    logger.info("Admin %s eliminó envase '%s' (id=%s)", admin["email"], envase.nombre, envase_id)
    return {"ok": True}


# ─── Máquinas ─────────────────────────────────────────────────────────────────

def _siguiente_codigo_maquina(db: Session, nombre: str) -> str:
    """Código interno único derivado del nombre (no se muestra en la UI)."""
    nfkd = unicodedata.normalize("NFKD", nombre or "")
    ascii_str = "".join(c for c in nfkd if not unicodedata.combining(c))
    base = re.sub(r"[^a-zA-Z0-9]+", "-", ascii_str).strip("-").lower()[:36]
    if not base:
        base = "maq"
    codigo = base
    n = 0
    while db.query(Maquina).filter(Maquina.codigo == codigo).first():
        n += 1
        codigo = f"{base}-{n}"
    return codigo[:50]


@router.get("/maquinas", summary="Listar máquinas")
def listar_maquinas(
    tipo: Optional[str] = None,
    _admin: dict = Depends(verify_admin),
    db: Session = Depends(get_db),
):
    q = db.query(Maquina)
    if tipo:
        q = q.filter(Maquina.tipo == tipo)
    return [m.to_dict() for m in q.order_by(Maquina.nombre).all()]


@router.post("/maquinas", summary="Crear máquina", status_code=201)
def crear_maquina(
    datos: dict,
    admin: dict = Depends(verify_admin),
    db: Session = Depends(get_db),
):
    nombre = (datos.get("nombre") or "").strip()
    tipo   = (datos.get("tipo") or "impresion").strip()
    if not nombre:
        raise HTTPException(status_code=400, detail="nombre es requerido")
    codigo = _siguiente_codigo_maquina(db, nombre)
    m = Maquina(codigo=codigo, nombre=nombre, tipo=tipo, activa=True)
    db.add(m)
    db.commit()
    db.refresh(m)
    logger.info("Admin %s creó máquina '%s' (id=%s)", admin["email"], m.nombre, m.id)
    return m.to_dict()


@router.put("/maquinas/{maquina_id}", summary="Actualizar máquina")
def actualizar_maquina(
    maquina_id: int,
    datos: dict,
    admin: dict = Depends(verify_admin),
    db: Session = Depends(get_db),
):
    m = db.query(Maquina).filter(Maquina.id == maquina_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Máquina no encontrada")
    for campo in ("nombre", "tipo"):
        if campo in datos and datos[campo]:
            setattr(m, campo, datos[campo].strip())
    if "activa" in datos:
        m.activa = bool(datos["activa"])
    db.commit()
    db.refresh(m)
    return m.to_dict()


@router.delete("/maquinas/{maquina_id}", summary="Eliminar máquina")
def eliminar_maquina(
    maquina_id: int,
    admin: dict = Depends(verify_admin),
    db: Session = Depends(get_db),
):
    m = db.query(Maquina).filter(Maquina.id == maquina_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Máquina no encontrada")
    db.delete(m)
    db.commit()
    logger.info("Admin %s eliminó máquina '%s' (id=%s)", admin["email"], m.nombre, maquina_id)
    return {"ok": True}
