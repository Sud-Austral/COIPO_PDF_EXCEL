/**
 * Extractor de tablas genérico para los comprobantes de Previred.
 *
 * No hay coordenadas fijas en el código: las columnas se deducen del encabezado de
 * cada página. Esto es lo que permite que sirva para instituciones distintas
 * (AFP, Isapre, Fonasa, CCAF, mutual, AFC) sin reescribir el parser.
 *
 * Cómo está armada la tabla en estos PDF (verificado sobre el comprobante CCAF):
 *  - Hay una fila de encabezado "hoja" con una celda por columna.
 *  - Puede haber filas de continuación justo debajo ("4,2%", "Trab.", "Retroactiva").
 *  - Puede haber filas de agrupación arriba ("Monto Remuneraciones Imponibles").
 *  - TODAS las celdas de datos están CENTRADAS respecto de su columna, incluidos el
 *    RUT y el nombre. Por eso basta asignar cada celda a la columna cuyo centro esté
 *    más cerca.
 */

import { norm, isNumeric } from './text.js'
import { looksLikeRut } from './rut.js'
import { textoFila } from './pdfPages.js'

/** Cuántas filas hacia arriba se consideran encabezados de agrupación. */
const MAX_FILAS_ANCESTRAS = 3
/** Distancia vertical máxima (pt) para que una fila de arriba cuente como agrupación. */
const MAX_DY_ANCESTRO = 24
/** Solape horizontal mínimo para atribuir un encabezado de agrupación a una columna. */
const MIN_SOLAPE = 0.4

function solape(a, b) {
  const ancho = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)
  if (ancho <= 0) return 0
  return ancho / Math.max(1e-6, Math.min(a.x1 - a.x0, b.x1 - b.x0))
}

function masCercana(columnas, xc) {
  let mejor = -1
  let mejorD = Infinity
  for (let i = 0; i < columnas.length; i += 1) {
    const d = Math.abs(columnas[i].xc - xc)
    if (d < mejorD) {
      mejorD = d
      mejor = i
    }
  }
  return mejor
}

/** Claves de búsqueda, de la más específica a la más general. */
function clavesDeBusqueda(ancestros, hoja) {
  const claves = []
  if (ancestros.length) {
    claves.push(norm([...ancestros, hoja].join(' ')))
    claves.push(norm([ancestros[ancestros.length - 1], hoja].join(' ')))
  }
  claves.push(norm(hoja))
  return [...new Set(claves.filter(Boolean))]
}

/**
 * Localiza la tabla de una página y devuelve sus columnas y filas de datos.
 *
 * @param {Array} filas filas visuales de la página (ver pdfPages.agruparEnFilas)
 * @param {string[]} anclas etiquetas que deben aparecer en la fila de encabezado hoja
 * @returns {{columnas:Array, filasDatos:Array}|null}
 */
export function localizarTabla(filas, anclas = ['RUT']) {
  const anclasNorm = anclas.map(norm)

  let idxHoja = -1
  for (let i = 0; i < filas.length; i += 1) {
    const etiquetas = filas[i].celdas.map((c) => norm(c.texto))
    if (anclasNorm.every((a) => etiquetas.includes(a)) && filas[i].celdas.length > anclasNorm.length) {
      idxHoja = i
      break
    }
  }
  if (idxHoja === -1) return null

  // Primera fila de datos = la primera, bajo el encabezado, que trae un RUT.
  let idxDatos = -1
  for (let i = idxHoja + 1; i < filas.length; i += 1) {
    if (filas[i].celdas.some((c) => looksLikeRut(c.texto))) {
      idxDatos = i
      break
    }
  }
  if (idxDatos === -1) return null

  const columnas = filas[idxHoja].celdas.map((c) => ({
    x0: c.x0,
    x1: c.x1,
    xc: c.xc,
    hoja: c.texto,
    continuacion: [],
    ancestros: [],
  }))

  // Filas de continuación: entre el encabezado hoja y la primera fila de datos.
  for (let i = idxHoja + 1; i < idxDatos; i += 1) {
    for (const celda of filas[i].celdas) {
      const k = masCercana(columnas, celda.xc)
      if (k >= 0) columnas[k].continuacion.push(celda.texto)
    }
  }

  // Filas de agrupación: hasta 3 filas arriba.
  //
  // Un encabezado de grupo va CENTRADO sobre sus columnas, así que muchas veces no
  // se solapa con las de los extremos ("Movimiento de Personal" no cubre "Cod.").
  // Por eso cada celda de grupo recibe un DOMINIO que llega hasta el punto medio con
  // su vecina, y toda columna hoja cuyo centro caiga ahí es hija suya.
  const yHoja = filas[idxHoja].y
  for (let i = idxHoja - 1, n = 0; i >= 0 && n < MAX_FILAS_ANCESTRAS; i -= 1, n += 1) {
    if (yHoja - filas[i].y > MAX_DY_ANCESTRO) break
    const grupos = filas[i].celdas.filter(
      // Se descartan los datos (RUT y montos del empleador) y los rótulos de campo,
      // que terminan en ":" y no son encabezados de columna.
      (c) => !looksLikeRut(c.texto) && !isNumeric(c.texto) && !c.texto.trim().endsWith(':'),
    )
    const dominios = grupos.map((celda, g) => {
      const ancho = celda.x1 - celda.x0
      return {
        celda,
        izq: g > 0 ? (grupos[g - 1].x1 + celda.x0) / 2 : celda.x0 - ancho,
        der: g < grupos.length - 1 ? (celda.x1 + grupos[g + 1].x0) / 2 : celda.x1 + ancho,
      }
    })
    // Como mucho un ancestro por fila y por columna: gana el solape directo y,
    // si no hay, el dominio que contenga el centro de la columna.
    for (const col of columnas) {
      let elegida = null
      let mejorSolape = MIN_SOLAPE
      for (const { celda } of dominios) {
        const s = solape(celda, col)
        if (s >= mejorSolape) {
          mejorSolape = s
          elegida = celda
        }
      }
      if (!elegida) {
        const d = dominios.find((x) => col.xc >= x.izq && col.xc <= x.der)
        if (d) elegida = d.celda
      }
      if (elegida) col.ancestros.unshift(elegida.texto)
    }
  }

  for (const col of columnas) {
    const hojaCompleta = [col.hoja, ...col.continuacion].join(' ')
    col.etiqueta = [...col.ancestros, hojaCompleta].join(' > ')
    col.claves = clavesDeBusqueda(col.ancestros, hojaCompleta)
  }

  return { columnas, filasDatos: filas.slice(idxDatos) }
}

/**
 * Lee las filas de datos como arreglos de texto alineados a `tabla.columnas`.
 * Se detiene en la fila de totales para no contaminar las sumas.
 *
 * @returns {Array<{valores:string[]}>}
 */
export function leerFilas(tabla) {
  const registros = []
  for (const fila of tabla.filasDatos) {
    if (/TOTALES?\s+ACUMULADOS?/i.test(textoFila(fila))) break
    if (!fila.celdas.some((c) => looksLikeRut(c.texto))) continue

    const valores = new Array(tabla.columnas.length).fill('')
    for (const celda of fila.celdas) {
      const k = masCercana(tabla.columnas, celda.xc)
      if (k < 0) continue
      // Si dos celdas caen en la misma columna se concatenan en vez de perderse.
      valores[k] = valores[k] ? `${valores[k]} ${celda.texto}` : celda.texto
    }
    registros.push({ valores })
  }
  return registros
}
