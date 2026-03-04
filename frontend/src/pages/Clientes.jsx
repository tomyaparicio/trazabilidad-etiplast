import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const RUBRO_COLORS = {
  'Agua': 'bg-cyan-50 text-cyan-700',
  'Jugos-Gaseosas': 'bg-orange-50 text-orange-700',
  'Limpieza': 'bg-emerald-50 text-emerald-700',
  'Agroquimicos': 'bg-red-50 text-red-700',
  'Aceite': 'bg-amber-50 text-amber-700',
  'Otros': 'bg-neutral-100 text-neutral-600',
}

const FIELDS = [
  { key: 'numero_cliente', label: 'N. Cliente', type: 'number', group: 'general' },
  { key: 'marca', label: 'Marca', group: 'general' },
  { key: 'rubro', label: 'Rubro', group: 'general' },
  { key: 'razon_social', label: 'Razón Social', group: 'general' },
  { key: 'domicilio', label: 'Domicilio', group: 'ubicacion' },
  { key: 'localidad', label: 'Localidad', group: 'ubicacion' },
  { key: 'provincia', label: 'Provincia', group: 'ubicacion' },
  { key: 'pais', label: 'País', group: 'ubicacion' },
  { key: 'cuit', label: 'CUIT', group: 'contacto' },
  { key: 'telefono', label: 'Teléfono', group: 'contacto' },
  { key: 'producto', label: 'Producto', group: 'producto' },
  { key: 'lamina', label: 'Lámina', group: 'producto' },
  { key: 'muestra', label: 'Muestra', group: 'producto' },
  { key: 'alto', label: 'Alto', type: 'number', group: 'producto' },
  { key: 'cilindro', label: 'Cilindro', type: 'number', group: 'producto' },
  { key: 'cierre', label: 'Cierre', group: 'producto' },
  { key: 'envase', label: 'Envase', group: 'producto' },
  { key: 'lamina_2', label: 'Lámina 2', group: 'producto' },
  { key: 'cilindro_2', label: 'Cilindro 2', type: 'number', group: 'producto' },
  { key: 'observaciones', label: 'Observaciones', group: 'extra' },
]

const GROUP_LABELS = {
  general: 'Datos Generales',
  ubicacion: 'Ubicación',
  contacto: 'Contacto',
  producto: 'Producto / Técnico',
  extra: 'Observaciones',
}

const CAMPOS_EDITABLES = [
  'numero_cliente', 'marca', 'rubro', 'razon_social', 'domicilio', 'localidad', 'provincia', 'pais',
  'cuit', 'telefono', 'producto', 'lamina', 'muestra', 'alto', 'cilindro', 'cierre', 'envase',
  'lamina_2', 'cilindro_2', 'observaciones',
]

