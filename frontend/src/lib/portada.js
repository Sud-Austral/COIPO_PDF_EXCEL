/**
 * Lectura de la portada ("COMPROBANTE DE PAGO DE COTIZACIONES PREVISIONALES"):
 * datos del empleador, folio, período y los totales de control.
 *
 * Los totales son la pieza clave de la verificación: si la suma de lo extraído no
 * calza con lo que declara el propio comprobante, la hoja "Resumen" lo marca con ✘.
 */

import { norm, toNumber, parsePeriodo, squish } from './text.js'
import { textoFila } from './pdfPages.js'
import { celdaQueContiene } from './pdfRules.js'

/**
 * Antes aquí había una lista blanca de ocho rótulos, todos de caja de compensación.
 * `leerTotales` recorría la portada, extraía bien los pares rótulo→monto y DESCARTABA
 * EN SILENCIO todo lo que no estuviera en la lista. Consecuencia: el comprobante de
 * AFP PlanVital producía CERO totales de control —su portada declara la renta
 * imponible, la cotización obligatoria, el SIS y el número de afiliados, todos
 * exactos— y como el bucle de verificación no imprimía ninguna fila, el resumen decía
 * "todos los totales del comprobante cuadran".
 *
 * Ahora `paresPortada` devuelve TODOS los pares y el filtrado lo hace el mapa
 * `totales` de cada perfil, de forma declarada y auditable.
 */

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
  }

  return { folio, periodo, empleador, pares: paresPortada(filas, pagina?.bandas), texto }
}

/**
 * TODOS los pares rótulo→monto de la portada, sin filtrar.
 *
 * El cuadro "Antecedentes Generales" está a la derecha y cae en las MISMAS filas
 * visuales que el resumen de montos, así que una fila puede traer varios pares:
 *   "Renta Imponible | 406.998.661 | NUMERO AFILIADOS INFORMADOS | 409"
 * La versión anterior tomaba sólo el primer número de la fila y se perdía el resto;
 * aquí se emite un par cada vez que aparece un número, con todo el texto acumulado
 * desde el número anterior como rótulo.
 *
 * @returns {Array<{rotulo:string, monto:number, y:number, sinRotulo:boolean}>}
 */
export function paresPortada(filas, bandas) {
  // Con rayado los dos recuadros del resumen quedan separados por construcción, que es
  // el problema real de la portada del comprobante de AFP: los dos cuadros comparten
  // las mismas filas visuales y sin el rayado el rótulo de uno se pega a la cifra del
  // otro ("TOTAL REMUNERACIONES O GRATIFICACIONES" → 409, que son los afiliados).
  const conRayado = paresDesdeRayado(filas, bandas)
  if (conRayado?.length) return conRayado
  return paresPorFila(filas)
}

function paresDesdeRayado(filas, bandas) {
  if (!bandas?.length) return null
  const pares = []
  for (const banda of bandas) {
    if (banda.celdas.length < 2) continue
    const textos = banda.celdas.map(() => [])
    for (const fila of filas ?? []) {
      if (fila.y < banda.y0 || fila.y > banda.y1) continue
      for (const c of fila.celdas) {
        const k = celdaQueContiene(banda, c.xc)
        if (k >= 0) textos[k].push(c.texto)
      }
    }
    const t = textos.map((x) => squish(x.join(' ')))
    for (let k = 0; k < t.length; k += 1) {
      const monto = toNumber(t[k])
      if (monto === null) continue
      const izquierda = k > 0 && t[k - 1] && toNumber(t[k - 1]) === null ? t[k - 1] : ''
      // El cuadro de antecedentes generales pone el rótulo ENCIMA de la cifra, no a su
      // izquierda ("NUMERO AFILIADOS INFORMADOS" arriba, "409" abajo).
      const rotulo = izquierda || rotuloSobreCelda(filas, banda, banda.celdas[k])
      if (!rotulo) continue
      pares.push({
        rotulo,
        monto,
        y: banda.y0,
        recuadro: Math.round(banda.celdas[Math.max(0, k - 1)].x0),
        sinRotulo: false,
      })
    }
  }
  return pares
}

/** Texto no numérico que hay justo encima de una celda, solapándose en x. */
function rotuloSobreCelda(filas, banda, celda) {
  const candidatas = (filas ?? [])
    .filter((f) => f.y < banda.y0 && banda.y0 - f.y <= 24)
    .sort((a, b) => b.y - a.y)
  for (const fila of candidatas) {
    const textos = fila.celdas.filter(
      (c) => toNumber(c.texto) === null && c.x1 > celda.x0 - 4 && c.x0 < celda.x1 + 4,
    )
    if (textos.length) return squish(textos.map((c) => c.texto).join(' '))
  }
  return ''
}

