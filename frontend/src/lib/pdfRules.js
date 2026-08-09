/**
 * EL RAYADO DE LA TABLA, LEÍDO DEL PDF.
 *
 * Estos comprobantes no traen sólo texto: traen la tabla DIBUJADA, un rectángulo por
 * celda (791 en una página de AFP, 880 en una de CCAF). Eso cambia el problema de
 * raíz, porque hasta ahora los encabezados de agrupación se deducían de la geometría
 * del texto —cada rótulo de grupo reinaba hasta el punto medio con su vecino— y esa
 * heurística se equivoca cuando los grupos cubren cantidades de columnas distintas.
 *
 * Caso real: en el comprobante de AFP, "Identificación del Trabajador" cubre 2
 * columnas y "Fondo de Pensiones" cubre 6. El punto medio entre ambos rótulos cae en
 * x=251, y la columna "Remuneración Imponible" del fondo de pensiones tiene su centro
 * en x=248: por tres puntos quedaba colgando del grupo equivocado, indistinguible de
 * la OTRA "Remuneración Imponible" (la del seguro de cesantía). Las dos caían en la
 * misma clave genérica y sus montos se sumaban en silencio.
 *
 * Con el rayado no hay que adivinar: la celda de grupo es [223.4, 519.3] y la columna
 * es [223.4, 272.7]. Está contenida. Es un dato, no una inferencia.
 *
 * Y de yapa: la fila del código de barras —que pasaba el filtro de encabezados y se
 * convertía en ancestro de casi todas las columnas— NO tiene ni un rectángulo.
 */

/** Ancho/alto mínimos (pt) para que un rectángulo sea una celda y no una línea. */
const MIN_ANCHO = 2
const MIN_ALTO = 1
/** Tolerancia (pt) al agrupar rectángulos en bandas horizontales. */
const TOL_BANDA = 0.6

/**
 * Extrae las bandas de celdas dibujadas de una página, en coordenadas VISUALES
 * (las mismas que usa pdfPages.js).
 *
 * @param {object} pdfjs módulo pdfjs-dist
 * @param {object} page página ya obtenida con doc.getPage()
 * @param {object} viewport page.getViewport({scale:1})
 * @returns {Promise<Array<{y0:number, y1:number, celdas:Array<{x0:number,x1:number}>}>>}
 */
export async function extraerRayado(pdfjs, page, viewport) {
  const OPS = pdfjs.OPS
  let ops
  try {
    ops = await page.getOperatorList()
  } catch {
    return [] // sin rayado se cae al camino heurístico; no es un error fatal
  }

  let ctm = [1, 0, 0, 1, 0, 0]
  const pila = []
  const cajas = []

  for (let i = 0; i < ops.fnArray.length; i += 1) {
    const fn = ops.fnArray[i]
    if (fn === OPS.save) {
      pila.push(ctm.slice())
    } else if (fn === OPS.restore) {
      ctm = pila.pop() ?? ctm
    } else if (fn === OPS.transform) {
      ctm = pdfjs.Util.transform(ctm, ops.argsArray[i])
    } else if (fn === OPS.constructPath) {
      // args = [nOps, pathArray, bbox]; el bbox es un Float32Array [x0,y0,x1,y1]
      // en coordenadas del PDF.
      const bbox = ops.argsArray[i]?.[2]
      if (!bbox || bbox.length < 4) continue
      const M = pdfjs.Util.transform(viewport.transform, ctm)
      // OJO: en pdf.js v6 applyTransform MUTA el punto y devuelve undefined.
      const p1 = [bbox[0], bbox[1]]
      const p2 = [bbox[2], bbox[3]]
      pdfjs.Util.applyTransform(p1, M)
      pdfjs.Util.applyTransform(p2, M)
      const x0 = Math.min(p1[0], p2[0])
      const x1 = Math.max(p1[0], p2[0])
      const y0 = Math.min(p1[1], p2[1])
      const y1 = Math.max(p1[1], p2[1])
      if (x1 - x0 < MIN_ANCHO || y1 - y0 < MIN_ALTO) continue
      cajas.push({ x0, x1, y0, y1 })
    }
  }

  return agruparEnBandas(cajas)
}

/** Agrupa los rectángulos por su par (y0,y1). Cada celda viene dos veces: relleno y trazo. */
export function agruparEnBandas(cajas) {
  const bandas = []
  for (const c of [...cajas].sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)) {
    let banda = bandas.find((b) => Math.abs(b.y0 - c.y0) <= TOL_BANDA && Math.abs(b.y1 - c.y1) <= TOL_BANDA)
    if (!banda) {
      banda = { y0: c.y0, y1: c.y1, celdas: [] }
      bandas.push(banda)
    }
    const repetida = banda.celdas.some((k) => Math.abs(k.x0 - c.x0) <= 0.2 && Math.abs(k.x1 - c.x1) <= 0.2)
    if (!repetida) banda.celdas.push({ x0: c.x0, x1: c.x1 })
  }
  for (const b of bandas) b.celdas.sort((a, c) => a.x0 - c.x0)
  return bandas.sort((a, b) => a.y0 - b.y0)
}

/** Índice de la celda de la banda que contiene x, o -1. */
export function celdaQueContiene(banda, x) {
  if (!banda) return -1
  return banda.celdas.findIndex((c) => x >= c.x0 && x < c.x1)
}

/**
 * Firma de una banda, para comprobar que el rayado no cambió entre páginas de la
 * misma sección (que es lo que permite calcularlo una vez y reusarlo).
 */
export const firmaDeBanda = (banda) =>
  banda ? banda.celdas.map((c) => `${c.x0.toFixed(1)}-${c.x1.toFixed(1)}`).join('|') : ''