export default function Clientes() {
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [rubro, setRubro] = useState('')
  const [provincia, setProvincia] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [total, setTotal] = useState(0)
  const [filtros, setFiltros] = useState({ rubros: [], provincias: [] })
  const [selectedCliente, setSelectedCliente] = useState(null)
  const [editing, setEditing] = useState(false)
  const [editData, setEditData] = useState({})
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  useEffect(() => { fetchFiltros() }, [])
  useEffect(() => { fetchClientes() }, [page, search, rubro, provincia])

  const fetchFiltros = async () => {
    try {
      const { data, error } = await supabase.rpc('get_filtros')
      if (error) throw error
      setFiltros(data)
    } catch (err) { console.error(err) }
  }

  const fetchClientes = useCallback(async () => {
    setLoading(true)
    try {
      const perPage = 20
      const from = (page - 1) * perPage
      const to = from + perPage - 1

      let query = supabase
        .from('clientes')
        .select('*', { count: 'exact' })
        .order('numero_cliente')
        .range(from, to)

      if (search) {
        const term = `%${search}%`
        query = query.or(`marca.ilike.${term},razon_social.ilike.${term},localidad.ilike.${term},producto.ilike.${term}`)
      }
      if (rubro) query = query.eq('rubro', rubro)
      if (provincia) query = query.eq('provincia', provincia)

      const { data, count, error } = await query
      if (error) throw error

      setClientes(data || [])
      setTotal(count || 0)
      setTotalPages(count ? Math.ceil(count / perPage) : 0)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }, [page, search, rubro, provincia])

  const openDetail = (cliente) => {
    setSelectedCliente(cliente)
    setEditData({ ...cliente })
    setEditing(false)
    setSaveMsg('')
  }

  const handleRowKeyDown = (e, cliente) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      openDetail(cliente)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setSaveMsg('')
    try {
      const numericFields = ['numero_cliente', 'alto', 'cilindro', 'cilindro_2']
      const updates = {}
      CAMPOS_EDITABLES.forEach(campo => {
        if (campo in editData) {
          let val = editData[campo] || null
          if (val !== null && numericFields.includes(campo)) val = Number(val)
          updates[campo] = val
        }
      })
      const { data: updated, error } = await supabase
        .from('clientes')
        .update(updates)
        .eq('id', selectedCliente.id)
        .select()
        .single()
      if (error) throw error
      setSelectedCliente(updated)
      setEditData({ ...updated })
      setEditing(false)
      setSaveMsg('success')
      setClientes(prev => prev.map(c => c.id === updated.id ? updated : c))
      setTimeout(() => setSaveMsg(''), 3000)
    } catch {
      setSaveMsg('error')
    } finally {
      setSaving(false)
    }
  }

  const getRubroColor = (r) => RUBRO_COLORS[r] || 'bg-neutral-100 text-neutral-600'

  useEffect(() => {
    if (!selectedCliente) return
    const handleEscape = (e) => {
      if (e.key === 'Escape') setSelectedCliente(null)
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [selectedCliente])

  const nf = new Intl.NumberFormat('es-AR')

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1200px] mx-auto">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)] bg-white border border-[var(--border-subtle)] px-3 py-1.5 rounded-lg tabular-nums">
          {nf.format(total)} clientes
        </span>
        {rubro && (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-violet-50 text-violet-700 px-3 py-1.5 rounded-lg">
            {rubro}
            <button type="button" onClick={() => { setRubro(''); setPage(1) }} aria-label={`Quitar filtro rubro ${rubro}`} className="ml-0.5 hover:text-violet-900 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:rounded">×</button>
          </span>
        )}
        {provincia && (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-cyan-50 text-cyan-700 px-3 py-1.5 rounded-lg">
            {provincia}
            <button type="button" onClick={() => { setProvincia(''); setPage(1) }} aria-label={`Quitar filtro provincia ${provincia}`} className="ml-0.5 hover:text-cyan-900 focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:rounded">×</button>
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-[260px] relative">
          <label htmlFor="search-clientes" className="sr-only">Buscar clientes</label>
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            id="search-clientes"
            name="search"
            type="search"
            autoComplete="off"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="Buscar marca, razón social, localidad…"
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-[var(--border-muted)] rounded-xl text-sm text-[var(--text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:border-[var(--accent)] transition-[box-shadow,border-color] placeholder:text-[var(--text-muted)]"
          />
        </div>
        <div>
          <label htmlFor="filter-rubro" className="sr-only">Filtrar por rubro</label>
          <select id="filter-rubro" value={rubro} onChange={(e) => { setRubro(e.target.value); setPage(1) }}
            className="px-4 py-2.5 bg-white border border-[var(--border-muted)] rounded-xl text-sm text-[var(--text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:border-[var(--accent)] min-w-[160px]"
            aria-label="Filtrar por rubro"
          >
            <option value="">Todos los rubros</option>
            {filtros.rubros.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="filter-provincia" className="sr-only">Filtrar por provincia</label>
          <select id="filter-provincia" value={provincia} onChange={(e) => { setProvincia(e.target.value); setPage(1) }}
            className="px-4 py-2.5 bg-white border border-[var(--border-muted)] rounded-xl text-sm text-[var(--text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:border-[var(--accent)] min-w-[160px]"
            aria-label="Filtrar por provincia"
          >
            <option value="">Todas las provincias</option>
            {filtros.provincias.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-[var(--border-subtle)] overflow-hidden">
        <div className="overflow-x-auto" style={{ overscrollBehavior: 'contain' }}>
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border-subtle)]">
                {['N.', 'Marca', 'Rubro', 'Razón Social', 'Localidad', 'Provincia', 'Producto', ''].map(h => (
                  <th key={h} scope="col" className="text-left px-5 py-3 text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="px-5 py-20 text-center text-[var(--text-muted)] text-sm" aria-live="polite">
                  <svg className="animate-spin w-5 h-5 mx-auto mb-2" fill="none" viewBox="0 0 24 24" aria-hidden><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                  Cargando…
                </td></tr>
              ) : clientes.length === 0 ? (
                <tr><td colSpan={8} className="px-5 py-20 text-center text-[var(--text-muted)] text-sm">No se encontraron clientes</td></tr>
              ) : clientes.map((c) => (
                <tr
                  key={c.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openDetail(c)}
                  onKeyDown={(e) => handleRowKeyDown(e, c)}
                  className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-app)] cursor-pointer transition-colors group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-inset"
                >
                  <td className="px-5 py-3.5 text-sm font-mono text-[var(--text-muted)] tabular-nums">{c.numero_cliente}</td>
                  <td className="px-5 py-3.5 text-sm font-medium text-[var(--text-primary)]">{c.marca}</td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-medium ${getRubroColor(c.rubro)}`}>
                      {c.rubro}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-[var(--text-secondary)] min-w-0 truncate">{c.razon_social}</td>
                  <td className="px-5 py-3.5 text-sm text-[var(--text-secondary)] min-w-0 truncate">{c.localidad}</td>
                  <td className="px-5 py-3.5 text-sm text-[var(--text-secondary)] min-w-0 truncate">{c.provincia}</td>
                  <td className="px-5 py-3.5 text-sm text-[var(--text-muted)] max-w-[160px] truncate">{c.producto ?? ''}</td>
                  <td className="px-5 py-3.5">
                    <svg className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--accent)] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <nav className="flex items-center justify-between px-5 py-3 border-t border-[var(--border-subtle)]" aria-label="Paginación">
            <p className="text-xs text-[var(--text-muted)]">
              Página <span className="tabular-nums">{page}</span> de <span className="tabular-nums">{totalPages}</span>
            </p>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                aria-label="Página anterior"
                className="p-2 rounded-lg border border-[var(--border-muted)] hover:bg-[var(--bg-app)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
              >
                <svg className="w-4 h-4 text-[var(--text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const p = page <= 3 ? i + 1 : page + i - 2
                if (p < 1 || p > totalPages) return null
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPage(p)}
                    aria-label={p === page ? `Página ${p} (actual)` : `Ir a página ${p}`}
                    aria-current={p === page ? 'page' : undefined}
                    className={`w-9 h-9 rounded-lg text-xs font-medium transition-colors tabular-nums ${p === page ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-app)] border border-[var(--border-muted)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2'}`}
                  >
                    {p}
                  </button>
                )
              })}
              <button
                type="button"
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                aria-label="Página siguiente"
                className="p-2 rounded-lg border border-[var(--border-muted)] hover:bg-[var(--bg-app)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
              >
                <svg className="w-4 h-4 text-[var(--text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>
          </nav>
        )}
      </div>

      {selectedCliente && (
        <div
          className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedCliente(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
          style={{ overscrollBehavior: 'contain', contain: 'layout paint' }}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
            style={{ overscrollBehavior: 'contain' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)] shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[var(--accent)] flex items-center justify-center text-white font-semibold text-sm" aria-hidden>
                  {(editing ? editData.marca : selectedCliente.marca)?.[0]?.toUpperCase() || '?'}
                </div>
                <div>
                  <h2 id="modal-title" className="text-base font-semibold text-[var(--text-primary)]">{editing ? editData.marca : selectedCliente.marca}</h2>
                  <p className="text-xs text-[var(--text-muted)]">Cliente #{selectedCliente.numero_cliente}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!editing ? (
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-[var(--accent)] text-white rounded-lg text-sm font-medium hover:bg-[var(--accent-hover)] transition-colors focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" /></svg>
                    Editar
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => { setEditing(false); setEditData({ ...selectedCliente }) }}
                      className="px-4 py-2 border border-[var(--border-muted)] text-[var(--text-secondary)] rounded-lg text-sm font-medium hover:bg-[var(--bg-app)] transition-colors focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={saving}
                      className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
                    >
                      {saving ? (
                        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24" aria-hidden><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.5 12.75l6 6 9-13.5" /></svg>
                      )}
                      Guardar
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedCliente(null)}
                  aria-label="Cerrar modal"
                  className="p-2 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-app)] hover:text-[var(--text-primary)] transition-colors focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>

            {saveMsg === 'success' && (
              <div className="mx-6 mt-4 flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-xl text-sm" role="status" aria-live="polite">
                <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                Cliente actualizado correctamente
              </div>
            )}
            {saveMsg === 'error' && (
              <div className="mx-6 mt-4 flex items-center gap-2 p-3 bg-red-50 border border-red-100 text-red-600 rounded-xl text-sm" role="alert" aria-live="polite">
                <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
                Error al guardar. Verifica los datos e intenta de nuevo.
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6" style={{ overscrollBehavior: 'contain' }}>
              {Object.entries(GROUP_LABELS).map(([groupKey, groupLabel]) => {
                const groupFields = FIELDS.filter(f => f.group === groupKey)
                return (
                  <fieldset key={groupKey}>
                    <legend className="text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wider mb-3">{groupLabel}</legend>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                      {groupFields.map(field => (
                        <div key={field.key} className={field.key === 'observaciones' || field.key === 'producto' ? 'sm:col-span-2' : ''}>
                          <label htmlFor={`modal-${field.key}`} className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">{field.label}</label>
                          {editing ? (
                            <input
                              id={`modal-${field.key}`}
                              name={field.key}
                              type={field.type || 'text'}
                              inputMode={field.type === 'number' ? 'numeric' : undefined}
                              autoComplete="off"
                              value={editData[field.key] ?? ''}
                              onChange={(e) => setEditData(prev => ({ ...prev, [field.key]: e.target.value || null }))}
                              className="w-full px-3.5 py-2.5 bg-[var(--bg-app)] border border-[var(--border-muted)] rounded-lg text-sm text-[var(--text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:border-[var(--accent)] focus-visible:bg-white"
                            />
                          ) : (
                            <p className="text-sm text-[var(--text-primary)] py-2.5 px-3.5 bg-[var(--bg-app)] rounded-lg min-h-[42px] flex items-center break-words">
                              {selectedCliente[field.key] ?? <span className="text-[var(--text-muted)]">—</span>}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </fieldset>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
