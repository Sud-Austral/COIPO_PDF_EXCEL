/**
 * Extracción de texto posicionado desde un PDF, en coordenadas VISUALES.
 *
 * Los comprobantes de Previred vienen con las páginas rotadas 90°: en el espacio
 * de coordenadas del PDF cada trabajador es una *columna*, no una fila. Aplicando
 * `viewport.transform` (que ya incorpora `page.rotate`) las coordenadas quedan como
 * uno las ve en pantalla y la tabla se puede leer por filas.
 *
 * El módulo pdfjs se recibe por parámetro para poder usar el build de navegador en
 * la app y el build `legacy` en Node desde scripts/verify.mjs.
 */

import { extraerRayado } from './pdfRules.js'

/** Tolerancia vertical (pt) para considerar que dos celdas están en la misma fila. */
const ROW_TOL = 2.5

/**
 * @param {object} pdfjs módulo pdfjs-dist ya configurado
 * @param {Uint8Array} data bytes del PDF
 * @param {(hecho:number, total:number) => void} [onPage] progreso por página
 * @returns {Promise<{numPages:number, pages:Array<{index:number, rows:Array, texto:string}>}>}
 */
export async function extraerPaginas(pdfjs, data, onPage) {
  const tarea = pdfjs.getDocument({
    data,
    isEvalSupported: false,
    // Solo se necesita el texto: no hace falta renderizar ni cargar fuentes.
    disableFontFace: true,
  })
  const doc = await tarea.promise

  const pages = []
  try {
    for (let i = 1; i <= doc.numPages; i += 1) {
      const page = await doc.getPage(i)
      const viewport = page.getViewport({ scale: 1 })
      const content = await page.getTextContent()

      const celdas = []
      for (const item of content.items) {
        if (!item.str || !item.str.trim()) continue
        const m = pdfjs.Util.transform(viewport.transform, item.transform)
        const x0 = m[4]
        const x1 = x0 + item.width
        celdas.push({ x0, x1, xc: (x0 + x1) / 2, y: m[5], texto: item.str.trim() })
      }
      // El rayado de la tabla (ver pdfRules.js): es lo que convierte los encabezados
      // de agrupación de heurística en dato leído del archivo.
      const bandas = await extraerRayado(pdfjs, page, viewport)
      page.cleanup()

      pages.push({
        index: i,
        rows: agruparEnFilas(celdas),
        bandas,
        texto: celdas.map((c) => c.texto).join('\n'),
      })
      if (onPage) onPage(i, doc.numPages)
    }
  } finally {
    await tarea.destroy()
  }
  return { numPages: pages.length, pages }
}

/** Agrupa celdas sueltas en filas visuales, ordenadas de arriba a abajo e izq. a der. */
export function agruparEnFilas(celdas) {
  const ordenadas = [...celdas].sort((a, b) => a.y - b.y || a.x0 - b.x0)
  const filas = []
  for (const c of ordenadas) {
    const ultima = filas[filas.length - 1]
    if (ultima && Math.abs(c.y - ultima.y) <= ROW_TOL) {
      ultima.celdas.push(c)
      // La y de la fila sigue siendo la de la primera celda; suficiente para ordenar.
    } else {
      filas.push({ y: c.y, celdas: [c] })
    }
  }
  for (const f of filas) f.celdas.sort((a, b) => a.x0 - b.x0)
  return filas
}

/** Texto plano de una fila, útil para detectar títulos y encabezados. */
export function textoFila(fila) {
  return fila.celdas.map((c) => c.texto).join(' ')
}
