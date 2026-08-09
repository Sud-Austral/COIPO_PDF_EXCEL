/**
 * Arnés de verificación sobre datos reales.
 *
 * Corre EL MISMO código de src/lib/ que usa la app, sobre TODOS los ZIP de INSUMO/,
 * y comprueba:
 *   1. que cada total de control impreso en el comprobante calce con la suma de lo
 *      extraído (esto lo dice el propio PDF, no un número inventado);
 *   2. que ningún documento quede SIN VERIFICAR — un comprobante que no produce
 *      ninguna comparación no está bien: está sin comprobar, y eso es un fallo;
 *   3. que el resultado no se haya movido respecto del fixture guardado en
 *      fixtures/<zip>.json (no-regresión);
 *   4. si está INSUMO/previred.xlsx, el cotejo contra la planilla armada a mano.
 *
 * CÓDIGOS DE SALIDA — a diferencia de la versión anterior, esto NO sale con 0 en
 * silencio. Salir con 0 sin verificar nada fue la razón de que un PDF entero mal
 * clasificado llegara a producción sin que ninguna prueba lo notara.
 *   0  todo verificado
 *   1  algo falló, faltan los insumos, o hay un fixture nuevo que revisar
 *
 * Con PERMITIR_SIN_INSUMO=1 la ausencia de INSUMO/ deja de ser un fallo (es lo que
 * usa CI, donde los datos reales no existen porque están en .gitignore).
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
import { construirFixture, compararFixture } from './fixture.mjs'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const RAIZ = path.resolve(AQUI, '..')
const INSUMO = path.resolve(RAIZ, '../INSUMO')
const FIXTURES = path.join(RAIZ, 'fixtures')
const XLSX = path.join(INSUMO, 'previred.xlsx')

const fmt = (n) => new Intl.NumberFormat('es-CL').format(n)
let fallos = 0
const ok = (cond, texto) => {
  if (!cond) fallos += 1
  console.log(`  ${cond ? '✔' : '✘'} ${texto}`)
  return cond
}

// --actualizar reescribe fixtures/<zip>.json con el resultado de esta corrida. NUNCA
// toca fixtures/congelado.json: eso se edita a mano, a propósito.
const ACTUALIZAR = process.argv.includes('--actualizar')

const RUTA_CONGELADO = path.join(FIXTURES, 'congelado.json')
const CONGELADO = fs.existsSync(RUTA_CONGELADO) ? JSON.parse(fs.readFileSync(RUTA_CONGELADO, 'utf8')) : null

const zips = fs.existsSync(INSUMO)
  ? fs.readdirSync(INSUMO).filter((f) => f.toLowerCase().endsWith('.zip')).sort()
  : []

if (zips.length === 0) {
  const motivo = `No hay ningún .zip en ${path.relative(process.cwd(), INSUMO)}. INSUMO/ está en .gitignore.`
  if (process.env.PERMITIR_SIN_INSUMO) {
    console.log(`⚠ ${motivo}`)
    console.log('  PERMITIR_SIN_INSUMO=1: se omite el arnés de datos (esto NO verifica nada).')
    process.exit(0)
  }
  console.log(`✘ ${motivo}`)
  console.log('  Copia ahí los ZIP de comprobantes, o corre con PERMITIR_SIN_INSUMO=1.')
  process.exit(1)
}

let fixturesNuevos = 0

for (const nombreZip of zips) {
  const ruta = path.join(INSUMO, nombreZip)
  const bytes = new Uint8Array(fs.readFileSync(ruta))
  console.log(`\n${'='.repeat(72)}\n${nombreZip}  (${fmt(bytes.length)} bytes)\n${'='.repeat(72)}`)

  const t0 = Date.now()
  const resultado = await procesarZip(pdfjs, bytes)
  const { documentos, filas, trabajadores, avisos, control } = resultado
  console.log(`  leído en ${((Date.now() - t0) / 1000).toFixed(1)}s\n`)

  console.log('DOCUMENTOS')
  for (const d of documentos) {
    console.log(
      `  ${d.archivo}  ·  ${d.institucion}  ·  ${d.paginas} pág.  ·  ` +
        `período ${d.periodo?.texto ?? '—'}  ·  ${d.registros.length} líneas`,
    )
  }

  console.log('\n1. TOTALES DE CONTROL DEL PROPIO COMPROBANTE')
  if (control.length === 0) console.log('  (ninguno)')
  for (const c of control) {
    ok(c.ok, `${c.archivo} :: ${c.rotulo}: comprobante ${fmt(c.declarado)} vs extraído ${fmt(c.extraido)}`)
  }

  // --- LA REGLA QUE FALTABA ---
  // Un documento que no produce NINGUNA comparación no está verificado. Antes esto
  // no era ni siquiera una fila: el bucle sobre totalesControl=[] no imprimía nada y
  // el resumen decía "todo cuadra".
  console.log('\n2. COBERTURA: ningún documento sin verificar')
  for (const d of documentos) {
    if (d.duplicadoDe) continue
    const n = control.filter((c) => c.archivo === d.archivo).length
    ok(n > 0, `${d.archivo} (${d.institucion}): ${n} comparación(es) contra su propia portada`)
  }

  console.log('\n3. CONSOLIDADO')
  ok(filas.length === trabajadores.length, `${fmt(filas.length)} filas, una por trabajador`)
  ok(filas.every((f) => f.length === ENCABEZADOS.length), `todas las filas tienen ${ENCABEZADOS.length} columnas`)

  const constantes = ENCABEZADOS.filter((_, i) => new Set(filas.map((f) => String(f[i] ?? ''))).size <= 1)
  console.log(`  · columnas constantes en todas las filas: ${constantes.length} de ${ENCABEZADOS.length}`)
  if (constantes.length) console.log(`      ${constantes.join(', ')}`)

  const actual = construirFixture(nombreZip, bytes, resultado)

  // Invariantes congeladas: lo que NO puede moverse pase lo que pase. Se escribieron a
  // mano antes de tocar src/lib/ y no las reescribe ningún flag. Son la red que permite
  // cambiar la geometría sin romper el único perfil validado con datos reales.
  console.log('\n4. INVARIANTES CONGELADAS (fixtures/congelado.json)')
  const invariantes = CONGELADO?.[nombreZip]
  if (!invariantes) {
    console.log('  ⚠ Este ZIP no tiene invariantes congeladas.')
  } else {
    const observado = {
      consolidado: actual.consolidado,
      documentos: Object.fromEntries(actual.documentos.map((d) => [d.archivo, d])),
    }
    const { diferencias } = compararFixture(invariantes, observado)
    ok(diferencias.length === 0, `${diferencias.length} invariante(s) rota(s)`)
    for (const d of diferencias.slice(0, 20)) {
      console.log(`      ${d.ruta}: congelado ${JSON.stringify(d.esperado)} · ahora ${JSON.stringify(d.actual)}`)
    }
  }

  console.log('\n4b. NO-REGRESIÓN CONTRA EL FIXTURE COMPLETO')
  const rutaFixture = path.join(FIXTURES, `${nombreZip}.json`)
  if (ACTUALIZAR) {
    fs.mkdirSync(FIXTURES, { recursive: true })
    fs.writeFileSync(rutaFixture, `${JSON.stringify(actual, null, 2)}\n`)
    console.log(`  · --actualizar: reescrito ${path.relative(RAIZ, rutaFixture)}`)
  } else if (!fs.existsSync(rutaFixture)) {
    fs.mkdirSync(FIXTURES, { recursive: true })
    const propuesto = path.join(FIXTURES, `${nombreZip}.json.nuevo`)
    fs.writeFileSync(propuesto, `${JSON.stringify(actual, null, 2)}\n`)
    console.log(`  ⚠ No existe ${path.relative(RAIZ, rutaFixture)}.`)
    console.log(`    Se escribió el propuesto en ${path.relative(RAIZ, propuesto)}.`)
    console.log('    REVÍSALO y renómbralo para congelar este comportamiento.')
    fixturesNuevos += 1
  } else {
    const esperado = JSON.parse(fs.readFileSync(rutaFixture, 'utf8'))
    const { diferencias, nuevos } = compararFixture(esperado, actual)
    if (esperado.sha256 !== actual.sha256) {
      console.log(`  ⚠ El ZIP cambió (sha ${esperado.sha256} → ${actual.sha256}): el fixture puede estar obsoleto.`)
    }
    ok(diferencias.length === 0, `${diferencias.length} diferencia(s) contra el fixture`)
    for (const d of diferencias.slice(0, 30)) {
      console.log(`      ${d.ruta}: esperado ${JSON.stringify(d.esperado)} · actual ${JSON.stringify(d.actual)}`)
    }
    if (diferencias.length > 30) console.log(`      …y ${diferencias.length - 30} más`)
    if (nuevos.length) console.log(`  · ${nuevos.length} campo(s) nuevo(s) en el fixture generado (no es un fallo)`)
  }

  if (fs.existsSync(XLSX)) cotejarContraPlanilla(filas, avisos)
  else console.log(`\n5. COTEJO CONTRA LA PLANILLA MANUAL: omitido (no está ${path.relative(process.cwd(), XLSX)})`)

  await generarYReleerXlsx(resultado)
}

console.log(`\n${'='.repeat(72)}`)
if (fixturesNuevos) {
  console.log(`✘ ${fixturesNuevos} fixture(s) nuevo(s) sin revisar. Míralos y renómbralos a .json.`)
}
console.log(fallos === 0 && !fixturesNuevos ? '✔ VERIFICACIÓN OK\n' : `✘ ${fallos} comprobación(es) fallaron\n`)
process.exit(fallos === 0 && !fixturesNuevos ? 0 : 1)

/** Genera el .xlsx de verdad y lo vuelve a abrir para ver qué quedó adentro. */
async function generarYReleerXlsx(resultado) {
  console.log('\n6. GENERACIÓN DEL .XLSX')
  const t = Date.now()
  const { construirLibro, nombreArchivo } = await import('../src/lib/buildWorkbook.js')
  const buffer = await construirLibro(resultado)
  const salida = path.join(RAIZ, nombreArchivo(resultado.documentos))
  fs.writeFileSync(salida, Buffer.from(buffer))
  console.log(`  escrito ${path.relative(process.cwd(), salida)} en ${((Date.now() - t) / 1000).toFixed(1)}s`)

  const generado = leerHoja(salida, 'xl/worksheets/sheet1.xml')
  const { filas } = resultado
  ok(generado.length === filas.length + 1, `el .xlsx tiene ${fmt(generado.length - 1)} filas de datos + encabezado`)
  ok(
    ENCABEZADOS.every((h, i) => (generado[0][i + 1] ?? '') === h),
    `los ${ENCABEZADOS.length} encabezados quedaron en orden dentro del .xlsx`,
  )
  ok(
    String(generado[1][indiceDe('rut') + 1]) === String(filas[0][indiceDe('rut')]),
    `la primera fila del .xlsx corresponde al RUT ${filas[0][indiceDe('rut')]}`,
  )
}

/**
 * Cotejo contra la hoja "TXT LOS ANDES" que hoy se arma a mano. Es la única fuente
 * externa al propio comprobante, así que vale la pena aunque sólo cubra el CCAF.
 */
function cotejarContraPlanilla(filas, avisos) {
  console.log('\n5. COTEJO CONTRA LA HOJA "TXT LOS ANDES" ARMADA A MANO')
  const hoja = leerHoja(XLSX, 'xl/worksheets/sheet4.xml')
  const cab = hoja[0]
  const idxHoja = {}
  for (let i = 1; i <= ENCABEZADOS.length; i += 1) if (cab[i] && idxHoja[cab[i]] === undefined) idxHoja[cab[i]] = i
  idxHoja.rut = 4 // columna D (la A es auxiliar)

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
  console.log(`  · nombres más cortos que la ficha del empleador: ${cortosReales} de ${fmt(mios.size)}`)
  ok(ciertos === marcados.size, `los ${marcados.size} avisos de "nombre incompleto" son todos reales`)
}
