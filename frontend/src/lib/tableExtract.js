/**
 * Extractor de tablas de los comprobantes de Previred.
 *
 * No hay coordenadas fijas en el código: las columnas se deducen de cada página.
 * Hay DOS caminos, y el primero es el bueno:
 *
 *  1. RAYADO (pdfRules.js). Estos PDF traen la tabla dibujada, un rectángulo por
 *     celda. Los bordes de las columnas y de los encabezados de agrupación son un
 *     DATO leído del archivo, no una inferencia. Cada celda de datos se asigna a su
 *     columna por contención en [x0, x1).
 *
 *  2. HEURÍSTICO, sólo si la página no trae rayado. Es el método anterior: los
 *     encabezados de grupo se reparten por dominios hasta el punto medio con el
 *     vecino, y cada celda va a la columna cuyo centro esté más cerca.
 *
 * POR QUÉ IMPORTA LA DIFERENCIA. En el comprobante de AFP hay DOS columnas
 * "Remuneración Imponible": una del Fondo de Pensiones y otra del Seguro de Cesantía.
 * Sólo se distinguen por su encabezado de agrupación. Con el método heurístico, el
 * grupo "Identificación del Trabajador" (que cubre 2 columnas) reinaba hasta x=251 y
 * se tragaba la columna del fondo de pensiones (centro x=248): las dos "Remuneración
 * Imponible" quedaban con la misma clave, sus montos se sumaban en silencio y
 * `impo_afp` salía en 0 para todos los trabajadores. Con el rayado, la celda del grupo
 * es [223.4, 519.3] y la de la columna [223.4, 272.7]: contenida, sin ambigüedad.
 *
 * El heurístico tiene además dos problemas medidos que el rayado no tiene: la fila del
 * código de barras se colaba como encabezado de agrupación (no tiene rectángulos, así
 * que con rayado ni aparece), y el 40 % de las celdas de datos del AFP caen fuera del
 * rectángulo de su propia columna, con casos a 1,9 pt de saltar a la vecina.
 */

import { norm, isNumeric } from './text.js'
import { looksLikeRut } from './rut.js'
import { textoFila } from './pdfPages.js'
import { celdaQueContiene } from './pdfRules.js'

/** Cuántas filas hacia arriba se consideran encabezados de agrupación. */
const MAX_FILAS_ANCESTRAS = 3
/** Distancia vertical máxima (pt) para que una fila/banda de arriba cuente como agrupación. */
const MAX_DY_ANCESTRO = 24
/** Solape horizontal mínimo para atribuir un encabezado de agrupación a una columna. */
const MIN_SOLAPE = 0.4
/** El código de barras de la portada: bloques alfanuméricos separados por guiones. */
const ES_CODIGO_BARRAS = /^[A-Za-z0-9]{6,}(\s*-\s*[A-Za-z0-9]{2,})+$/

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

/** ¿Esta celda de encabezado es en realidad un valor, y no un rótulo de columna? */
const esValor = (texto) =>
  looksLikeRut(texto) || isNumeric(texto) || texto.trim().endsWith(':') || ES_CODIGO_BARRAS.test(texto.trim())

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
 * @param {Array} filas filas visuales de la página (pdfPages.agruparEnFilas)
 * @param {string[]} anclas etiquetas que deben aparecer en la fila de encabezado hoja
 * @param {Array} [bandas] rayado de la página (pdfRules.extraerRayado)
 * @returns {{columnas:Array, filasDatos:Array, camino:string}|null}
 */
export function localizarTabla(filas, anclas = ['RUT'], bandas = null) {
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

  const conRayado = columnasDesdeRayado(filas, idxDatos, bandas)
  const columnas = conRayado ?? columnasHeuristicas(filas, idxHoja, idxDatos)

  for (const col of columnas) {
    col.etiqueta = [...col.ancestros, col.hoja].join(' > ')
    col.claves = clavesDeBusqueda(col.ancestros, col.hoja)
  }

  return { columnas, filasDatos: filas.slice(idxDatos), camino: conRayado ? 'rayado' : 'heuristico' }
}

/** Alto máximo (pt) de la zona de encabezado por encima de la banda de datos. */
const ALTO_ZONA_ENCABEZADO = 48
/** Tolerancia (pt) para decir que una celda del encabezado es la de esta columna. */
const TOL_ALINEACION = 0.6

