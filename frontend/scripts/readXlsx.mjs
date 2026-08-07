/**
 * Lector mínimo de .xlsx, solo para el arnés de verificación (Node).
 * No forma parte de la app: la app únicamente ESCRIBE Excel, nunca lo lee.
 */
import fs from 'node:fs'
import { unzipSync, strFromU8 } from 'fflate'

const desescapar = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&')

const numeroColumna = (ref) => {
  const letras = /^[A-Z]+/.exec(ref)[0]
  let n = 0
  for (const ch of letras) n = n * 26 + ch.charCodeAt(0) - 64
  return n
}

/**
 * @param {string} ruta ruta al .xlsx
 * @param {string} parteHoja p. ej. 'xl/worksheets/sheet4.xml'
 * @returns {Array<Record<number,string>>} filas, cada una como { nColumna: valor }
 */
export function leerHoja(ruta, parteHoja) {
  const archivos = unzipSync(new Uint8Array(fs.readFileSync(ruta)))

  const sst = []
  if (archivos['xl/sharedStrings.xml']) {
    const xml = strFromU8(archivos['xl/sharedStrings.xml'])
    for (const si of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      sst.push(
        desescapar([...si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')),
      )
    }
  }

  const hoja = strFromU8(archivos[parteHoja])
  const filas = []
  // Acepta tanto <c .../> (celda vacía) como <c ...>…</c>.
  const reCelda = /<c\s+r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g
  for (const rm of hoja.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const celdas = {}
    reCelda.lastIndex = 0
    for (const cm of rm[1].matchAll(reCelda)) {
      const cuerpo = cm[3]
      if (!cuerpo) continue
      const esCompartida = / t="s"/.test(cm[2])
      const esInline = / t="(?:inlineStr|str)"/.test(cm[2])
      const v = /<v>([\s\S]*?)<\/v>/.exec(cuerpo)
      if (esInline) {
        const t = /<t[^>]*>([\s\S]*?)<\/t>/.exec(cuerpo)
        celdas[numeroColumna(cm[1])] = t ? desescapar(t[1]) : v ? desescapar(v[1]) : ''
        continue
      }
      if (!v) continue
      celdas[numeroColumna(cm[1])] = esCompartida ? sst[Number(v[1])] : v[1]
    }
    filas.push(celdas)
  }
  return filas
}