function paresPorFila(filas) {
  const pares = []
  const todas = filas ?? []
  for (let f = 0; f < todas.length; f += 1) {
    const fila = todas[f]
    let etiqueta = []
    for (const celda of fila.celdas) {
      const n = toNumber(celda.texto)
      if (n === null) {
        etiqueta.push(celda.texto)
        continue
      }
      // Un monto sin nada a su izquierda hereda el rótulo de la celda que tiene
      // encima: en el cuadro de antecedentes generales el rótulo va en un renglón
      // y la cifra en el siguiente ("N° de Afiliados Informados" / "3.610").
      const rotulo = etiqueta.length ? squish(etiqueta.join(' ')) : rotuloArriba(todas, f, celda)
      pares.push({ rotulo, monto: n, y: fila.y, sinRotulo: !rotulo })
      etiqueta = []
    }
  }
  return pares
}

/** Busca hacia arriba un texto no numérico que se solape en x con la celda dada. */
function rotuloArriba(filas, desde, celda) {
  for (let i = desde - 1; i >= 0 && desde - i <= 3; i -= 1) {
    const encima = filas[i].celdas.filter(
      (c) => toNumber(c.texto) === null && c.x1 > celda.x0 && c.x0 < celda.x1,
    )
    if (encima.length) return squish(encima.map((c) => c.texto).join(' '))
  }
  return ''
}

/**
 * Compara los pares de la portada contra lo extraído, según el mapa `totales` del
 * perfil. Cada entrada del mapa puede ser:
 *   {campo}              la suma de ese campo canónico
 *   {suma: [campos]}     la suma de varios campos (p.ej. "TOTAL A PAGAR…")
 *   {conteo:'rutUnicos'} el número de RUT distintos, opcionalmente {donde: campo}
 *   {informativo: '…'}   se reconoce a propósito y no se compara; se dice por qué
 *   {prefijo: true}      el rótulo del PDF empieza por la clave y sigue con algo
 *                        variable (el nombre de la AFP, de la caja…)
 *
 * @returns {{comparaciones:Array, sinComparar:Array, informativos:Array}}
 */
export function compararPortada(pares, mapa, registros) {
  const comparaciones = []
  const sinComparar = []
  const informativos = []
  if (!mapa) return { comparaciones, sinComparar: [...(pares ?? [])], informativos }

  const claves = Object.keys(mapa)
  const sumaDe = (campo) => (registros ?? []).reduce((s, r) => s + Number(r[campo] ?? 0), 0)

  for (const par of pares ?? []) {
    const clave = norm(par.rotulo)
    let def = mapa[clave]
    if (!def) {
      // {prefijo:true}: el rótulo real lleva un sufijo variable, como
      // "TOTAL A PAGAR FONDO DE PENSIONES **AFP PlanVital**".
      const k = claves.find((c) => mapa[c].prefijo && clave.startsWith(c))
      if (k) def = mapa[k]
    }
    if (!def) {
      sinComparar.push(par)
      continue
    }
    if (def.informativo) {
      informativos.push({ ...par, motivo: def.informativo })
      continue
    }

    let extraido
    let campo
    if (def.alternativas) {
      // El mismo rótulo aparece en dos recuadros con montos distintos ("TOTAL
      // REMUNERACIONES O GRATIFICACIONES", una vez por el fondo de pensiones y otra
      // por el de cesantía). Se acepta si calza con alguno de los campos candidatos, y
      // se deja escrito con cuál: sigue siendo una comprobación, no un pase libre.
      const calza = def.alternativas.find((c) => sumaDe(c) === par.monto)
      campo = calza ?? def.alternativas.join(' | ')
      extraido = calza ? par.monto : sumaDe(def.alternativas[0])
    } else if (def.conteo === 'rutUnicos') {
      campo = def.donde ? `(rut únicos con ${def.donde})` : '(rut únicos)'
      const filtrados = (registros ?? []).filter((r) => (def.donde ? Number(r[def.donde] ?? 0) > 0 : true))
      extraido = new Set(filtrados.map((r) => r._rut?.cuerpo).filter(Boolean)).size
    } else if (def.suma) {
      // "COTIZACIÓN - REBAJAS" y "TOTAL A PAGAR" son restas: lo cotizado menos lo que
      // la caja devuelve por asignación familiar.
      campo = [def.suma.join(' + '), ...(def.menos ?? []).map((c) => `− ${c}`)].join(' ')
      extraido = def.suma.reduce((s, c) => s + sumaDe(c), 0) - (def.menos ?? []).reduce((s, c) => s + sumaDe(c), 0)
    } else {
      campo = def.campo
      extraido = sumaDe(def.campo)
    }
    comparaciones.push({ rotulo: par.rotulo, campo, declarado: par.monto, extraido, ok: extraido === par.monto })
  }
  return { comparaciones, sinComparar, informativos }
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

