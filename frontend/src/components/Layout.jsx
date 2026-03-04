import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const navigation = [
  {
    name: 'Panel de Control',
    to: '/',
    end: true,
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 013.5 18v-2.25z" />
      </svg>
    ),
  },
  {
    name: 'Clientes',
    to: '/clientes',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
      </svg>
    ),
  },
]

export default function Layout() {
  const { user, signOut } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()

  const pageTitle = location.pathname === '/clientes' ? 'Clientes' : 'Panel de Control'

  return (
    <div className="flex h-screen bg-[var(--bg-app)]">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Cerrar menú"
          className="fixed inset-0 bg-black/40 z-40 lg:hidden backdrop-blur-sm focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-sidebar)]"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-[var(--bg-sidebar)] flex flex-col transition-[transform] duration-200 ease-out lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
        aria-label="Navegación principal"
      >
        <div className="h-14 flex items-center gap-3 px-5 border-b border-white/[0.06]">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center font-semibold text-white text-sm bg-white/10" aria-hidden>
            E
          </div>
          <span className="text-[15px] font-semibold text-white tracking-tight">ETIPLAST</span>
        </div>

        <nav className="flex-1 px-3 py-5 space-y-0.5" aria-label="Menú principal">
          {navigation.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-[color,background-color] duration-150 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-sidebar)] ${
                  isActive
                    ? 'bg-white/10 text-white'
                    : 'text-neutral-400 hover:bg-white/5 hover:text-neutral-200'
                }`
              }
            >
              {item.icon}
              {item.name}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-white/[0.06]">
          <div className="flex items-center gap-3 p-2 rounded-lg">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium text-white bg-white/10 shrink-0" aria-hidden>
              {user?.email?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] text-white truncate font-medium">{user?.email?.split('@')[0]}</p>
              <p className="text-[11px] text-neutral-500 truncate">{user?.email}</p>
            </div>
            <button
              type="button"
              onClick={signOut}
              aria-label="Cerrar sesión"
              className="p-2 rounded-lg text-neutral-500 hover:bg-white/5 hover:text-red-400 transition-colors focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-sidebar)]"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="h-14 bg-white/80 backdrop-blur-md border-b border-[var(--border-subtle)] flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Abrir menú de navegación"
              className="lg:hidden p-2 -ml-2 rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 transition-colors focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>
            <h1 className="text-base font-semibold text-[var(--text-primary)]">{pageTitle}</h1>
          </div>
          <time className="text-xs text-[var(--text-muted)] hidden sm:block" dateTime={new Date().toISOString()}>
            {new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date())}
          </time>
        </header>

        <main id="main-content" className="flex-1 overflow-auto overscroll-behavior-contain" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
