/**
 * Construcción del .xlsx de salida (tres hojas):
 *
 *   TXT CONSOLIDADO  las 108 columnas del layout Previred, una fila por trabajador
 *   Resumen          un renglón por PDF + los totales de control con ✔/✘
 *   Revisar          todo lo que quedó dudoso, para que nada se pierda en silencio
 *
 * ExcelJS trae campo "browser" en su package.json, así que Vite toma el build de
 * navegador (sin stream/buffer de Node) y el arnés de verificación toma el de Node.
 */

import ExcelJS from 'exceljs'

import { COLUMNAS, ENCABEZADOS } from './previredLayout.js'

const AZUL = 'FF1F3864'
const GRIS = 'FFF2F2F2'
const VERDE = 'FF2E7D32'
const ROJO = 'FFC62828'

function encabezar(hoja, titulos, anchos) {
  hoja.addRow(titulos)
  const fila = hoja.getRow(1)
  fila.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
  fila.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } }
  fila.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  fila.height = 28
  titulos.forEach((t, i) => {
    hoja.getColumn(i + 1).width = anchos ? anchos[i] : Math.min(40, Math.max(10, String(t).length + 2))
  })
  hoja.views = [{ state: 'frozen', ySplit: 1 }]
}

/**
 * @param {{filas:Array, documentos:Array, control:Array, avisos:Array}} datos
 * @returns {Promise<Blob|Buffer>} el archivo .xlsx
 */
export async function construirLibro({ filas, documentos, control, avisos }) {
  const libro = new ExcelJS.Workbook()
  libro.creator = 'COIPO — Consolidador Previred'
  libro.created = new Date()

  hojaConsolidado(libro, filas)
  hojaResumen(libro, documentos, control)
  hojaRevisar(libro, avisos)

  const buffer = await libro.xlsx.writeBuffer()
  return buffer
}

function hojaConsolidado(libro, filas) {
  const hoja = libro.addWorksheet('TXT CONSOLIDADO', { views: [{ state: 'frozen', ySplit: 1 }] })

  // Los estilos se declaran A NIVEL DE COLUMNA antes de cargar los datos. Si se
  // asignan después (hoja.getColumn(i).numFmt = …) ExcelJS recorre las 390.000
  // celdas una por una y la generación pasa de ~2 s a ~13 s.
  hoja.columns = ENCABEZADOS.map((titulo, i) => {
    const muestra = filas.slice(0, 200).reduce((m, f) => Math.max(m, String(f[i] ?? '').length), 0)
    return {
      header: titulo,
      width: Math.min(26, Math.max(8, Math.max(titulo.length, muestra) + 2)),
      // Enteros sin separador de miles, igual que en el archivo plano de Previred.
      style: COLUMNAS[i].tipo === 'num' ? { numFmt: '0', alignment: { horizontal: 'right' } } : undefined,
    }
  })

  const cabecera = hoja.getRow(1)
  cabecera.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
  cabecera.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } }
  cabecera.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  cabecera.height = 28

  hoja.addRows(filas)

  if (filas.length > 0) {
    hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ENCABEZADOS.length } }
  }
  return hoja
}

function hojaResumen(libro, documentos, control) {
  const hoja = libro.addWorksheet('Resumen')
  const titulos = ['Archivo', 'Institución', 'Folio', 'Período', 'Empleador', 'Páginas', 'Líneas leídas', 'Estado']
  encabezar(hoja, titulos, [34, 30, 22, 10, 34, 9, 13, 26])

  for (const d of documentos) {
    let estado = 'Procesado'
    if (d.error) estado = `Error: ${d.error}`
    else if (d.duplicadoDe) estado = `Duplicado de ${d.duplicadoDe}`
    else if (!d.reconocido) estado = 'Institución no reconocida'

    const fila = hoja.addRow([
      d.archivo,
      d.institucion ?? '',
      d.folio ?? '',
      d.periodo?.texto ?? '',
      d.empleador?.nombre ?? '',
      d.paginas ?? 0,
      d.registros?.length ?? 0,
      estado,
    ])
    if (estado !== 'Procesado') fila.getCell(8).font = { color: { argb: ROJO } }
  }

  hoja.addRow([])
  const tituloControl = hoja.addRow(['Totales de control declarados por cada comprobante'])
  tituloControl.font = { bold: true, size: 12 }
  hoja.addRow([])

  const filaCab = hoja.addRow(['Archivo', 'Concepto', 'Dice el comprobante', 'Suma de lo extraído', 'Diferencia', ''])
  filaCab.font = { bold: true }
  filaCab.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS } }

  for (const c of control) {
    const fila = hoja.addRow([c.archivo, c.rotulo, c.declarado, c.extraido, c.extraido - c.declarado, c.ok ? '✔' : '✘'])
    fila.getCell(3).numFmt = '#,##0'
    fila.getCell(4).numFmt = '#,##0'
    fila.getCell(5).numFmt = '#,##0'
    fila.getCell(6).font = { bold: true, color: { argb: c.ok ? VERDE : ROJO } }
    fila.getCell(6).alignment = { horizontal: 'center' }
  }

  hoja.addRow([])
  const nota = hoja.addRow(['Advertencias sobre el contenido'])
  nota.font = { bold: true, size: 12 }
  for (const linea of NOTAS) hoja.addRow([linea])
  return hoja
}

const NOTAS = [
  'cod_mov: el PDF usa la codificación de movimientos de la caja (1 Contrataciones, 2 Retiros, 3 Subsidios, ' +
    '4 Permiso sin goce, 5 Remuneraciones…), que NO equivale al código de movimiento de personal de Previred. ' +
    'Se copia tal cual viene en el comprobante; revísalo antes de usarlo como archivo plano.',
  'Nombres: la columna del PDF tiene ancho fijo y recorta los nombres largos. Los casos detectados están en la hoja Revisar.',
  'Columnas sin dato: las que ninguna institución del ZIP alimenta quedan en 0 o vacías, no se inventan valores.',
  'Los montos provienen del comprobante de la institución, que puede diferir de lo declarado previamente por el empleador.',
]

function hojaRevisar(libro, avisos) {
  const hoja = libro.addWorksheet('Revisar')
  encabezar(hoja, ['Tipo', 'Archivo', 'Detalle'], [26, 30, 100])
  if (avisos.length === 0) {
    hoja.addRow(['—', '', 'Sin observaciones: todo se leyó y se mapeó correctamente.'])
    return hoja
  }
  for (const a of avisos) hoja.addRow([a.tipo, a.archivo ?? '', a.detalle ?? ''])
  hoja.getColumn(3).alignment = { wrapText: true, vertical: 'top' }
  return hoja
}

/** Nombre sugerido del archivo: consolidado-previred-072026.xlsx */
export function nombreArchivo(documentos) {
  const periodo = documentos.find((d) => d.periodo)?.periodo
  const sufijo = periodo ? `-${String(periodo.mes).padStart(2, '0')}${periodo.anio}` : ''
  return `consolidado-previred${sufijo}.xlsx`
}
