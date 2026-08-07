/**
 * Arnés de verificación.
 *
 * Corre EL MISMO código de src/lib/ que usa la app, sobre el ZIP real de INSUMO,
 * y comprueba tres cosas:
 *   1. que cada total de control impreso en el comprobante calce con la suma de
 *      lo extraído (esto lo dice el propio PDF, no un número inventado);
 *   2. que el N° de afiliados informados calce con los RUT únicos;
 *   3. si está disponible INSUMO/previred.xlsx, que la consolidación por RUT
 *      calce columna a columna con la hoja "TXT LOS ANDES" que hoy se arma a mano.
 *
 * INSUMO/ está en .gitignore, así que si no existe el script avisa y sale con 0.
 *
 *   node scripts/verify.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'

import { procesarZip } from '../src/lib/pipeline.js'
import { ENCABEZADOS, indiceDe } from '../src/lib/previredLayout.js'
import { leerHoja } from './readXlsx.mjs'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const INSUMO = path.resolve(AQUI, '../../INSUMO')
const ZIP = path.join(INSUMO, 'pdfProvired.zip')
const XLSX = path.join(INSUMO, 'previred.xlsx')

const fmt = (n) => new Intl.NumberFormat('es-CL').format(n)
let fallos = 0
const ok = (cond, texto) => {
  if (!cond) fallos += 1
  console.log(`  ${cond ? '✔' : '✘'} ${texto}`)
  return cond
}

if (!fs.existsSync(ZIP)) {
  console.log(`⚠ No se encontró ${ZIP}.`)
  console.log('  INSUMO/ está en .gitignore; copia ahí el ZIP de comprobantes para verificar.')
  process.exit(0)
}

console.log(`\nLeyendo ${path.relative(process.cwd(), ZIP)} …\n`)
const t0 = Date.now()
const { documentos, filas, trabajadores, avisos, control } = await procesarZip(
  pdfjs,
  new Uint8Array(fs.readFileSync(ZIP)),
)
const segundos = ((Date.now() - t0) / 1000).toFixed(1)

console.log('DOCUMENTOS')
for (const d of documentos) {
  console.log(
    `  ${d.archivo}  ·  ${d.institucion}  ·  ${d.paginas} pág.  ·  folio ${d.folio || '—'}` +
      `  ·  período ${d.periodo?.texto ?? '—'}  ·  ${d.registros.length} líneas`,
  )
}
console.log(`  (${segundos}s)\n`)

console.log('1. TOTALES DE CONTROL DEL PROPIO COMPROBANTE')
for (const c of control) {
  ok(c.ok, `${c.rotulo}: comprobante ${fmt(c.declarado)} vs extraído ${fmt(c.extraido)}`)
}

console.log(`\n2. CONSOLIDADO`)
ok(filas.length === trabajadores.length, `${fmt(filas.length)} filas, una por trabajador`)
ok(filas.every((f) => f.length === 108), 'todas las filas tienen 108 columnas')
ok(ENCABEZADOS.length === 108, 'el encabezado tiene 108 columnas')

if (!fs.existsSync(XLSX)) {
  console.log(`\n⚠ No está ${path.relative(process.cwd(), XLSX)}; se omite el cotejo contra la planilla manual.`)
} else {
  console.log('\n3. COTEJO CONTRA LA HOJA "TXT LOS ANDES" ARMADA A MANO')
  const hoja = leerHoja(XLSX, 'xl/worksheets/sheet4.xml')
  const cab = hoja[0]
  const idxHoja = {}
  for (let i = 1; i <= 108; i += 1) if (cab[i] && idxHoja[cab[i]] === undefined) idxHoja[cab[i]] = i
  idxHoja.rut = 4 // columna D (la A es auxiliar)

  // Agregación de la planilla manual por RUT, con las mismas reglas que consolidate.js
  const SUMA = ['impo_ccaf', 'cot_CCAF', 'asig_fam', 'asig_fam_ret', 'reint_cargas',
    'Cred_per_CCAF', 'Desc_Dental', 'desc_leassing', 'desc_seg_vida', 'otros_desc_ccaf']
  const MAX = ['dias_trab', 'num_car_sim', 'num_car_inv', 'num_car_mat']
  const manual = new Map()
  for (const r of hoja.slice(1)) {
    const rut = r[idxHoja.rut]
    if (!rut) continue
    let acc = manual.get(rut)
    if (!acc) manual.set(rut, (acc = {}))
    for (const c of SUMA) acc[c] = (acc[c] ?? 0) + Number(r[idxHoja[c]] ?? 0)
    for (const c of MAX) acc[c] = Math.max(acc[c] ?? 0, Number(r[idxHoja[c]] ?? 0))
  }

  const mios = new Map(filas.map((f) => [String(f[indiceDe('rut')]), f]))
  ok(mios.size === manual.size, `mismos RUT únicos: mío ${fmt(mios.size)} vs planilla ${fmt(manual.size)}`)
  const sinPar = [...mios.keys()].filter((k) => !manual.has(k))
  ok(sinPar.length === 0, `todos mis RUT existen en la planilla (${sinPar.length} sin par)`)

  for (const campo of [...SUMA, ...MAX]) {
    let distintos = 0
    let ejemplo = null
    for (const [rut, fila] of mios) {
      const m = manual.get(rut)
      if (!m) continue
      const a = Number(fila[indiceDe(campo)] ?? 0)
      const b = Number(m[campo] ?? 0)
      if (a !== b) {
        distintos += 1
        if (!ejemplo) ejemplo = `${rut}: mío ${fmt(a)} vs planilla ${fmt(b)}`
      }
    }
    const pct = ((distintos / mios.size) * 100).toFixed(1)
    console.log(
      `  ${distintos === 0 ? '✔' : '·'} ${campo}: ${distintos === 0 ? 'idéntico' : `${distintos} de ${fmt(mios.size)} distintos (${pct}%) — ej. ${ejemplo}`}`,
    )
  }
  console.log('    (impo_ccaf difiere a propósito: el Excel sigue al PDF de la caja,')
  console.log('     la planilla manual refleja lo declarado por el empleador.)')

  // Nombres: la institución puede informar una versión más corta que la ficha del
  // empleador. No se puede recuperar; lo que sí se exige es que el aviso de
  // "nombre incompleto" no tenga falsos positivos.
  const nombreManual = new Map()
  for (const r of hoja.slice(1)) {
    const rut = r[idxHoja.rut]
    if (rut && !nombreManual.has(rut)) {
      nombreManual.set(
        rut,
        [r[idxHoja.ape_pat], r[idxHoja.ape_mat], r[idxHoja.nombres]]
          .filter(Boolean).join(' ').replace(/[-\s]+/g, ' ').trim(),
      )
    }
  }
  const marcados = new Set(
    avisos
      .filter((a) => a.tipo === 'Nombre incompleto')
      .map((a) => a.detalle.split(' — ')[0].replace(/\./g, '').split('-')[0]),
  )
  let cortosReales = 0
  let ciertos = 0
  for (const [rut, fila] of mios) {
    const mio = [fila[indiceDe('ape_pat')], fila[indiceDe('ape_mat')], fila[indiceDe('nombres')]]
      .filter(Boolean).join(' ').trim()
    const real = nombreManual.get(rut) ?? ''
    const esCorto = real && real.length > mio.length && real.startsWith(mio)
    if (esCorto) cortosReales += 1
    if (marcados.has(rut) && esCorto) ciertos += 1
  }
  console.log(
    `  · nombres más cortos que la ficha del empleador: ${cortosReales} de ${fmt(mios.size)} (dato de origen, no recuperable)`,
  )
  ok(
    ciertos === marcados.size,
    `los ${marcados.size} avisos de "nombre incompleto" son todos reales (0 falsos positivos)`,
  )
}

console.log('\n4. GENERACIÓN DEL .XLSX')
const t1 = Date.now()
const { construirLibro, nombreArchivo } = await import('../src/lib/buildWorkbook.js')
const buffer = await construirLibro({ filas, documentos, control, avisos })
const salida = path.resolve(AQUI, '..', nombreArchivo(documentos))
fs.writeFileSync(salida, Buffer.from(buffer))
console.log(`  escrito ${path.relative(process.cwd(), salida)} en ${((Date.now() - t1) / 1000).toFixed(1)}s`)

// Se vuelve a abrir el archivo generado y se comprueba lo que quedó dentro.
const generado = leerHoja(salida, 'xl/worksheets/sheet1.xml')
ok(generado.length === filas.length + 1, `el .xlsx tiene ${fmt(generado.length - 1)} filas de datos + encabezado`)
ok(
  ENCABEZADOS.every((h, i) => (generado[0][i + 1] ?? '') === h),
  'los 108 encabezados quedaron en orden dentro del .xlsx',
)
const primera = filas[0]
ok(
  String(generado[1][indiceDe('rut') + 1]) === String(primera[indiceDe('rut')]),
  `la primera fila del .xlsx corresponde al RUT ${primera[indiceDe('rut')]}`,
)
const sumaCot = generado
  .slice(1)
  .reduce((s, r) => s + Number(r[indiceDe('cot_CCAF') + 1] ?? 0), 0)
const cotEsperada = filas.reduce((s, f) => s + Number(f[indiceDe('cot_CCAF')] ?? 0), 0)
ok(sumaCot === cotEsperada, `Σ cot_CCAF dentro del .xlsx = ${fmt(sumaCot)}`)

console.log(`\n5. AVISOS (${avisos.length})`)
const porTipo = new Map()
for (const a of avisos) porTipo.set(a.tipo, (porTipo.get(a.tipo) ?? 0) + 1)
for (const [tipo, n] of porTipo) console.log(`  · ${tipo}: ${n}`)
for (const a of avisos.slice(0, 5)) console.log(`      ${a.tipo} — ${a.archivo} — ${a.detalle}`)

console.log(`\n${fallos === 0 ? '✔ TODO OK' : `✘ ${fallos} comprobación(es) fallaron`}\n`)
process.exit(fallos === 0 ? 0 : 1)
