/**
 * Fixture de no-regresión: reduce el resultado de procesarZip() a agregados
 * comparables, y compara dos fixtures campo a campo.
 *
 * QUÉ SE VERSIONA Y QUÉ NO
 *   Sí: sumas por columna, filas de control, conteos, y la estructura de columnas
 *       detectadas (rótulo → clave → campo). Son los mismos agregados que el propio
 *       comprobante imprime en su portada.
 *   No: ningún dato de fila. Ni RUT, ni nombres, ni montos individuales, ni folios.
 *
 * La comparación es ASIMÉTRICA a propósito: todo lo que está en el fixture guardado
 * tiene que calzar, pero una clave nueva en el generado se reporta como "campo nuevo"
 * sin hacer fallar. Así el fixture puede crecer fase a fase sin invalidar la parte
 * congelada.
 */

import crypto from 'node:crypto'

import { ENCABEZADOS, indiceDe } from '../src/lib/previredLayout.js'
import { CAMPOS } from '../src/lib/campos.js'

export const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 16)

/** Reduce el resultado de procesarZip a agregados. */
export function construirFixture(nombreZip, bytes, resultado) {
  const { documentos, filas, trabajadores, avisos, control } = resultado

  const porArchivo = new Map()
  for (const c of control) {
    if (!porArchivo.has(c.archivo)) porArchivo.set(c.archivo, [])
    porArchivo.get(c.archivo).push({
      rotulo: c.rotulo,
      campo: c.campo,
      declarado: c.declarado,
      extraido: c.extraido,
      ok: c.ok,
    })
  }

  const docs = documentos.map((d) => ({
    archivo: d.archivo,
    paginas: d.paginas ?? 0,
    reconocido: !!d.reconocido,
    institucion: d.institucion ?? null,
    bloque: d.bloque ?? null,
    periodo: d.periodo?.texto ?? null,
    tieneFolio: !!d.folio, // el folio en sí no se versiona
    duplicado: !!d.duplicadoDe,
    lineas: (d.registros ?? []).length,
    rutUnicos: new Set((d.registros ?? []).map((r) => r._rut?.cuerpo).filter(Boolean)).size,
    afiliadosDeclarados: d.afiliadosDeclarados ?? null,
    totalesControl: (d.totalesControl ?? []).length,
    // Suma de cada campo canónico SOBRE ESTE DOCUMENTO. Es la superficie de regresión
    // real de la geometría, y al ser por documento no la contamina lo que hagan los
    // demás PDF del ZIP: sirve para congelar el CCAF sin importar qué pase con el AFP.
    sumaPorCampo: sumasDeDocumento(d),
    paginasSinLeer: [...(d.paginasSinLeer ?? [])],
    columnasSinMapear: [...(d.columnasSinMapear ?? [])].sort(),
    // Estructura de columnas: la superficie de regresión real. La llena parseDocumento
    // a partir de la fase 1; mientras no exista, queda como arreglo vacío.
    columnas: (d.columnas ?? []).map((c) => ({
      seccion: c.seccion,
      i: c.i,
      etiqueta: c.etiqueta,
      claveUsada: c.claveUsada ?? null,
      nivel: c.nivel ?? null,
      campo: c.campo ?? null,
      filasConValor: c.filasConValor ?? 0,
      suma: c.suma ?? 0,
    })),
    control: porArchivo.get(d.archivo) ?? [],
    // Indexado por rótulo además de por posición: así una comparación NUEVA no
    // desplaza a las de antes y el congelado sigue valiendo.
    controlPorRotulo: Object.fromEntries(
      (porArchivo.get(d.archivo) ?? []).map((c) => [c.rotulo, { declarado: c.declarado, extraido: c.extraido, ok: c.ok }]),
    ),
  }))

  // Una entrada por columna del layout: distintos + suma. Es lo que detecta que un
  // cambio de geometría movió un monto de sitio.
  const columnas = {}
  const constantes = []
  for (let i = 0; i < ENCABEZADOS.length; i += 1) {
    const vistos = new Set()
    let suma = 0
    for (const f of filas) {
      const v = f[i]
      vistos.add(String(v ?? ''))
      const n = Number(v)
      if (Number.isFinite(n)) suma += n
    }
    columnas[`${i}:${ENCABEZADOS[i]}`] = { distintos: vistos.size, suma }
    if (vistos.size <= 1) constantes.push(ENCABEZADOS[i])
  }

  const avisosPorTipo = {}
  for (const a of avisos) avisosPorTipo[a.tipo] = (avisosPorTipo[a.tipo] ?? 0) + 1

  return {
    zip: nombreZip,
    sha256: sha256(bytes),
    documentos: docs,
    consolidado: {
      trabajadores: Array.isArray(trabajadores) ? trabajadores.length : trabajadores,
      filas: filas.length,
      columnas: ENCABEZADOS.length,
      rutUnicos: new Set(filas.map((f) => String(f[indiceDe('rut')]))).size,
      columnasConstantes: constantes,
      sumaPorColumna: columnas,
    },
    avisosPorTipo,
    control: { total: control.length, ok: control.filter((c) => c.ok).length },
  }
}

/** Suma (o conteo de no vacíos, si no es numérico) de cada campo canónico del documento. */
function sumasDeDocumento(doc) {
  const out = {}
  for (const [campo, def] of Object.entries(CAMPOS)) {
    let total = 0
    let conValor = 0
    for (const reg of doc.registros ?? []) {
      const v = reg[campo]
      if (v === undefined || v === '' || v === null) continue
      conValor += 1
      const n = Number(v)
      if (Number.isFinite(n)) total += n
    }
    if (conValor === 0) continue // los campos que no aparecen no ensucian el fixture
    out[campo] = def.agg === 'suma' || def.agg === 'max' ? { conValor, suma: total } : { conValor }
  }
  return out
}

const esObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

/**
 * Compara el fixture guardado contra el generado.
 * @returns {{diferencias: Array<{ruta:string, esperado:*, actual:*}>, nuevos: string[]}}
 */
export function compararFixture(esperado, actual) {
  const diferencias = []
  const nuevos = []

  const recorrer = (esp, act, ruta) => {
    if (Array.isArray(esp)) {
      if (!Array.isArray(act)) return void diferencias.push({ ruta, esperado: '(arreglo)', actual: typeof act })
      if (esp.length !== act.length) {
        diferencias.push({ ruta: `${ruta}.length`, esperado: esp.length, actual: act.length })
      }
      for (let i = 0; i < Math.min(esp.length, act.length); i += 1) recorrer(esp[i], act[i], `${ruta}[${i}]`)
      return
    }
    if (esObjeto(esp)) {
      if (!esObjeto(act)) return void diferencias.push({ ruta, esperado: '(objeto)', actual: typeof act })
      for (const k of Object.keys(esp)) {
        if (!(k in act)) diferencias.push({ ruta: `${ruta}.${k}`, esperado: esp[k], actual: '(ausente)' })
        else recorrer(esp[k], act[k], `${ruta}.${k}`)
      }
      for (const k of Object.keys(act)) if (!(k in esp)) nuevos.push(`${ruta}.${k}`)
      return
    }
    if (esp !== act) diferencias.push({ ruta, esperado: esp, actual: act })
  }

  recorrer(esperado, actual, '')
  // El sha256 cambia si cambia el insumo, no el código: se avisa aparte.
  return { diferencias: diferencias.filter((d) => d.ruta !== '.sha256'), nuevos }
}
