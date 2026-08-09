/**
 * Convierte UN PDF de comprobante en registros por línea, más los metadatos, los
 * pares rótulo→monto de su portada y el diagnóstico de qué se leyó y qué no.
 *
 * Todo lo que antes se descartaba con un `continue` mudo ahora queda contado en el
 * documento: páginas sin sección, filas sin RUT, celdas fuera de columna, valores que
 * no parsean, columnas que se pisan. Un extractor que no puede contarte lo que perdió
 * no se puede auditar.
 */

import { extraerPaginas, textoFila } from './pdfPages.js'
import { localizarTabla, leerFilas } from './tableExtract.js'
import { detectarPerfil, seccionPara, mapearColumnas } from './perfiles.js'
import { leerPortada } from './portada.js'
import { esNumerico } from './campos.js'
import { toNumber, squish } from './text.js'
import { looksLikeRut, parseRut } from './rut.js'

/**
 * @param {object} pdfjs módulo pdfjs-dist
 * @param {{nombre:string, datos:Uint8Array}} archivo
 * @param {(p:{pagina:number,total:number}) => void} [onProgress]
 */
export async function parsearDocumento(pdfjs, archivo, onProgress) {
  const { pages } = await extraerPaginas(pdfjs, archivo.datos, (pagina, total) => {
    if (onProgress) onProgress({ pagina, total })
  })

  const portada = leerPortada(pages)
  const deteccion = detectarPerfil(portada.texto || pages[0]?.texto || '')

  const doc = {
    archivo: archivo.nombre,
    paginas: pages.length,
    folio: portada.folio,
    periodo: portada.periodo,
    empleador: portada.empleador,
    paresPortada: portada.pares,
    institucion: deteccion?.institucion ?? '(no reconocida)',
    bloque: deteccion?.perfil.bloque ?? null,
    perfil: deteccion?.perfil ?? null,
    deteccion: deteccion
      ? {
          bloque: deteccion.bloque,
          institucion: deteccion.institucion,
          puntaje: deteccion.puntaje,
          segundo: deteccion.segundo,
          ambigua: deteccion.ambigua,
          evidencia: deteccion.evidencia,
        }
      : null,
    registros: [],
    columnas: [],
    columnasSinMapear: new Set(),
    columnasGenericas: new Set(),
    camposDuplicados: new Set(),
    valoresNoNumericos: [],
    paginasSinLeer: [],
    paginasSinSeccion: [],
    seccionesAmbiguas: [],
    caminos: new Set(),
    filasLeidas: 0,
    filasDescartadas: 0,
    celdasFuera: 0,
    celdasEnColision: 0,
    reconocido: !!deteccion,
  }

  if (!deteccion) return finalizar(doc)

  const columnasPorClave = new Map()

  for (const pagina of pages.slice(1)) {
    // El título se busca por FILAS, no sobre pagina.texto: ese junta los items en
    // orden de lectura del PDF (el primero es el pie legal), así que un fragmento
    // suelto podría calzar con el título de otra sección.
    const encabezado = pagina.rows.slice(0, 3).map(textoFila).join('\n')
    const seccion = seccionPara(deteccion.perfil, encabezado, (n) => doc.seccionesAmbiguas.push(n))
    if (!seccion) {
      // Antes esto era un `continue` mudo: una página cuyo título no calzaba con
      // ninguna sección desaparecía sin dejar rastro en ninguna parte.
      doc.paginasSinSeccion.push(pagina.index)
      continue
    }

    const tabla = localizarTabla(pagina.rows, seccion.anclas, pagina.bandas)
    if (!tabla) {
      doc.paginasSinLeer.push(pagina.index)
      continue
    }
    doc.caminos.add(tabla.camino)

    const mapeo = mapearColumnas(tabla.columnas, seccion.mapa)
    const entradas = tabla.columnas.map((col, i) => {
      if (!mapeo[i].campo) doc.columnasSinMapear.add(col.etiqueta)
      // Una columna que tiene encabezado de agrupación pero calzó por la clave
      // genérica es sospechosa: significa que el perfil no distingue dos columnas
      // que el PDF sí distingue. Es exactamente lo que pasaba con las dos
      // "Remuneración Imponible" del comprobante de AFP.
      else if (mapeo[i].nivel === 'hoja' && col.ancestros.length) doc.columnasGenericas.add(col.etiqueta)

      const clave = `${seccion.id}|${i}|${col.etiqueta}`
      let e = columnasPorClave.get(clave)
      if (!e) {
        e = {
          seccion: seccion.id,
          i,
          etiqueta: col.etiqueta,
          claves: col.claves,
          claveUsada: mapeo[i].clave,
          nivel: mapeo[i].nivel,
          campo: mapeo[i].campo,
          desde: pagina.index,
          hasta: pagina.index,
          filasConValor: 0,
          suma: 0,
        }
        columnasPorClave.set(clave, e)
      }
      e.hasta = pagina.index
      return e
    })

    const { registros, descartadas, total, fuera, colisiones } = leerFilas(tabla)
    doc.filasLeidas += total
    doc.filasDescartadas += descartadas
    doc.celdasFuera += fuera
    doc.celdasEnColision += colisiones

    for (const { valores } of registros) {
      for (let i = 0; i < valores.length; i += 1) {
        const bruto = squish(valores[i])
        if (!bruto) continue
        entradas[i].filasConValor += 1
        const n = toNumber(bruto)
        if (n !== null) entradas[i].suma += n
      }
      const reg = construirRegistro(valores, mapeo, seccion, doc)
      if (reg) doc.registros.push(reg)
    }
  }

  doc.columnas = [...columnasPorClave.values()]
  return finalizar(doc)
}

function finalizar(doc) {
  doc.columnasSinMapear = [...doc.columnasSinMapear]
  doc.columnasGenericas = [...doc.columnasGenericas]
  doc.camposDuplicados = [...doc.camposDuplicados]
  doc.caminos = [...doc.caminos]
  return doc
}

/**
 * Arma un registro { campo: valor }.
 *
 * Si dos columnas del PDF apuntan al mismo campo canónico y son numéricas, se suman
 * — pero SÓLO si el perfil lo declara en `acumulables`. El CCAF sí lo necesita: sus
 * dos columnas de imponible (afiliados y no afiliados a isapre) alimentan a propósito
 * el mismo `impo_ccaf`. Cualquier otro caso es un error de mapeo, y antes se sumaba
 * en silencio: las tres "Remuneración Imponible" del comprobante de AFP terminaban
 * apiladas en un solo campo, con un total de 797.942.145 donde el comprobante
 * declaraba 406.998.661.
 */
function construirRegistro(valores, mapeo, seccion, doc) {
  const reg = {}
  const acumulables = new Set(seccion.acumulables ?? [])

  for (let i = 0; i < valores.length; i += 1) {
    const campo = mapeo[i]?.campo
    const bruto = squish(valores[i])
    if (!campo || !bruto) continue

    if (esNumerico(campo)) {
      const n = toNumber(bruto)
      if (n === null) {
        if (doc.valoresNoNumericos.length < 20) {
          doc.valoresNoNumericos.push({ campo, etiqueta: mapeo[i].etiqueta, valor: bruto })
        }
        continue
      }
      if (reg[campo] !== undefined && !acumulables.has(campo)) doc.camposDuplicados.add(campo)
      reg[campo] = (reg[campo] ?? 0) + n
    } else if (reg[campo] === undefined) {
      reg[campo] = bruto
    }
  }

  if (!reg.rut || !looksLikeRut(reg.rut)) return null
  const rut = parseRut(reg.rut)
  if (!rut) return null
  reg._rut = rut
  return reg
}
