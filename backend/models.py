from sqlalchemy import Column, Integer, String, Numeric, DateTime, func
from database import Base


class Cliente(Base):
    __tablename__ = "clientes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    numero_cliente = Column(Integer, index=True)
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
    lamina = Column(String)
    muestra = Column(String)
    alto = Column(Numeric)
    cilindro = Column(Numeric)
    cierre = Column(String)
    envase = Column(String)
    lamina_2 = Column(String)
    cilindro_2 = Column(Numeric)
    observaciones = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    def to_dict(self):
        return {
            "id": self.id,
            "numero_cliente": self.numero_cliente,
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
            "lamina": self.lamina,
            "muestra": self.muestra,
            "alto": float(self.alto) if self.alto else None,
            "cilindro": float(self.cilindro) if self.cilindro else None,
            "cierre": self.cierre,
            "envase": self.envase,
            "lamina_2": self.lamina_2,
            "cilindro_2": float(self.cilindro_2) if self.cilindro_2 else None,
            "observaciones": self.observaciones,
        }
