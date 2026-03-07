from sqlalchemy import Column, Integer, String, Numeric, DateTime, Boolean, func
from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=False)
    is_active = Column(Boolean, default=True)
    role = Column(String, default="user")

    def to_dict(self):
        return {
            "id": self.id,
            "email": self.email,
            "is_active": self.is_active,
            "role": self.role,
        }


class Cliente(Base):
    __tablename__ = "clientes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    id_cliente = Column(Integer, unique=True, index=True)
    marca = Column(String, index=True)
    rubro = Column(String, index=True)
    razon_social = Column(String)
    domicilio = Column(String)
    localidad = Column(String)
    provincia = Column(String, index=True)
    pais = Column(String, default="Argentina")
    cuit = Column(String)
    telefono = Column(String)
    producto = Column(String)
    volumen_cantidad = Column(Numeric)
    volumen_unidad = Column(String)
    lamina = Column(String)
    muestra = Column(String)
    alto = Column(Numeric)
    cilindro = Column(Numeric)
    cierre = Column(Numeric)
    envase = Column(String)
    observaciones = Column(String)
    transporte = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    def to_dict(self):
        return {
            "id": self.id,
            "id_cliente": self.id_cliente,
            "marca": self.marca,
            "rubro": self.rubro,
            "razon_social": self.razon_social,
            "domicilio": self.domicilio,
            "localidad": self.localidad,
            "provincia": self.provincia,
            "pais": self.pais,
            "cuit": self.cuit,
            "telefono": self.telefono,
            "producto": self.producto,
            "volumen_cantidad": float(self.volumen_cantidad) if self.volumen_cantidad else None,
            "volumen_unidad": self.volumen_unidad,
            "lamina": self.lamina,
            "muestra": self.muestra,
            "alto": float(self.alto) if self.alto else None,
            "cilindro": float(self.cilindro) if self.cilindro else None,
            "cierre": float(self.cierre) if self.cierre else None,
            "envase": self.envase,
            "observaciones": self.observaciones,
            "transporte": self.transporte,
        }
