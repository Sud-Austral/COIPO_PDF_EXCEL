/** Descompresión del ZIP en memoria. Nada toca el disco ni sale del navegador. */

import { unzipSync } from 'fflate'

const ES_BASURA = (ruta) =>
  ruta.startsWith('__MACOSX/') ||
  ruta.split('/').pop().startsWith('._') ||
  ruta.endsWith('/') ||
  ruta.split('/').pop() === '.DS_Store'

/**
 * @param {Uint8Array} bytes contenido del .zip
 * @returns {Array<{nombre:string, ruta:string, datos:Uint8Array}>} PDFs encontrados
 */
export function extraerPdfs(bytes) {
  const archivos = unzipSync(bytes, {
    filter: (f) => !ES_BASURA(f.name) && /\.pdf$/i.test(f.name),
  })
  return Object.entries(archivos)
    .map(([ruta, datos]) => ({ ruta, nombre: ruta.split('/').pop(), datos }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

/** Lista todo lo que venía en el ZIP, para avisar si se ignoró algo que no era PDF. */
export function listarNoPdf(bytes) {
  const todo = unzipSync(bytes, { filter: (f) => !ES_BASURA(f.name) && !/\.pdf$/i.test(f.name) })
  return Object.keys(todo)
}
