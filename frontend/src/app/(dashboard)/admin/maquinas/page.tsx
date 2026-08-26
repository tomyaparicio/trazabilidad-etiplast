"use client"

import { useEffect, useState, useCallback } from "react"
import { PageContainer } from "@/components/ui/page-container"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { PageHeader } from "@/components/ui/page-header"
import { DataTable, type ColumnDef } from "@/components/ui/data-table"
import { EmptyState } from "@/components/ui/empty-state"
import { Cog, Plus, Pencil, Trash2, Loader2, AlertTriangle } from "lucide-react"

type TipoMaquina = "impresion" | "extrusion" | "troquelado"

interface MaquinaRow {
  id: number
  nombre: string
  tipo: string
  activa: boolean
}

const TIPOS: { value: TipoMaquina; label: string }[] = [
  { value: "impresion", label: "Impresión" },
  { value: "extrusion", label: "Extrusión" },
  { value: "troquelado", label: "Troquelado" },
]

function labelTipo(t: string) {
  return TIPOS.find((x) => x.value === t)?.label ?? t
}

// ─── Crear / Editar dialog ────────────────────────────────────────────────────
function MaquinaFormDialog({
  maquina,
  onClose,
  onSaved,
}: {
  maquina: MaquinaRow | null
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!maquina
  const [nombre, setNombre] = useState(maquina?.nombre ?? "")
  const [tipo, setTipo] = useState<TipoMaquina>((maquina?.tipo as TipoMaquina) || "impresion")
  const [activa, setActiva] = useState(maquina?.activa ?? true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const n = nombre.trim()
    if (!n) return
    setLoading(true)
    setError("")
    try {
      if (isEdit) {
        await api.admin.maquinas.update(maquina.id, { nombre: n, tipo, activa })
      } else {
        await api.admin.maquinas.create({ nombre: n, tipo })
      }
      toast.success(isEdit ? "Máquina actualizada" : "Máquina creada")
      onSaved()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al guardar"
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !loading) onClose() }}>
      <DialogContent showCloseButton={!loading} className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar máquina" : "Nueva máquina"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Las máquinas de tipo Impresión aparecen al asignar productos de clientes."
              : "Las de tipo Impresión se usan en la pestaña Productos del cliente."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 mb-1.5">Nombre</label>
            <Input autoFocus placeholder="Ej. Flexo 6 colores" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 mb-1.5">Tipo</label>
            <Select aria-label="Tipo de máquina" value={tipo} onChange={(e) => setTipo(e.target.value as TipoMaquina)}>
              {TIPOS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </Select>
          </div>
          {isEdit && (
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input type="checkbox" checked={activa} onChange={(e) => setActiva(e.target.checked)} className="rounded border-border" />
              Activa
            </label>
          )}
          {error && <p className="text-sm text-red-400">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>Cancelar</Button>
            <Button type="submit" disabled={loading || !nombre.trim()}>
              {loading && <Loader2 className="size-4 animate-spin" />}
              {isEdit ? "Guardar" : "Crear"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Eliminar dialog ───────────────────────────────────────────────────────────
function EliminarMaquinaDialog({
  maquina,
  onClose,
  onDeleted,
}: {
  maquina: MaquinaRow
  onClose: () => void
  onDeleted: () => void
}) {
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => { if (!open) onClose() }}
      title="Eliminar máquina"
      description={
        <>
          Se eliminará <span className="font-semibold text-foreground">{maquina.nombre}</span>.
          Si un producto la tenía asignada como impresora, quedará sin impresora (no se borran productos).
        </>
      }
      confirmLabel="Eliminar"
      variant="destructive"
      onConfirm={async () => {
        await api.admin.maquinas.delete(maquina.id)
        toast.success("Máquina eliminada")
        onDeleted()
      }}
    />
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function AdminMaquinasPage() {
  const [maquinas, setMaquinas] = useState<MaquinaRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [filtroTipo, setFiltroTipo] = useState<"" | TipoMaquina>("")
  const [formMaquina, setFormMaquina] = useState<MaquinaRow | null | undefined>(undefined)
  const [deleteMaquina, setDeleteMaquina] = useState<MaquinaRow | null>(null)

  const fetchMaquinas = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const data = await api.admin.maquinas.list(filtroTipo || undefined)
      setMaquinas(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar máquinas")
    } finally {
      setLoading(false)
    }
  }, [filtroTipo])

  useEffect(() => { fetchMaquinas() }, [fetchMaquinas])

  const columns: ColumnDef<MaquinaRow>[] = [
    {
      key: "nombre",
      header: "Nombre",
      cell: (r) => <span className="text-sm font-medium text-foreground">{r.nombre}</span>,
    },
    {
      key: "tipo",
      header: "Tipo",
      cell: (r) => <span className="text-sm text-muted-foreground">{labelTipo(r.tipo)}</span>,
    },
    {
      key: "activa",
      header: "Estado",
      cell: (r) => (
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${r.activa ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10" : "border-border text-muted-foreground bg-muted/30"}`}>
          {r.activa ? "Activa" : "Inactiva"}
        </span>
      ),
    },
    {
      key: "acciones",
      header: "",
      headerClassName: "text-right",
      cellClassName: "text-right",
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Editar máquina"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => setFormMaquina(r)}
          >
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Eliminar máquina"
            className="text-muted-foreground hover:text-red-400"
            onClick={() => setDeleteMaquina(r)}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      ),
    },
  ]

  return (
    <PageContainer>
      <PageHeader
        icon={Cog}
        iconClassName="text-violet-400"
        title="Máquinas"
        subtitle={`${maquinas.length} registro${maquinas.length === 1 ? "" : "s"}${filtroTipo ? ` · ${labelTipo(filtroTipo)}` : ""}`}
        actions={
          <Button onClick={() => setFormMaquina(null)} className="gap-2 shrink-0">
            <Plus className="w-4 h-4" />
            Nueva máquina
          </Button>
        }
      />

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={filtroTipo === "" ? "default" : "outline"}
          size="sm"
          className={filtroTipo === "" ? "bg-brand" : ""}
          onClick={() => setFiltroTipo("")}
        >
          Todas
        </Button>
        {TIPOS.map((t) => (
          <Button
            key={t.value}
            type="button"
            variant={filtroTipo === t.value ? "default" : "outline"}
            size="sm"
            className={filtroTipo === t.value ? "bg-brand" : ""}
            onClick={() => setFiltroTipo(t.value)}
          >
            {t.label}
          </Button>
        ))}
      </div>

      {error ? (
        <EmptyState
          icon={<AlertTriangle className="w-8 h-8" strokeWidth={1.5} />}
          title="No se pudieron cargar las máquinas"
          description={error}
          action={<Button variant="outline" size="sm" onClick={fetchMaquinas}>Reintentar</Button>}
        />
      ) : (
        <DataTable
          columns={columns}
          data={maquinas}
          loading={loading}
          keyExtractor={(r) => r.id}
          emptyIcon={<Cog className="w-8 h-8 text-muted-foreground" strokeWidth={1.5} />}
          emptyTitle="Sin máquinas"
          emptyDescription={
            filtroTipo
              ? `No hay máquinas de tipo ${labelTipo(filtroTipo)}. Creá una con "Nueva máquina".`
              : 'No hay máquinas cargadas. Creá una con "Nueva máquina".'
          }
        />
      )}

      {formMaquina !== undefined && (
        <MaquinaFormDialog
          maquina={formMaquina}
          onClose={() => setFormMaquina(undefined)}
          onSaved={fetchMaquinas}
        />
      )}
      {deleteMaquina && (
        <EliminarMaquinaDialog
          maquina={deleteMaquina}
          onClose={() => setDeleteMaquina(null)}
          onDeleted={fetchMaquinas}
        />
      )}
    </PageContainer>
  )
}
