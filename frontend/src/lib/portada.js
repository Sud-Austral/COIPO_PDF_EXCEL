/**
 * Lectura de la portada ("COMPROBANTE DE PAGO DE COTIZACIONES PREVISIONALES"):
 * datos del empleador, folio, período y los totales de control.
 *
 * Los totales son la pieza clave de la verificación: si la suma de lo extraído no
 * calza con lo que declara el propio comprobante, la hoja "Resumen" lo marca con ✘.
 */

import { norm, toNumber, parsePeriodo, squish } from './text.js'
import { textoFila } from './pdfPages.js'

/** Rótulo del resumen -> campo canónico cuya suma debería igualarlo. */
const TOTALES_CONTROL = {
  'cotizacion no afiliados a isapre': 'cotCcaf',
  'asignacion familiar': 'asigFam',
  'asignacion familiar retroactiva': 'asigFamRetro',
  'reintegros de asignacion familiar': 'reintCargas',
  'creditos personales': 'credPersonal',
  'convenios dentales': 'convDental',
  leasing: 'leasing',
  'seguros de vida': 'seguroVida',
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

/**
 * El período NO se puede buscar con un `\d{2}/\d{4}` suelto: el pie legal de estos
 * comprobantes contiene "Ord. N° 3673/0181", que calzaría. Se busca por rótulo.
 *
 * @param {Array} paginas todas las páginas del documento
 */
export function detectarPeriodo(paginas) {
  for (const pagina of paginas) {
    const texto = (pagina.rows ?? []).map(textoFila).join('\n')
    const conRotulo = /Per[íi]odo\s+de\s+Remuneraciones:?\s*(\d{2}\/\d{4})/i.exec(texto)
    if (conRotulo) return parsePeriodo(conRotulo[1])

    const conMes = new RegExp(`\\b(${MESES.join('|')})\\s+(\\d{4})\\b`, 'i').exec(texto)
    if (conMes) {
      const mes = MESES.indexOf(conMes[1].toLowerCase()) + 1
      const anio = Number(conMes[2])
      return { mes, anio, texto: `${String(mes).padStart(2, '0')}/${anio}`, previred: `${mes}${anio}` }
    }
  }
  return null
}

/**
 * @param {Array} paginas páginas del documento; la portada es la primera
 * @returns {{folio:string, periodo:object|null, empleador:object, totales:Array}}
 */
export function leerPortada(paginas) {
  const pagina = paginas[0]
  const filas = pagina?.rows ?? []
  const texto = filas.map(textoFila).join('\n')

  const folio = (/N[úu]mero de Folio:\s*(\S+)/i.exec(texto) ?? [])[1] ?? ''
  const periodo = detectarPeriodo(paginas)

  const empleador = {
    nombre: valorBajo(filas, 'Nombre o Razón Social'),
    rut: valorBajo(filas, 'RUT'),
    afiliados: enteroTras(texto, /N[°º]\s*de Afiliados Informados[\s\S]{0,40}?([\d.]+)/i),
  }

  return { folio, periodo, empleador, totales: leerTotales(filas), texto }
}

/**
 * Los cuadros de la portada son pares rótulo/valor en filas consecutivas, pero no
 * están alineados entre sí: el rótulo puede ir centrado y el valor pegado a la
 * izquierda de su celda. Por eso la fila de rótulos se convierte en dominios
 * (hasta el punto medio con el rótulo vecino) y se busca el valor cuyo centro caiga
 * dentro del dominio del rótulo buscado.
 */
function valorBajo(filas, rotulo) {
  const objetivo = norm(rotulo)
  for (let i = 0; i < filas.length - 1; i += 1) {
    const rotulos = filas[i].celdas
    const k = rotulos.findIndex((c) => norm(c.texto) === objetivo)
    if (k === -1) continue

    const izq = k > 0 ? (rotulos[k - 1].x1 + rotulos[k].x0) / 2 : -Infinity
    const der = k < rotulos.length - 1 ? (rotulos[k].x1 + rotulos[k + 1].x0) / 2 : Infinity
    const valor = filas[i + 1].celdas.find((c) => c.xc >= izq && c.xc <= der)
    if (valor) return squish(valor.texto)
  }
  return ''
}

function enteroTras(texto, re) {
  const m = re.exec(texto)
  return m ? toNumber(m[1]) : null
}

/**
 * Lee el "Resumen de Cotizaciones" y el "Resumen de Productos": filas de
 * rótulo + monto que sirven como totales de control.
 */
function leerTotales(filas) {
  const totales = []
  for (const fila of filas) {
    const celdas = fila.celdas
    if (celdas.length < 2) continue

    // El cuadro "Antecedentes Generales" está a la derecha y cae en las MISMAS
    // filas visuales que el resumen de montos ("… ISAPRE | 100.331.776 | X").
    // Por eso el rótulo es todo lo que va antes del primer número, y el monto es
    // ese primer número: no sirve tomar la última celda de la fila.
    const iMonto = celdas.findIndex((c) => toNumber(c.texto) !== null)
    if (iMonto <= 0) continue

    const rotulo = squish(celdas.slice(0, iMonto).map((c) => c.texto).join(' '))
    const campo = TOTALES_CONTROL[norm(rotulo)]
    if (campo) totales.push({ rotulo, campo, monto: toNumber(celdas[iMonto].texto) })
  }
  return totales
}
