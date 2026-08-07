/**
 * Consolidación: de N documentos con M líneas cada uno a UNA fila por trabajador
 * con el layout Previred de 108 columnas.
 */

import { CAMPOS } from './campos.js'
import { filaVacia, indiceDe, IDX_RUT_AUX, IDX_CAJA_AUX, IDX_LINEA_AUX, COD_CCAF } from './previredLayout.js'
import { dateKey, norm } from './text.js'
import { partirNombre, dvCalculado } from './rut.js'

/**
 * Acumula un registro sobre el estado de un trabajador según la regla de cada campo.
 */
function acumular(acc, campo, valor) {
  const def = CAMPOS[campo]
  if (!def) return
  const previo = acc[campo]

  switch (def.agg) {
    case 'suma':
      acc[campo] = (previo ?? 0) + Number(valor || 0)
      break
    case 'max':
      acc[campo] = Math.max(previo ?? 0, Number(valor || 0))
      break
    case 'minFecha':
      if (previo === undefined || (dateKey(valor) ?? Infinity) < (dateKey(previo) ?? Infinity)) acc[campo] = valor
      break
    case 'maxFecha':
      if (previo === undefined || (dateKey(valor) ?? -Infinity) > (dateKey(previo) ?? -Infinity)) acc[campo] = valor
      break
    case 'nombreLargo':
      if (previo === undefined || String(valor).length > String(previo).length) acc[campo] = valor
      break
    default: // 'primero'
      if (previo === undefined || previo === '' || previo === 0) acc[campo] = valor
  }
}

/**
 * @param {Array} documentos salida de parsearDocumento
 * @returns {{filas:Array, trabajadores:Array, avisos:Array}}
 */
export function consolidar(documentos) {
  /** @type {Map<string, object>} clave = RUT sin puntos ni dígito verificador */
  const porRut = new Map()
  const avisos = []

  for (const doc of documentos) {
    if (!doc.reconocido) {
      avisos.push({ tipo: 'PDF no reconocido', archivo: doc.archivo, detalle: 'No se identificó la institución; el archivo no aportó datos.' })
      continue
    }
    for (const etiqueta of doc.columnasSinMapear ?? []) {
      avisos.push({ tipo: 'Columna sin mapear', archivo: doc.archivo, detalle: etiqueta })
    }
    for (const pagina of doc.paginasSinLeer ?? []) {
      avisos.push({ tipo: 'Página sin leer', archivo: doc.archivo, detalle: `Página ${pagina}: no se encontró la tabla.` })
    }

    for (const reg of doc.registros) {
      const clave = reg._rut.cuerpo
      let acc = porRut.get(clave)
      if (!acc) {
        acc = { _rut: reg._rut, _origen: new Set(), _bloques: new Set(), _lineas: 0 }
        porRut.set(clave, acc)
      }
      acc._origen.add(doc.institucion)
      acc._bloques.add(doc.bloque)
      acc._lineas += 1
      if (doc.periodo && !acc._periodo) acc._periodo = doc.periodo
      if (doc.bloque === 'ccaf' && !acc._ccaf) acc._ccaf = doc.institucion
      if (doc.perfil?.regPrevi && !acc._regPrevi) acc._regPrevi = doc.perfil.regPrevi
      if (doc.perfil?.codInstSalud && !acc._codInstSalud) acc._codInstSalud = doc.perfil.codInstSalud

      for (const [campo, valor] of Object.entries(reg)) {
        if (campo.startsWith('_')) continue
        acumular(acc, campo, valor)
      }
    }
  }

  const trabajadores = [...porRut.values()].sort((a, b) =>
    (a.nombre ?? '').localeCompare(b.nombre ?? '', 'es'),
  )

  const filas = trabajadores.map((t, i) => construirFila(t, i + 1, avisos))
  return { filas, trabajadores, avisos }
}

/** Escribe un trabajador consolidado en una fila de 108 columnas. */
function construirFila(t, correlativo, avisos) {
  const fila = filaVacia()
  const set = (campo, valor) => {
    fila[indiceDe(campo)] = valor
  }

  // Columnas auxiliares A, B y C de la planilla de personal.
  fila[IDX_RUT_AUX] = t._rut.cuerpo
  fila[IDX_CAJA_AUX] = nombreCajaCorto(t._ccaf)
  fila[IDX_LINEA_AUX] = correlativo

  set('rut', t._rut.cuerpo)
  set('dv', t._rut.dv)
  if (!t._rut.valido) {
    avisos.push({
      tipo: 'RUT inválido',
      archivo: '',
      detalle: `${t._rut.texto} — el dígito verificador debería ser ${dvCalculado(t._rut.cuerpo)}`,
    })
  }

  const partes = partirNombre(t.nombre ?? '')
  set('ape_pat', partes.ape_pat)
  set('ape_mat', partes.ape_mat)
  set('nombres', partes.nombres)
  if (nombreIncompleto(t.nombre)) {
    avisos.push({
      tipo: 'Nombre incompleto',
      archivo: '',
      detalle: `${t._rut.texto} — "${t.nombre}" termina en una preposición o artículo; falta al menos una palabra.`,
    })
  }

  if (t._periodo) {
    set('remu_desde', t._periodo.previred)
    set('remu_hasta', t._periodo.previred)
  }
  if (t._regPrevi) set('reg_previ', t._regPrevi)
  if (t._codInstSalud) set('cod_inst_salud', t._codInstSalud)
  if (t._ccaf) {
    const cod = COD_CCAF[norm(t._ccaf).replace('caja de compensacion ', '')]
    if (cod) set('cod_CCAF', cod)
  }

  // Campos canónicos que tienen columna directa en el layout.
  for (const [campo, def] of Object.entries(CAMPOS)) {
    if (!def.col || t[campo] === undefined) continue
    fila[indiceDe(def.col)] = t[campo]
  }

  // El RUT de la entidad pagadora de subsidio va partido en dos columnas.
  if (t.rutSubs && t.rutSubs !== '0') {
    const partesRut = /^([\d.]+)-([\dkK])$/.exec(t.rutSubs)
    if (partesRut) {
      set('rut_pag_subs', Number(partesRut[1].replace(/\./g, '')))
      set('dv_pag_subs', partesRut[2].toUpperCase())
    }
  }

  return fila
}

/**
 * El nombre que informa la institución puede venir más corto que el de la ficha del
 * empleador (en la muestra CCAF pasa en 68 de 3.610 casos). No hay forma de
 * recuperarlo desde el PDF, pero cuando el corte deja la última palabra en una
 * preposición o artículo el nombre está inequívocamente incompleto y se avisa.
 */
const FINAL_INCOMPLETO = /\s(DE|DEL|LA|LAS|LOS|Y|SAN|SANTA|DA|DOS|VON|VAN|MC|SAINT)$/i

function nombreIncompleto(nombre) {
  return FINAL_INCOMPLETO.test(String(nombre ?? '').trim())
}

/** "Caja de Compensación Los Andes" -> "CAJA LOS ANDES", como en la planilla actual. */
function nombreCajaCorto(institucion) {
  if (!institucion) return ''
  const m = /caja de compensaci[oó]n\s+(.+)/i.exec(institucion)
  return m ? `CAJA ${m[1].trim().toUpperCase()}` : institucion.toUpperCase()
}
