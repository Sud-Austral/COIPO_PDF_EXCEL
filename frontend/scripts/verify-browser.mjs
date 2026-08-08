/**
 * Verificación en un navegador de verdad.
 *
 * `npm run verify` comprueba la lógica en Node. Esto comprueba lo que realmente
 * usará la gente: levanta el sitio YA COMPILADO bajo el mismo subpath de GitHub
 * Pages, abre Chrome, suelta el ZIP en el formulario, espera el resultado, descarga
 * el .xlsx y lo revisa. Además deja una captura de pantalla para poder mirarla.
 *
 *   npm run build && npm run verify:browser
 *
 * Se salta con código 0 si no hay Chrome o no está INSUMO/ (que está en .gitignore).
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'

import { ENCABEZADOS, indiceDe } from '../src/lib/previredLayout.js'
import { leerHoja } from './readXlsx.mjs'
import { BASE, buscarChrome, servirDist } from './servidor.mjs'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const RAIZ = path.resolve(AQUI, '..')
const DIST = path.join(RAIZ, 'dist')
const ZIP = path.resolve(RAIZ, '../INSUMO/pdfProvired.zip')
const DESCARGAS = path.join(RAIZ, '.verify-browser')

const salir = (motivo) => {
  console.log(`⚠ ${motivo}`)
  process.exit(0)
}

if (!fs.existsSync(DIST)) salir('No existe dist/. Corre primero: npm run build')
if (!fs.existsSync(ZIP)) salir(`No existe ${ZIP}. INSUMO/ está en .gitignore.`)
const chrome = buscarChrome()
if (!chrome) salir('No se encontró Chrome ni Edge instalados.')

let fallos = 0
const ok = (cond, texto) => {
  if (!cond) fallos += 1
  console.log(`  ${cond ? '✔' : '✘'} ${texto}`)
}

// El servidor estático que imita el subpath de GitHub Pages vive en ./servidor.mjs,
// compartido con verify-banner.mjs.
const { sitio, pedidos, cerrar } = await servirDist(DIST)
console.log(`\nSirviendo dist/ en ${sitio}\n`)

fs.rmSync(DESCARGAS, { recursive: true, force: true })
fs.mkdirSync(DESCARGAS, { recursive: true })

const navegador = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  protocolTimeout: 600_000,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

try {
  const pagina = await navegador.newPage()
  await pagina.setViewport({ width: 1200, height: 1400, deviceScaleFactor: 1 })

  const errores = []
  pagina.on('pageerror', (e) => errores.push(`pageerror: ${e.message}`))
  pagina.on('console', (m) => m.type() === 'error' && errores.push(`console: ${m.text()}`))
  pagina.on('requestfailed', (r) => errores.push(`404/failed: ${r.url()}`))

  await pagina.goto(sitio, { waitUntil: 'networkidle0' })
  console.log('1. CARGA DE LA PÁGINA')
  ok((await pagina.title()).includes('Previred'), `título: "${await pagina.title()}"`)
  ok(
    (await pagina.$eval('h1', (e) => e.textContent)) === 'Consolidador Previred',
    'la app se montó (h1 presente)',
  )
  ok(!!(await pagina.$('.dropzone')), 'se muestra la zona de arrastre')

  const cliente = await pagina.createCDPSession()
  await cliente.send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: DESCARGAS,
    eventsEnabled: true,
  })

  console.log('\n2. PROCESAMIENTO DEL ZIP')
  const t0 = Date.now()
  const input = await pagina.$('input[type=file]')
  await input.uploadFile(ZIP)

  await pagina.waitForSelector('.progreso', { timeout: 15_000 })
  ok(true, 'apareció la barra de progreso')

  await pagina.waitForSelector('a.boton.primario[download]', { timeout: 300_000 })
  const segundos = ((Date.now() - t0) / 1000).toFixed(1)
  ok(true, `terminó en ${segundos}s sin bloquear la interfaz`)

  const resumen = await pagina.evaluate(() => ({
    trabajadores: document.querySelector('.resultado .cifra strong')?.textContent ?? '',
    nota: document.querySelector('.resultado .nota')?.textContent?.trim() ?? '',
    nombre: document.querySelector('a.boton.primario[download]')?.getAttribute('download') ?? '',
    filasTabla: document.querySelectorAll('.tarjeta table tbody tr').length,
    marcasMal: document.querySelectorAll('.marca.mal').length,
    pastillas: [...document.querySelectorAll('.pastilla')].map((e) => e.textContent),
  }))
  ok(resumen.trabajadores === '3.610', `la pantalla dice ${resumen.trabajadores} trabajadores`)
  ok(resumen.nombre === 'consolidado-previred-072026.xlsx', `nombre propuesto: ${resumen.nombre}`)
  ok(resumen.marcasMal === 0, 'ningún total de control marcado con ✘ en pantalla')
  ok(
    resumen.pastillas.includes('todo cuadra'),
    `pastillas de estado: ${JSON.stringify(resumen.pastillas)}`,
  )

  console.log('\n3. DESCARGA DEL EXCEL')
  await pagina.click('a.boton.primario[download]')
  const descargado = await esperarArchivo(DESCARGAS, 60_000)
  ok(!!descargado, `se descargó ${path.basename(descargado ?? '')}`)

  if (descargado) {
    const hojas = leerHoja(descargado, 'xl/worksheets/sheet1.xml')
    ok(hojas.length === 3611, `el .xlsx descargado tiene ${hojas.length - 1} filas de datos`)
    ok(
      ENCABEZADOS.every((h, i) => (hojas[0][i + 1] ?? '') === h),
      'los 108 encabezados están en orden',
    )
    const suma = hojas.slice(1).reduce((s, r) => s + Number(r[indiceDe('cot_CCAF') + 1] ?? 0), 0)
    ok(suma === 100_331_776, `Σ cot_CCAF = ${suma.toLocaleString('es-CL')} (debe ser 100.331.776)`)
  }

  // Una captura por tema: la app usa prefers-color-scheme y hay que mirar las dos.
  for (const tema of ['light', 'dark']) {
    await pagina.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: tema }])
    // Los botones tienen transition de 150 ms sobre background: sin esperar, la
    // captura los agarra a medio camino entre una paleta y la otra.
    await new Promise((r) => setTimeout(r, 400))
    const captura = path.join(RAIZ, `captura-${tema}.png`)
    await pagina.screenshot({ path: captura, fullPage: true })
    console.log(`\n  captura ${tema}: ${path.relative(process.cwd(), captura)}`)
  }

  console.log('\n4. CONSOLA DEL NAVEGADOR')
  ok(errores.length === 0, errores.length === 0 ? 'sin errores ni recursos 404' : `${errores.length} problemas`)
  for (const e of errores.slice(0, 10)) console.log(`      ${e}`)
  console.log(`  · ${pedidos.length} peticiones servidas, todas bajo ${BASE}`)
} finally {
  await navegador.close()
  cerrar()
}

console.log(`\n${fallos === 0 ? '✔ NAVEGADOR OK' : `✘ ${fallos} comprobación(es) fallaron`}\n`)
process.exit(fallos === 0 ? 0 : 1)

async function esperarArchivo(carpeta, ms) {
  const limite = Date.now() + ms
  while (Date.now() < limite) {
    const listos = fs
      .readdirSync(carpeta)
      .filter((f) => f.endsWith('.xlsx'))
      .map((f) => path.join(carpeta, f))
    if (listos.length && fs.statSync(listos[0]).size > 0) {
      await new Promise((r) => setTimeout(r, 300))
      return listos[0]
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  return null
}
