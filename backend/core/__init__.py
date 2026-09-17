"""Infraestructura: lo que sostiene la app pero no es dominio.

  config      — variables de entorno
  database    — engine, sesión y Base declarativa
  security    — verify_token, require_permiso (era dependencies.py)
  rbac        — catálogo de vistas y acciones
  middleware  — headers de seguridad y rate limiter
"""
