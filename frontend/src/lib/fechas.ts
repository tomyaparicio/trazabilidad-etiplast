/**
 * Las fechas de las pantallas de planta, en un solo lugar.
 *
 * Vivían dentro de `/planificacion`. El dashboard muestra los mismos cuatro
 * pasos con los mismos datos, así que las necesita igual: copiarlas era dejar
 * dos funciones de fecha que se desincronizan. `fechaCorta` ya pagó un bug de
 * zona horaria (está contado abajo) — arreglarlo en una copia y no en la otra
 * habría dejado una de las dos pantallas mintiendo el día.
 */

/** «Hace 2 h 15 min», que es como lo lee alguien parado en la planta. */
export function desdeHace(iso: string | null): string {
  if (!iso) return ""
  const minutos = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (minutos < 1) return "recién"
  if (minutos < 60) return `hace ${minutos} min`
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  return m ? `hace ${h} h ${m} min` : `hace ${h} h`
}

/**
 * «08/11/2026» a partir de un día suelto o de un momento ISO completo.
 *
 * Llegan dos formatos y cada uno se arma distinto, porque la trampa es opuesta:
 *
 *  - **Día suelto** («2026-11-08», columna DATE): se parte el string a mano.
 *    Pasarlo por `new Date` lo lee como medianoche UTC y en Argentina (UTC−3)
 *    retrocede al día anterior: la orden que se cerró hoy aparecería ayer.
 *  - **Momento completo** («2026-11-08T01:00:00+00:00», columna
 *    `DateTime(timezone=True)` — es lo que manda hoy el tablero): el día que
 *    trae el string es el día EN UTC, así que hay que convertirlo a hora local
 *    antes de leerlo. Cortarlo sería mostrar el día de Greenwich: una orden
 *    cerrada el viernes a las 22 de Argentina son las 01:00 UTC del sábado, y
 *    la tarjeta diría sábado. Todo lo cerrado después de las 21 ART salía con
 *    un día de adelanto.
 *
 * Un momento sin offset («2026-11-08T01:00:00») no trae zona que convertir:
 * `new Date` lo toma como hora local y el día termina siendo el mismo que dice
 * el string, que es lo único honesto que se puede hacer con un dato así.
 */
export function fechaCorta(iso: string | null): string {
  if (!iso) return ""

  if (iso.length === 10) {
    const [y, m, d] = iso.split("-")
    return y && m && d ? `${d}/${m}/${y}` : iso
  }

  const momento = new Date(iso)
  if (Number.isNaN(momento.getTime())) return iso
  return momento.toLocaleDateString("es-AR", {
    day: "2-digit", month: "2-digit", year: "numeric",
  })
}
