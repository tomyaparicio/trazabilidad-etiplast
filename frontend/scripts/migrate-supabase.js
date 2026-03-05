/**
 * Migración para agregar la columna transporte a Supabase.
 * Ejecutar: npm run migrate (desde la carpeta frontend)
 *
 * Agrega en frontend/.env.local:
 *   DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
 *
 * Obtén la URL de: Supabase Dashboard > Settings > Database > Connection string (URI)
 */
require("dotenv").config({ path: ".env.local" });
const { Client } = require("pg");

const DATABASE_URL =
  process.env.DATABASE_URL ||
  process.env.SUPABASE_DB_URL;

if (!DATABASE_URL) {
  console.error(`
❌ Falta DATABASE_URL o SUPABASE_DB_URL

Agrega en frontend/.env.local:
  DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres

Obtén la URL de: Supabase Dashboard > Settings > Database > Connection string (URI)
`);
  process.exit(1);
}

// Asegurar formato postgresql:// para pg
const connectionString = DATABASE_URL.startsWith("postgresql://")
  ? DATABASE_URL
  : DATABASE_URL.replace("postgres://", "postgresql://");

async function migrate() {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    console.log("Conectado a la base de datos...\n");

    await client.query(
      "ALTER TABLE clientes ADD COLUMN IF NOT EXISTS transporte TEXT"
    );
    console.log("✓ Columna 'transporte' agregada correctamente");
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

migrate();
