import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Clientes from './pages/Clientes'
import { hasSupabaseConfig } from './lib/supabase'

function AppRoutes() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="text-gray-500 text-lg" aria-live="polite">Cargando…</div>
      </div>
    )
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to="/" replace /> : <Login />}
      />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/clientes" element={<Clientes />} />
      </Route>
    </Routes>
  )
}

function ConfigError() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="bg-white rounded-lg shadow-lg p-6 max-w-md text-center">
        <h1 className="text-xl font-semibold text-gray-800 mb-2">Configuración requerida</h1>
        <p className="text-gray-600 mb-4">
          Faltan las variables de entorno <code className="bg-gray-100 px-1 rounded">VITE_SUPABASE_URL</code> y{' '}
          <code className="bg-gray-100 px-1 rounded">VITE_SUPABASE_ANON_KEY</code>.
        </p>
        <p className="text-sm text-gray-500">
          En Vercel: Project Settings → Environment Variables → añade ambas variables y vuelve a desplegar.
        </p>
      </div>
    </div>
  )
}

export default function App() {
  if (!hasSupabaseConfig) {
    return <ConfigError />
  }
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
