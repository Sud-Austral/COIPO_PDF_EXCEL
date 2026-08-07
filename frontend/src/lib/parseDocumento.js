/**
 * Convierte UN PDF de comprobante en registros por línea, más los metadatos y
 * los totales de control de su portada.
 */

import { extraerPaginas } from './pdfPages.js'
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
    afiliadosDeclarados: portada.empleador.afiliados,
    totalesControl: portada.totales,
    institucion: deteccion?.institucion ?? '(no reconocida)',
    bloque: deteccion?.perfil.bloque ?? null,
    perfil: deteccion?.perfil ?? null,
    registros: [],
    columnasSinMapear: new Set(),
    paginasSinLeer: [],
    reconocido: !!deteccion,
  }

  if (!deteccion) return doc

  for (const pagina of pages.slice(1)) {
    const seccion = seccionPara(deteccion.perfil, pagina.texto)
    if (!seccion) continue

    const tabla = localizarTabla(pagina.rows, seccion.anclas)
    if (!tabla) {
      doc.paginasSinLeer.push(pagina.index)
      continue
    }

    const campoPorColumna = mapearColumnas(tabla.columnas, seccion.mapa)
    tabla.columnas.forEach((col, i) => {
      if (!campoPorColumna[i]) doc.columnasSinMapear.add(col.etiqueta)
    })

    for (const { valores } of leerFilas(tabla)) {
      const reg = construirRegistro(valores, campoPorColumna)
      if (reg) doc.registros.push(reg)
    }
  }

  doc.columnasSinMapear = [...doc.columnasSinMapear]
  return doc
}

/**
 * Arma un registro { campo: valor }. Si dos columnas del PDF apuntan al mismo
 * campo canónico y son numéricas, se suman (es lo que ocurre con las dos columnas
 * de imponible del comprobante CCAF).
 */
function construirRegistro(valores, campoPorColumna) {
  const reg = {}
  for (let i = 0; i < valores.length; i += 1) {
    const campo = campoPorColumna[i]
    const bruto = squish(valores[i])
    if (!campo || !bruto) continue

    if (esNumerico(campo)) {
      const n = toNumber(bruto)
      if (n === null) continue
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