/**
 * Camino 1: las columnas son las celdas dibujadas de la banda de datos.
 *
 * La regla que reparte el encabezado es una sola, y sale de cómo está dibujada la
 * tabla: cada texto del encabezado cae dentro de alguna celda, y
 *
 *   - si esa celda coincide con una columna  -> es el rótulo HOJA de esa columna;
 *   - si abarca varias columnas              -> es un encabezado de AGRUPACIÓN.
 *
 * Eso resuelve solo el caso de las celdas combinadas verticalmente. En el comprobante
 * de CCAF, "Afiliados a" e "Isapre" están en dos renglones distintos pero dentro de la
 * MISMA celda [203.9, 244.8], que abarca las dos filas del encabezado: las dos van al
 * rótulo hoja de esa columna y la clave sale "afiliados a isapre", igual que antes.
 */
function columnasDesdeRayado(filas, idxDatos, bandas) {
  if (!bandas?.length) return null

  const yDatos = filas[idxDatos].y
  // La banda de datos: la que contiene la primera fila con RUT. Si varias la
  // contienen (celdas combinadas), gana la que tenga más columnas.
  const candidatas = bandas.filter((b) => yDatos >= b.y0 && yDatos <= b.y1 && b.celdas.length > 1)
  if (!candidatas.length) return null
  const bandaDatos = candidatas.reduce((a, b) => (b.celdas.length > a.celdas.length ? b : a))

  const columnas = bandaDatos.celdas.map((c) => ({
    x0: c.x0,
    x1: c.x1,
    xc: (c.x0 + c.x1) / 2,
    hoja: '',
    ancestros: [],
  }))
  const esDeColumna = (celda) =>
    columnas.findIndex(
      (col) => Math.abs(col.x0 - celda.x0) <= TOL_ALINEACION && Math.abs(col.x1 - celda.x1) <= TOL_ALINEACION,
    )

  // Zona de encabezado: se sube renglón a renglón desde la banda de datos y se PARA
  // en la primera banda que contenga un dato. En las páginas de "otras prestaciones"
  // del CCAF la ficha del empleador está pegada a la tabla —comparte el mismo rayado—
  // y sin este corte sus rótulos se mezclan con los de las columnas ("RUT: Leasing"),
  // el RUT del trabajador se queda sin mapear y se pierden 515 filas enteras.
  const contieneDato = (banda) =>
    filas.some(
      (fila) =>
        fila.y >= banda.y0 &&
        fila.y <= banda.y1 &&
        fila.celdas.some((c) => celdaQueContiene(banda, c.xc) >= 0 && esValor(c.texto)),
    )

  const zona = []
  let yTope = bandaDatos.y0
  for (;;) {
    const nivel = bandas.filter((b) => b.y0 < yTope && Math.abs(b.y1 - yTope) <= 1.5)
    if (!nivel.length || nivel.some(contieneDato)) break
    zona.push(...nivel)
    // Se avanza al MAYOR y0 del nivel, no al menor: una celda combinada verticalmente
    // (el "Afiliados a / Isapre" del CCAF) abarca dos renglones, y saltar directo a su
    // techo se comería el renglón de grupos que hay en medio.
    const arriba = Math.max(...nivel.map((b) => b.y0))
    if (arriba >= yTope || bandaDatos.y0 - arriba > ALTO_ZONA_ENCABEZADO) break
    yTope = arriba
  }
  if (!zona.length) return null
  const yInicio = Math.min(...zona.map((b) => b.y0))

  const hojas = columnas.map(() => [])
  const grupos = [] // {y0, x0, x1, textos:[], columnas:[i…]}

  for (const fila of filas) {
    if (fila.y >= bandaDatos.y0 || fila.y < yInicio) continue
    for (const texto of fila.celdas) {
      // La celda dibujada más pequeña que contiene este texto en esta altura.
      let mejor = null
      for (const banda of zona) {
        if (fila.y < banda.y0 || fila.y > banda.y1) continue
        const k = celdaQueContiene(banda, texto.xc)
        if (k < 0) continue
        const c = banda.celdas[k]
        if (!mejor || c.x1 - c.x0 < mejor.x1 - mejor.x0) mejor = { ...c, y0: banda.y0 }
      }
      if (!mejor) continue

      const iCol = esDeColumna(mejor)
      if (iCol >= 0) {
        hojas[iCol].push(texto.texto)
        continue
      }
      let grupo = grupos.find((g) => Math.abs(g.x0 - mejor.x0) <= TOL_ALINEACION && Math.abs(g.x1 - mejor.x1) <= TOL_ALINEACION)
      if (!grupo) grupos.push((grupo = { y0: mejor.y0, x0: mejor.x0, x1: mejor.x1, textos: [] }))
      grupo.textos.push(texto.texto)
    }
  }

  columnas.forEach((col, i) => {
    col.hoja = hojas[i].join(' ').trim()
  })
  // Sin ningún rótulo el rayado no sirve de nada: se cae al heurístico.
  if (columnas.every((c) => !c.hoja)) return null

  // Se limitan los NIVELES de agrupación, no las celdas: una misma fila de grupos
  // aporta varias celdas y recortarlas por número dejaría columnas sin su ancestro.
  const niveles = [...new Set(grupos.map((g) => g.y0))].sort((a, b) => a - b).slice(-MAX_FILAS_ANCESTRAS)
  for (const grupo of grupos.filter((g) => niveles.includes(g.y0)).sort((a, b) => a.y0 - b.y0)) {
    const texto = grupo.textos.join(' ').trim()
    // Una celda que contiene un valor (el RUT del empleador, un monto, un rótulo
    // terminado en ":") no es un encabezado de agrupación: es la ficha del empleador,
    // que en la última página del CCAF queda justo encima de la tabla.
    if (!texto || esValor(texto)) continue
    for (let i = 0; i < columnas.length; i += 1) {
      if (columnas[i].xc >= grupo.x0 && columnas[i].xc < grupo.x1) columnas[i].ancestros.push(texto)
    }
  }

  return columnas
}

