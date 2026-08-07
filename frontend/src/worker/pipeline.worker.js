/**
 * Todo el trabajo pesado ocurre acá para que la pantalla no se congele:
 * descomprimir, leer los PDF, consolidar y armar el .xlsx.
 *
 * pdf.js corre en su propio worker anidado (workerSrc apunta al bundle que Vite
 * copia junto a la app), así que ni siquiera este worker se bloquea leyendo PDFs.
 */

import * as pdfjs from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

import { procesarZip } from '../lib/pipeline.js'
import { construirLibro, nombreArchivo } from '../lib/buildWorkbook.js'

// Se le pasa a pdf.js un worker ya creado por nosotros en vez de sólo la URL.
// Si se le deja crearlo a él y falla, cae en su "fake worker": ese modo corre el
// código del worker de pdf.js dentro de ESTE worker y sus llamadas a self.postMessage
// terminan llegando a la ventana principal, mezcladas con nuestros propios mensajes.
try {
  pdfjs.GlobalWorkerOptions.workerPort = new Worker(pdfWorkerUrl, { type: 'module' })
} catch {
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
}

self.onmessage = async (evento) => {
  const { zip } = evento.data
  try {
    const { documentos, filas, avisos, control } = await procesarZip(pdfjs, new Uint8Array(zip), (p) =>
      self.postMessage({ tipo: 'progreso', ...p }),
    )

    self.postMessage({ tipo: 'progreso', fase: 'generando' })
    const buffer = await construirLibro({ filas, documentos, control, avisos })
    const bytes = buffer instanceof ArrayBuffer ? buffer : new Uint8Array(buffer).buffer

    self.postMessage(
      {
        tipo: 'listo',
        archivo: nombreArchivo(documentos),
        xlsx: bytes,
        trabajadores: filas.length,
        avisos,
        control,
        // Solo los metadatos: los registros completos se quedan en el worker.
        documentos: documentos.map((d) => ({
          archivo: d.archivo,
          institucion: d.institucion ?? '',
          folio: d.folio ?? '',
          periodo: d.periodo?.texto ?? '',
          empleador: d.empleador?.nombre ?? '',
          paginas: d.paginas ?? 0,
          lineas: d.registros?.length ?? 0,
          duplicadoDe: d.duplicadoDe ?? null,
          reconocido: !!d.reconocido,
          error: d.error ?? null,
        })),
      },
      [bytes],
    )
  } catch (err) {
    self.postMessage({ tipo: 'error', mensaje: err?.message ?? String(err) })
  }
}
