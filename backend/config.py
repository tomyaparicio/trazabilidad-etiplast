import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("SUPABASE_URL y SUPABASE_KEY deben estar configuradas en .env")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Cliente con service role para operaciones admin (carga de datos)
def get_admin_client() -> Client:
    if not SUPABASE_SERVICE_KEY:
        raise ValueError("SUPABASE_SERVICE_KEY necesaria para operaciones admin")
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