/** Camino 2: el método anterior, para páginas sin rayado. */
function columnasHeuristicas(filas, idxHoja, idxDatos) {
  const columnas = filas[idxHoja].celdas.map((c) => ({
    x0: c.x0,
    x1: c.x1,
    xc: c.xc,
    hoja: c.texto,
    continuacion: [],
    ancestros: [],
  }))

  for (let i = idxHoja + 1; i < idxDatos; i += 1) {
    for (const celda of filas[i].celdas) {
      const k = masCercana(columnas, celda.xc)
      if (k >= 0) columnas[k].continuacion.push(celda.texto)
    }
  }

  // Un encabezado de grupo va CENTRADO sobre sus columnas, así que muchas veces no se
  // solapa con las de los extremos ("Movimiento de Personal" no cubre "Cod."). Por eso
  // cada celda de grupo recibe un DOMINIO hasta el punto medio con su vecina.
  const yHoja = filas[idxHoja].y
  for (let i = idxHoja - 1, n = 0; i >= 0 && n < MAX_FILAS_ANCESTRAS; i -= 1, n += 1) {
    if (yHoja - filas[i].y > MAX_DY_ANCESTRO) break
    const grupos = filas[i].celdas.filter((c) => !esValor(c.texto))
    if (!grupos.length) continue
    const dominios = grupos.map((celda, g) => {
      const ancho = celda.x1 - celda.x0
      return {
        celda,
        izq: g > 0 ? (grupos[g - 1].x1 + celda.x0) / 2 : celda.x0 - ancho,
        der: g < grupos.length - 1 ? (celda.x1 + grupos[g + 1].x0) / 2 : celda.x1 + ancho,
      }
    })
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

  for (const col of columnas) col.hoja = [col.hoja, ...col.continuacion].join(' ').trim()
  return columnas
}

/**
 * Lee las filas de datos como arreglos de texto alineados a `tabla.columnas`.
 * Se detiene en la fila de totales para no contaminar las sumas.
 *
 * @returns {{registros:Array<{valores:string[]}>, descartadas:number, total:number,
 *            fuera:number, colisiones:number}}
 */
export function leerFilas(tabla) {
  const registros = []
  const porRayado = tabla.camino === 'rayado'
  let descartadas = 0
  let total = 0
  let fuera = 0
  let colisiones = 0

  for (const fila of tabla.filasDatos) {
    if (/TOTALES?\s+ACUMULADOS?/i.test(textoFila(fila))) break
    total += 1
    if (!fila.celdas.some((c) => looksLikeRut(c.texto))) {
      descartadas += 1
      continue
    }

    const valores = new Array(tabla.columnas.length).fill('')
    for (const celda of fila.celdas) {
      // Con rayado la celda pertenece a la columna que la CONTIENE. Sin rayado hay
      // que conformarse con la más cercana, que es de donde salía el margen de 1,9 pt.
      const k = porRayado
        ? tabla.columnas.findIndex((c) => celda.xc >= c.x0 && celda.xc < c.x1)
        : masCercana(tabla.columnas, celda.xc)
      if (k < 0) {
        fuera += 1
        continue
      }
      if (valores[k]) colisiones += 1
      valores[k] = valores[k] ? `${valores[k]} ${celda.texto}` : celda.texto
    }
    registros.push({ valores })
  }
  return { registros, descartadas, total, fuera, colisiones }
}
