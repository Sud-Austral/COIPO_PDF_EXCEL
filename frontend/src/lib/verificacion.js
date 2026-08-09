/**
 * ¿ESTE DOCUMENTO ESTÁ VERIFICADO?
 *
 * Antes había dos estados de hecho: "algún total no cuadra" y "todo bien". El problema
 * es que "todo bien" incluía el caso de no haber comprobado NADA. Un comprobante de AFP
 * entero se clasificó como AFC, no generó ni una sola comparación, y la app dijo "todos
 * los totales del comprobante cuadran" — porque cero totales fallidos de cero totales
 * da cero.
 *
 * De ahí la regla central de este módulo: **un documento que no puede contradecirse a
 * sí mismo no está verificado**. Son tres estados, no dos:
 *
 *   ✔ verificado     se comprobó contra su propia portada y todo calzó
 *   ⚠ sin verificar  no hay con qué comprobarlo, o quedó algo sin cotejar
 *   ✘ no cuadra      se comprobó y no calza
 */

import { CAMPOS } from './campos.js'

export const VERIFICADO = 'verificado'
export const SIN_VERIFICAR = 'sin verificar'
export const NO_CUADRA = 'no cuadra'

/** Margen mínimo de puntaje entre la institución elegida y la segunda. */
const MARGEN_DETECCION = 4

/**
 * @param {object} doc documento de parsearDocumento, ya con doc.cobertura
 * @param {Array} control filas de verificarTotales de ESTE documento
 * @returns {{estado:string, motivos:string[]}}
 */
export function estadoDelDocumento(doc, control) {
  const motivos = []

  if (doc.error) return { estado: NO_CUADRA, motivos: [`No se pudo leer: ${doc.error}`] }
  if (!doc.reconocido) return { estado: SIN_VERIFICAR, motivos: ['No se identificó la institución.'] }

  if (doc.deteccion?.ambigua) {
    motivos.push(
      `Institución ambigua: ${doc.deteccion.bloque} (${doc.deteccion.puntaje}) apenas por encima de ` +
        `${doc.deteccion.segundo?.bloque} (${doc.deteccion.segundo?.puntaje}); se exige ${MARGEN_DETECCION} de margen.`,
    )
  }

  // LA REGLA QUE FALTABA.
  if (control.length === 0) {
    motivos.push('Ningún total de control: no hay nada en la portada contra qué comprobar lo extraído.')
  }

  const fallidos = control.filter((c) => !c.ok)
  for (const c of fallidos) {
    motivos.push(`${c.rotulo}: el comprobante dice ${fmt(c.declarado)} y lo extraído suma ${fmt(c.extraido)}.`)
  }

  // Cobertura de campos: todo lo que sale al Excel tiene que estar respaldado por
  // alguna comparación. Un campo con monto y sin control es un número sin aval.
  const respaldados = new Set()
  for (const c of control) for (const campo of String(c.campo ?? '').split(/[+−\s]+/)) respaldados.add(campo)
  // Un campo puede no tener respaldo posible porque el comprobante no declara ese
  // total. Eso vale, pero tiene que estar DECLARADO en el perfil, con su motivo.
  const declarados = doc.perfil?.sinRespaldo ?? {}
  const sinRespaldo = camposConMonto(doc).filter((campo) => !respaldados.has(campo) && !declarados[campo])
  if (sinRespaldo.length) {
    motivos.push(`Campos con monto y sin ningún total que los respalde: ${sinRespaldo.join(', ')}.`)
  }

  if (doc.paginasSinLeer?.length) motivos.push(`Páginas sin tabla: ${doc.paginasSinLeer.join(', ')}.`)
  if (doc.paginasSinSeccion?.length) motivos.push(`Páginas sin sección reconocida: ${doc.paginasSinSeccion.join(', ')}.`)
  if (doc.camposDuplicados?.length) {
    motivos.push(`Dos columnas al mismo campo (no declarado acumulable): ${doc.camposDuplicados.join(', ')}.`)
  }

  if (fallidos.length) return { estado: NO_CUADRA, motivos }
  return { estado: motivos.length ? SIN_VERIFICAR : VERIFICADO, motivos }
}

/** Campos numéricos que este documento sí aportó con monto distinto de cero. */
function camposConMonto(doc) {
  const con = new Set()
  for (const reg of doc.registros ?? []) {
    for (const [campo, valor] of Object.entries(reg)) {
      if (campo.startsWith('_')) continue
      if (CAMPOS[campo]?.agg !== 'suma') continue
      if (Number(valor)) con.add(campo)
    }
  }
  return [...con].sort()
}

/**
 * Avisos de todo lo que el extractor descartó o no pudo decidir. Cada uno corresponde
 * a un `continue` que antes era mudo.
 */
export function avisosDeDocumento(doc) {
  const avisos = []
  const push = (tipo, detalle) => avisos.push({ tipo, archivo: doc.archivo, detalle })

  for (const etiqueta of doc.columnasSinMapear ?? []) push('Columna sin mapear', etiqueta)
  for (const etiqueta of doc.columnasGenericas ?? []) {
    push(
      'Columna mapeada por clave genérica',
      `${etiqueta} — calzó sin usar su encabezado de agrupación; si hay otra columna con el mismo rótulo, se están confundiendo.`,
    )
  }
  for (const pagina of doc.paginasSinLeer ?? []) push('Página sin leer', `Página ${pagina}: no se encontró la tabla.`)
  for (const pagina of doc.paginasSinSeccion ?? []) {
    push('Página sin sección', `Página ${pagina}: su título no calza con ninguna sección del perfil.`)
  }
  for (const s of doc.seccionesAmbiguas ?? []) push('Página con sección ambigua', `Calzaron varias secciones: ${s}.`)
  for (const campo of doc.camposDuplicados ?? []) {
    push('Dos columnas al mismo campo', `${campo}: dos columnas distintas escriben aquí y el perfil no lo declara acumulable.`)
  }
  for (const v of doc.valoresNoNumericos ?? []) {
    push('Valor no numérico en columna mapeada', `${v.etiqueta} → ${v.campo}: "${v.valor}"`)
  }
  if (doc.filasDescartadas) {
    push('Filas de datos descartadas', `${doc.filasDescartadas} de ${doc.filasLeidas} filas no traían RUT y no se leyeron.`)
  }
  if (doc.celdasFuera) push('Celda fuera de su columna', `${doc.celdasFuera} celda(s) no cayeron dentro de ninguna columna.`)
  if (doc.celdasEnColision) {
    push('Dos celdas en la misma columna', `${doc.celdasEnColision} vez/veces se concatenaron dos valores en una celda.`)
  }
  if (doc.reconocido && !doc.folio) {
    push('PDF sin folio', 'Sin folio no se puede detectar si este comprobante viene repetido en el ZIP.')
  }
  for (const p of doc.paresSinComparar ?? []) {
    if (!p.rotulo) push('Monto de portada sin rótulo', `${fmt(p.monto)} — no se pudo saber a qué concepto corresponde.`)
    else push('Total de portada sin comparar', `${p.rotulo}: ${fmt(p.monto)} — el perfil no dice contra qué cotejarlo.`)
  }
  return avisos
}

const fmt = (n) => new Intl.NumberFormat('es-CL').format(n)
