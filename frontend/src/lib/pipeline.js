/**
 * Orquestador: ZIP -> documentos -> filas consolidadas + verificación de totales.
 * No escribe nada a disco ni hace ninguna petición de red.
 */

import { extraerPdfs, listarNoPdf } from './unzip.js'
import { parsearDocumento } from './parseDocumento.js'
import { consolidar } from './consolidate.js'
import { compararPortada } from './portada.js'
import { ENCABEZADOS } from './previredLayout.js'
import { estadoDelDocumento, avisosDeDocumento, VERIFICADO, SIN_VERIFICAR, NO_CUADRA } from './verificacion.js'

/**
 * @param {object} pdfjs módulo pdfjs-dist ya configurado
 * @param {Uint8Array} zipBytes
 * @param {(e:object) => void} [onProgress] {fase, archivo, indice, total, pagina, paginas}
 */
export async function procesarZip(pdfjs, zipBytes, onProgress) {
  const avisar = (e) => onProgress && onProgress(e)

  avisar({ fase: 'descomprimiendo' })
  const pdfs = extraerPdfs(zipBytes)
  if (pdfs.length === 0) throw new Error('El ZIP no contiene ningún archivo .pdf')

  const ignorados = listarNoPdf(zipBytes)
  const documentos = []

  for (let i = 0; i < pdfs.length; i += 1) {
    const archivo = pdfs[i]
    avisar({ fase: 'leyendo', archivo: archivo.nombre, indice: i + 1, total: pdfs.length, pagina: 0, paginas: 0 })
    try {
      const doc = await parsearDocumento(pdfjs, archivo, ({ pagina, total }) => {
        avisar({ fase: 'leyendo', archivo: archivo.nombre, indice: i + 1, total: pdfs.length, pagina, paginas: total })
      })
      documentos.push(doc)
    } catch (err) {
      documentos.push({
        archivo: archivo.nombre,
        reconocido: false,
        error: err?.message ?? String(err),
        registros: [],
        paginas: 0,
        paresPortada: [],
      })
    }
  }

  avisar({ fase: 'consolidando' })
  const duplicados = marcarDuplicados(documentos)
  const utiles = documentos.filter((d) => !d.duplicadoDe)
  const { filas, trabajadores, avisos } = consolidar(utiles)
  const control = verificarTotales(utiles)

  // Estado por documento y avisos de todo lo que se descartó. Va antes del resto de
  // los avisos para que lo primero que se lea sea qué no está verificado.
  for (const doc of utiles) {
    const { estado, motivos } = estadoDelDocumento(doc, control.filter((c) => c.archivo === doc.archivo))
    doc.estado = estado
    doc.motivos = motivos
    avisos.push(...avisosDeDocumento(doc))
    if (estado !== VERIFICADO) {
      avisos.unshift({
        tipo: estado === NO_CUADRA ? 'Documento que no cuadra' : 'Documento SIN VERIFICAR',
        archivo: doc.archivo,
        detalle: motivos.join(' '),
      })
    }
  }
  const estado = peorEstado(utiles)

  // Una columna que sale igual en TODAS las filas casi siempre significa que nadie la
  // alimentó. Es el aviso más barato que existe y habría bastado para ver el problema:
  // con el comprobante de AFP mal clasificado salían 86 de 108 constantes.
  const constantes = ENCABEZADOS.filter((_, i) => new Set(filas.map((f) => String(f[i] ?? ''))).size <= 1)
  if (constantes.length) {
    avisos.push({
      tipo: 'Columnas constantes en el consolidado',
      archivo: '',
      detalle: `${constantes.length} de ${ENCABEZADOS.length} columnas salen iguales en todas las filas: ${constantes.join(', ')}`,
    })
  }

  for (const doc of duplicados) {
    avisos.unshift({
      tipo: 'PDF duplicado',
      archivo: doc.archivo,
      detalle: `Mismo folio ${doc.folio} que "${doc.duplicadoDe}". Se procesó una sola vez para no duplicar los montos.`,
    })
  }
  for (const doc of documentos) {
    if (doc.error) avisos.unshift({ tipo: 'Error al leer el PDF', archivo: doc.archivo, detalle: doc.error })
  }
  for (const nombre of ignorados) {
    avisos.push({ tipo: 'Archivo ignorado', archivo: nombre, detalle: 'No es un .pdf' })
  }
  for (const c of control) {
    if (!c.ok) {
      avisos.unshift({
        tipo: 'Total no cuadra',
        archivo: c.archivo,
        detalle: `${c.rotulo}: el comprobante dice ${fmt(c.declarado)} y lo extraído suma ${fmt(c.extraido)} (dif. ${fmt(c.extraido - c.declarado)})`,
      })
    }
  }

  return { documentos, filas, trabajadores, avisos, control, estado }
}

/** El estado del ZIP es el peor de sus documentos. */
function peorEstado(documentos) {
  if (documentos.some((d) => d.estado === NO_CUADRA)) return NO_CUADRA
  if (documentos.some((d) => d.estado === SIN_VERIFICAR)) return SIN_VERIFICAR
  return VERIFICADO
}

/**
 * Un mismo comprobante puede venir repetido en el ZIP (con otro nombre de archivo).
 * El folio identifica el comprobante, así que se procesa una sola vez: si no,
 * los montos se sumarían dos o tres veces sin que nadie lo note.
 *
 * @returns {Array} los documentos marcados como duplicados
 */
function marcarDuplicados(documentos) {
  const vistos = new Map()
  const duplicados = []
  for (const doc of documentos) {
    if (!doc.folio) continue
    const clave = `${doc.institucion}|${doc.folio}|${doc.periodo?.texto ?? ''}`
    if (vistos.has(clave)) {
      doc.duplicadoDe = vistos.get(clave)
      duplicados.push(doc)
    } else {
      vistos.set(clave, doc.archivo)
    }
  }
  return duplicados
}

/**
 * Compara los totales que declara la portada de cada PDF contra la suma de lo
 * que efectivamente se extrajo. Es la comprobación que da el ✔/✘ de la hoja Resumen.
 */
export function verificarTotales(documentos) {
  const resultado = []
  for (const doc of documentos) {
    const { comparaciones, sinComparar, informativos } = compararPortada(
      doc.paresPortada,
      doc.perfil?.totales,
      doc.registros,
    )
    // Se anota en el documento para poder decir cuánta portada quedó sin cotejar:
    // la cobertura es tan importante como el resultado de las comparaciones.
    doc.cobertura = {
      pares: (doc.paresPortada ?? []).length,
      comparados: comparaciones.length,
      informativos: informativos.length,
      sinComparar: sinComparar.length,
    }
    doc.paresSinComparar = sinComparar
    for (const c of comparaciones) {
      resultado.push({ archivo: doc.archivo, institucion: doc.institucion, ...c })
    }
  }
  return resultado
}

const fmt = (n) => new Intl.NumberFormat('es-CL').format(n)
