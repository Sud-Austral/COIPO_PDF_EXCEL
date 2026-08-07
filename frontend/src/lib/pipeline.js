/**
 * Orquestador: ZIP -> documentos -> filas consolidadas + verificación de totales.
 * No escribe nada a disco ni hace ninguna petición de red.
 */

import { extraerPdfs, listarNoPdf } from './unzip.js'
import { parsearDocumento } from './parseDocumento.js'
import { consolidar } from './consolidate.js'

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
        totalesControl: [],
      })
    }
  }

  avisar({ fase: 'consolidando' })
  const duplicados = marcarDuplicados(documentos)
  const utiles = documentos.filter((d) => !d.duplicadoDe)
  const { filas, trabajadores, avisos } = consolidar(utiles)
  const control = verificarTotales(utiles)

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

  return { documentos, filas, trabajadores, avisos, control }
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
    for (const total of doc.totalesControl ?? []) {
      const extraido = (doc.registros ?? []).reduce((s, r) => s + Number(r[total.campo] ?? 0), 0)
      resultado.push({
        archivo: doc.archivo,
        institucion: doc.institucion,
        rotulo: total.rotulo,
        campo: total.campo,
        declarado: total.monto,
        extraido,
        ok: extraido === total.monto,
      })
    }
    if (doc.afiliadosDeclarados != null) {
      const unicos = new Set((doc.registros ?? []).map((r) => r._rut.cuerpo)).size
      resultado.push({
        archivo: doc.archivo,
        institucion: doc.institucion,
        rotulo: 'N° de Afiliados Informados',
        campo: '(rut únicos)',
        declarado: doc.afiliadosDeclarados,
        extraido: unicos,
        ok: unicos === doc.afiliadosDeclarados,
      })
    }
  }
  return resultado
}

const fmt = (n) => new Intl.NumberFormat('es-CL').format(n)
