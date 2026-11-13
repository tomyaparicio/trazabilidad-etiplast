"use client"

/**
 * El depósito de producto terminado, debajo de la planilla.
 *
 * No es un paso del recorrido —no se escanea, no tiene número, se carga desde
 * la pantalla de Stock— pero es dónde termina lo que salió del paso 5, así que
 * cierra la pantalla.
 *
 * Antes eran tarjetas de 180 px en una grilla de tres columnas. Pasó a tabla
 * por la misma razón que el recorrido: lo que se hace acá es COMPARAR un número
 * contra su mínimo, y para comparar hay que tener los números uno debajo del
 * otro. El número sigue grande: se mira de parado.
 *
 * Dos columnas y no cuatro a propósito: así la misma tabla entra en 390 px sin
 * una segunda versión para el celular. El mínimo va debajo del stock, que es
 * contra lo que se lo compara.
 *
 * El «bajo mínimo» se marca en rojo y con ícono —no es ninguna de las dos
 * señales del recorrido—: no es un trabajo trabado ni una posición, es un
 * insumo que falta. Mezclarlo con el ámbar haría que las tres cosas se lean
 * como la misma.
 */
import type { StockTablero, StockTableroItem } from "@/lib/api/types"
import { AlertTriangle, Boxes } from "lucide-react"
import Link from "next/link"

const nf = new Intl.NumberFormat("es-AR")

export function Deposito({ stock }: { stock: StockTablero }) {
  const recortado = stock.terminado.length < stock.total_items

  return (
    <section aria-labelledby="deposito">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2
          id="deposito"
          className="flex items-center gap-2 text-lg font-extrabold uppercase tracking-[0.12em] text-foreground"
        >
          <Boxes aria-hidden="true" className="size-5 shrink-0" />
          Depósito
        </h2>
        <p className="text-sm font-semibold text-muted-foreground">
          Producto terminado
          {stock.total_items > 0 && <> · {nf.format(stock.total_items)} items</>}
          {recortado && <> · se ven los primeros {stock.terminado.length}</>}
        </p>
        {/* El contador de bajo mínimo vive ACÁ y no arriba con los demás: lo
            que se hace con él es mirar qué item es, y los items están abajo.
            Arriba era un número suelto que no llevaba a ninguna parte. */}
        {/* `red-700` y no `red-600`: medido sobre el fondo real, el 600 da
            4,46:1 en tema claro contra el 4,5 que pide un texto de 14 px. */}
        {stock.bajo_minimo > 0 && (
          <p className="flex items-center gap-1.5 text-sm font-bold text-red-700 dark:text-red-400">
            <AlertTriangle aria-hidden="true" className="size-4 shrink-0" />
            {stock.bajo_minimo === 1
              ? "1 item bajo mínimo"
              : `${nf.format(stock.bajo_minimo)} items bajo mínimo`}
          </p>
        )}
      </div>

      {stock.terminado.length === 0 ? (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl border border-border bg-card px-5 py-4 text-base font-semibold text-muted-foreground">
          <span className="font-bold text-foreground">El depósito está vacío.</span>
          Los items de producto terminado se dan de alta en Stock y desde ahí aparecen acá.
          <Link href="/stock" className="font-bold text-brand underline dark:text-primary-200">
            Ir a Stock
          </Link>
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th scope="col" className="px-4 py-3 text-left text-sm font-bold uppercase tracking-wider text-muted-foreground">
                  Producto
                </th>
                <th scope="col" className="border-l border-border px-4 py-3 text-right text-sm font-bold uppercase tracking-wider text-muted-foreground">
                  En depósito
                </th>
              </tr>
            </thead>
            <tbody>
              {stock.terminado.map((item) => (
                <FilaStock key={item.id} item={item} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function FilaStock({ item }: { item: StockTableroItem }) {
  return (
    <tr
      // Tinte al 5 % y no al 6 %: sobre el 6 % el renglón del código queda
      // clavado en 4,50:1, o sea justo en el límite. La fila igual se marca
      // con la barra roja, el número rojo y el triángulo.
      className={`border-b border-border/60 last:border-b-0 ${
        item.bajo_minimo ? "bg-red-500/[0.05]" : ""
      }`}
    >
      <td
        className={`border-l-4 px-4 py-3 align-middle ${
          item.bajo_minimo ? "border-l-red-500" : "border-l-transparent"
        }`}
      >
        <span className="block text-base font-bold leading-tight text-foreground">
          {item.nombre}
        </span>
        <span className="block text-sm font-semibold text-muted-foreground">
          {item.codigo && <span className="font-mono">{item.codigo}</span>}
          {item.codigo && item.cliente_nombre && " · "}
          {item.cliente_nombre}
        </span>
      </td>
      <td className="border-l border-border px-4 py-3 text-right align-middle">
        <span
          className={`flex items-center justify-end gap-1.5 text-2xl font-extrabold leading-none tabular-nums ${
            item.bajo_minimo ? "text-red-700 dark:text-red-400" : "text-foreground"
          }`}
        >
          {item.bajo_minimo && <AlertTriangle aria-hidden="true" className="size-5 shrink-0" />}
          {nf.format(item.stock_actual ?? 0)}
          {item.unidad && <span className="text-base font-bold">{item.unidad}</span>}
        </span>
        <span className="mt-1 block text-sm font-semibold text-muted-foreground">
          {item.stock_minimo != null
            ? `mín. ${nf.format(item.stock_minimo)}${item.bajo_minimo ? " · bajo mínimo" : ""}`
            : "sin mínimo"}
        </span>
      </td>
    </tr>
  )
}
