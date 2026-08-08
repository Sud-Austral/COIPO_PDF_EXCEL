/**
 * Arnés del banner institucional.
 *
 * Separado de verify:browser a propósito: aquél exige ../INSUMO/ (datos reales de
 * personas, gitignorados) ANTES de comprobar Chrome, así que hoy sale con 0 sin
 * generar ninguna captura, en ninguna máquina. El banner no necesita datos, o sea
 * que esto SÍ corre de verdad en cualquier equipo con Chrome y en CI.
 *
 * Mide sobre el PNG capturado, no consultando el DOM: comprueba lo que se pintó, no
 * lo que el CSS declaró (INSUMO_GRAFICO/implementacion_banner.md §8). El PNG se
 * decodifica cargándolo como data: URI en una pestaña en blanco y volcándolo a un
 * <canvas>: un decodificador de producción en 15 líneas, en vez de ~100 líneas
 * frágiles sobre node:zlib que a su vez habría que verificar.
 *
 *   npm run build && npm run verify:banner
 *
 * Sin dist/ o sin Chrome avisa y sale con 0, salvo con EXIGIR_CHROME=1 (CI), donde
 * la ausencia de Chrome es un fallo ruidoso en vez de un verde que no verifica nada.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'

import { buscarChrome, servirDist } from './servidor.mjs'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const RAIZ = path.resolve(AQUI, '..')
const DIST = path.join(RAIZ, 'dist')
const FUENTE = path.join(RAIZ, 'src/assets/banner-conaf-uia.jpg')

// Medidas del asset, verificadas píxel a píxel. Si el banner cambia, hay que volver
// a medirlas y actualizar también los tokens de src/index.css.
const ANCHO_ASSET = 3032
const RAZON = 17.1299 // 3032 / 177
const PISO = 68 // --alto-minimo-banner
const AZUL = [0x0e, 0x69, 0xb0] // filete izquierdo, x 67..169 del asset
const ROJO = [0xeb, 0x3d, 0x49] // filete derecho, x 170..283
const VERDE = [0x06, 0x49, 0x28] // campo principal
const FILETE_X0 = 67
const FILETE_AZUL_PX = 103
const FILETE_ROJO_PX = 114
const MARCA_X1 = 540 // la marca (isotipo + logotipo) no pasa de aquí
// Columnas del asset uniformemente #064928 en las 177 filas (zona segura 858..2744).
const COLS_SEGURAS = [900, 1000, 1400, 1800, 2200, 2600]
const ANCHOS = [1920, 1366, 1165, 768, 390]

let fallos = 0
const ok = (cond, texto) => {
  if (!cond) fallos += 1
  console.log(`  ${cond ? '✔' : '✘'} ${texto}`)
}
const avisar = (motivo) => {
  console.log(`⚠ ${motivo}`)
  process.exit(0)
}

// --- 0. el asset llegó al artefacto desplegable (esto no necesita navegador) ---

console.log('\n0. EL ASSET LLEGÓ A dist/')
if (!fs.existsSync(DIST)) avisar('No existe dist/. Corre primero: npm run build')
if (!fs.existsSync(FUENTE)) avisar(`No existe ${FUENTE}.`)

const CARPETA_ASSETS = path.join(DIST, 'assets')
const emitido = fs.existsSync(CARPETA_ASSETS)
  ? fs.readdirSync(CARPETA_ASSETS).find((f) => /^banner-conaf-uia-.*\.jpe?g$/.test(f))
  : undefined
ok(!!emitido, `Vite emitió ${emitido ?? '(nada: el import no llegó al bundle)'}`)
if (emitido) {
  const bytes = fs.readFileSync(path.join(CARPETA_ASSETS, emitido))
  ok(
    Buffer.compare(bytes, fs.readFileSync(FUENTE)) === 0,
    `los bytes emitidos son idénticos al asset fuente (${bytes.length.toLocaleString('es-CL')} B)`,
  )
  const chunks = fs.readdirSync(CARPETA_ASSETS).filter((f) => f.endsWith('.js'))
  ok(
    chunks.some((f) => fs.readFileSync(path.join(CARPETA_ASSETS, f), 'utf8').includes(emitido)),
    'algún chunk del bundle referencia el nombre con hash',
  )
}

// El favicon sale de public/, que Vite copia tal cual: no lleva hash y la URL la
// compone %BASE_URL%. Una barra inicial literal daría 404 bajo el subpath de Pages.
const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8')
for (const icono of ['favicon.png', 'apple-touch-icon.png']) {
  ok(fs.existsSync(path.join(DIST, icono)), `dist/${icono} existe`)
  ok(html.includes(`/COIPO_PDF_EXCEL/${icono}`), `index.html apunta a ${icono} con la base resuelta`)
}

const chrome = buscarChrome()
if (!chrome) {
  const motivo = 'No se encontró Chrome ni Edge instalados.'
  if (process.env.EXIGIR_CHROME) {
    console.log(`  ✘ ${motivo} EXIGIR_CHROME=1 lo convierte en fallo.`)
    process.exit(1)
  }
  avisar(motivo)
}

const { sitio, cerrar } = await servirDist(DIST)
const navegador = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  protocolTimeout: 120_000,
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    // Sin esto la barra de desplazamiento roba ~15 px al ancho de layout y el alto
    // pintado no cuadra con viewport/RAZON: daría un falso negativo.
    '--hide-scrollbars',
    // Sin esto los RGB del filete salen desplazados en pantallas de gama amplia.
    '--force-color-profile=srgb',
  ],
})

/**
 * Vuelca un PNG a un canvas y lo mide. Todo lo que devuelve sale de los píxeles
 * realmente pintados; nada consulta el DOM.
 */
const medirEnCanvas = (medidor, png, opciones) =>
  medidor.evaluate(
    async (uri, o) => {
      const img = new Image()
      img.src = uri
      await img.decode()
      const lienzo = document.createElement('canvas')
      lienzo.width = img.naturalWidth
      lienzo.height = img.naturalHeight
      const g = lienzo.getContext('2d', { willReadFrequently: true })
      g.imageSmoothingEnabled = false
      g.drawImage(img, 0, 0)
      const { data, width, height } = g.getImageData(0, 0, lienzo.width, lienzo.height)

      const px = (x, y) => {
        const i = (y * width + x) * 4
        return [data[i], data[i + 1], data[i + 2]]
      }
      const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
      const luma = (p) => 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]

      // Escala a la que se está pintando el asset. El ancho de la imagen nunca baja
      // del piso, aunque el viewport sí: por debajo del cruce desborda y se recorta.
      const escala = Math.max(width, o.piso * o.razon) / o.anchoAsset
      const cols = o.colsSeguras.map((sx) => Math.round(sx * escala)).filter((x) => x < width - 1)
      if (!cols.length) cols.push(width - 2)

      // Filete: se lee en y=2. La fila 0 NO sirve: el JPEG tiene ringing en el borde
      // del bloque y ahí el azul sale #365d98 y el rojo #b7393a.
      const tope = Math.min(width, Math.ceil((o.filete.x0 + o.filete.azul + o.filete.rojo + 40) * escala))
      let azul = 0
      let rojo = 0
      let x0Azul = -1
      let x0Rojo = -1
      for (let x = 0; x < tope; x++) {
        const p = px(x, 2)
        if (dist(p, o.azul) <= 60) {
          azul += 1
          if (x0Azul < 0) x0Azul = x
        }
        if (dist(p, o.rojo) <= 60) {
          rojo += 1
          if (x0Rojo < 0) x0Rojo = x
        }
      }
      const base = { ancho: width, escala, azul, rojo, x0Azul, x0Rojo }
      if (!o.medirAlto) return base

      const fondo = px(cols[0], height - 1) // fondo de página, bajo el banner
      const verde = px(cols[0], 20) // campo del banner

      // Alto pintado: se recorre de abajo hacia arriba y la última fila del banner es
      // la última que está más cerca del verde que del fondo. La regla del 50 % absorbe
      // la fila fraccionaria de mezcla sin contarla dos veces.
      const altoEn = (x) => {
        let y = height - 1
        while (y >= 0 && dist(px(x, y), verde) >= dist(px(x, y), fondo)) y -= 1
        return y + 1
      }
      const altos = cols.map(altoEn)
      const alto = Math.max(...altos)

      // Línea clara de 1 px en los bordes horizontales (§4/§8).
      const saltoArriba = Math.max(...cols.map((x) => Math.abs(luma(px(x, 0)) - luma(px(x, 4)))))
      const ref = luma(px(cols[0], Math.round(alto / 2)))
      const clarasAbajo = Math.max(
        ...cols.map((x) => [1, 2, 3, 4].filter((k) => alto - k >= 0 && luma(px(x, alto - k)) > ref + 10).length),
      )

      return { ...base, altos, alto, clarasAbajo, saltoArriba, rgbVerde: verde, rgbFondo: fondo }
    },
    `data:image/png;base64,${Buffer.from(png).toString('base64')}`,
    opciones,
  )

const OPC = {
  anchoAsset: ANCHO_ASSET,
  razon: RAZON,
  piso: PISO,
  azul: AZUL,
  rojo: ROJO,
  colsSeguras: COLS_SEGURAS,
  filete: { x0: FILETE_X0, azul: FILETE_AZUL_PX, rojo: FILETE_ROJO_PX },
  medirAlto: true,
}

try {
  const medidor = await navegador.newPage()
  await medidor.goto('about:blank')

  const problemas = []
  const tipos = new Map()
  const pagina = await navegador.newPage()
  pagina.on('pageerror', (e) => problemas.push(`pageerror: ${e.message}`))
  pagina.on('console', (m) => m.type() === 'error' && problemas.push(`console: ${m.text()}`))
  pagina.on('requestfailed', (r) => problemas.push(`404/failed: ${r.url()}`))
  pagina.on('response', (r) => tipos.set(r.url(), r.headers()['content-type'] ?? ''))
  await pagina.goto(sitio, { waitUntil: 'networkidle0' })

  // El motivo de existir de scripts/servidor.mjs: antes del banner, el mapa de MIME
  // sólo cubría .html/.js/.mjs/.css/.svg y el JPEG salía como octet-stream. Chrome lo
  // sniffea y lo pinta igual, así que el fallo sería invisible en las capturas.
  const [urlBanner, tipoBanner] = [...tipos].find(([u]) => /banner-conaf-uia.*\.jpe?g/.test(u)) ?? []
  ok(!!urlBanner, `el navegador pidió el banner (${urlBanner ? path.basename(urlBanner) : 'no lo pidió'})`)
  ok(tipoBanner === 'image/jpeg', `servido como image/jpeg y no octet-stream (recibido: "${tipoBanner ?? '—'}")`)

  // --- 1. la matriz de anchos, en los dos temas ---

  console.log('\n1. MATRIZ DE ANCHOS (alto pintado, filete y bordes)')
  for (const ancho of ANCHOS) {
    const esperado = Math.max(ancho / RAZON, PISO)
    const escala = Math.max(ancho, PISO * RAZON) / ANCHO_ASSET
    for (const tema of ['light', 'dark']) {
      await pagina.setViewport({ width: ancho, height: 900, deviceScaleFactor: 1 })
      await pagina.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: tema }])
      // Los botones tienen transition de 150 ms: sin esperar, la captura los agarra a
      // medio camino entre una paleta y la otra.
      await new Promise((r) => setTimeout(r, 300))

      // Se recorta a poco más del banner: 16 px de margen entran de sobra en el
      // padding superior de .app (40 px, 24 en móvil), así que la fila que se usa
      // como fondo de referencia nunca cae sobre el texto del <h1>.
      const png = await pagina.screenshot({
        clip: { x: 0, y: 0, width: ancho, height: Math.ceil(esperado) + 16 },
      })
      const archivo = path.join(RAIZ, `captura-banner-${ancho}-${tema}.png`)
      fs.writeFileSync(archivo, png)
      const m = await medirEnCanvas(medidor, png, OPC)

      console.log(`\n  ${ancho}px · ${tema}`)
      ok(
        Math.abs(m.alto - esperado) <= 1,
        `alto pintado ${m.alto} px = max(${ancho}/${RAZON}, ${PISO}) = ${esperado.toFixed(2)} ±1`,
      )
      ok(
        Math.max(...m.altos) - Math.min(...m.altos) <= 1,
        `mismo alto en ${m.altos.length} columnas de la zona segura: ${m.altos.join(', ')}`,
      )
      ok(
        m.azul >= 0.7 * FILETE_AZUL_PX * escala,
        `filete AZUL: ${m.azul} px cerca de #0e69b0 (esperados ~${(FILETE_AZUL_PX * escala).toFixed(0)})`,
      )
      ok(
        m.rojo >= 0.7 * FILETE_ROJO_PX * escala,
        `filete ROJO: ${m.rojo} px cerca de #eb3d49 (esperados ~${(FILETE_ROJO_PX * escala).toFixed(0)})`,
      )
      ok(
        Math.abs(m.x0Azul - FILETE_X0 * escala) <= 3,
        `el filete empieza en x=${m.x0Azul} (esperado ${(FILETE_X0 * escala).toFixed(1)} ±3)`,
      )
      ok(m.saltoArriba <= 10, `sin línea clara arriba (Δluma fila0-fila4 = ${m.saltoArriba.toFixed(1)} ≤ 10)`)
      // Se tolera UNA fila: cuando ancho/RAZON tiene parte fraccionaria, la última fila
      // se mezcla con el fondo de página y en tema claro eso ES una fila más clara. Es
      // rasterización, no un defecto del asset. Dos o más sí serían una raya real.
      ok(m.clarasAbajo <= 1, `sin línea clara abajo (${m.clarasAbajo} fila(s) clara(s) ≤ 1)`)
    }
  }

  // --- 2. sin la imagen: tiene que verse el color institucional, no blanco ---

  console.log('\n2. SIN LA IMAGEN (§8)')
  // Página aparte: el abort dispara requestfailed y contaminaría el recuento de la
  // sección 5.
  const sinImagen = await navegador.newPage()
  await sinImagen.setViewport({ width: 1366, height: 900, deviceScaleFactor: 1 })
  await sinImagen.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }])
  await sinImagen.setRequestInterception(true)
  const bloqueadas = []
  sinImagen.on('request', (r) => {
    if (/banner-conaf-uia.*\.jpe?g/i.test(r.url())) {
      bloqueadas.push(r.url())
      r.abort()
    } else {
      r.continue()
    }
  })
  await sinImagen.goto(sitio, { waitUntil: 'networkidle0' })
  await new Promise((r) => setTimeout(r, 300))
  const pngSin = await sinImagen.screenshot({ clip: { x: 0, y: 0, width: 1366, height: 96 } })
  fs.writeFileSync(path.join(RAIZ, 'captura-banner-sin-imagen.png'), pngSin)
  const mSin = await medirEnCanvas(medidor, pngSin, { ...OPC, colsSeguras: [2600] })
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
  ok(bloqueadas.length === 1, `se bloqueó la petición del banner (${bloqueadas.length})`)
  ok(d(mSin.rgbVerde, VERDE) <= 12, `se ve #064928 y no blanco: rgb(${mSin.rgbVerde.join(', ')})`)
  ok(d(mSin.rgbVerde, [255, 255, 255]) > 100, 'el fondo de la cabecera NO es blanco')
  ok(
    Math.abs(mSin.alto - 1366 / RAZON) <= 2,
    `la caja conserva su alto sin imagen: ${mSin.alto} px (esperado ${(1366 / RAZON).toFixed(2)} ±2)`,
  )
  await sinImagen.close()

  // --- 3. con scroll: el banner no puede quedar fijo ---

  console.log('\n3. CON SCROLL (§8): el banner NO es fijo')
  await pagina.setViewport({ width: 1366, height: 420, deviceScaleFactor: 1 })
  await pagina.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }])
  await new Promise((r) => setTimeout(r, 200))
  const desplazo = await pagina.evaluate(() => {
    window.scrollTo(0, 250)
    return window.scrollY
  })
  ok(desplazo >= 200, `la página se desplazó ${desplazo} px (si no, la aserción siguiente sería vacía)`)
  const pngScroll = await pagina.screenshot() // viewport actual, sin clip
  const mScroll = await medirEnCanvas(medidor, pngScroll, { ...OPC, medirAlto: false })
  ok(
    mScroll.azul === 0 && mScroll.rojo === 0,
    `tras el scroll el filete ya no está arriba (azul ${mScroll.azul}, rojo ${mScroll.rojo})`,
  )

  // --- 4. la marca a 390 px, ampliada para poder juzgar la legibilidad ---

  console.log('\n4. RECORTE ×4 DE LA MARCA A 390 px')
  const escala390 = (PISO * RAZON) / ANCHO_ASSET
  const anchoMarca = Math.ceil(MARCA_X1 * escala390) + 12
  const png390 = fs.readFileSync(path.join(RAIZ, 'captura-banner-390-light.png'))
  const ampliada = await medidor.evaluate(
    async (uri, r, f) => {
      const img = new Image()
      img.src = uri
      await img.decode()
      const lienzo = document.createElement('canvas')
      lienzo.width = r.w * f
      lienzo.height = r.h * f
      const g = lienzo.getContext('2d')
      // Vecino más cercano: magnificar los píxeles REALES de 1×. Capturar con
      // deviceScaleFactor: 4 re-renderizaría a 4× DPR, saldría más nítido que la
      // realidad y escondería justo el problema de legibilidad que hay que juzgar.
      g.imageSmoothingEnabled = false
      g.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, lienzo.width, lienzo.height)
      return lienzo.toDataURL('image/png')
    },
    `data:image/png;base64,${png390.toString('base64')}`,
    { x: 0, y: 0, w: anchoMarca, h: PISO },
    4,
  )
  const destino = path.join(RAIZ, 'captura-banner-390-marca-x4.png')
  fs.writeFileSync(destino, Buffer.from(ampliada.split(',')[1], 'base64'))
  console.log(`  → ${path.relative(process.cwd(), destino)} (${anchoMarca * 4} × ${PISO * 4})`)
  console.log('  MÍRALA: las tres líneas «UNIDAD DE / INFORMACIÓN / Y ANÁLISIS» tienen que leerse.')

  // --- 5. consola del navegador ---

  console.log('\n5. CONSOLA DEL NAVEGADOR')
  ok(problemas.length === 0, problemas.length === 0 ? 'sin errores ni recursos 404' : `${problemas.length} problemas`)
  for (const p of problemas.slice(0, 10)) console.log(`      ${p}`)
} finally {
  await navegador.close()
  cerrar()
}

console.log(`\n${fallos === 0 ? '✔ BANNER OK' : `✘ ${fallos} comprobación(es) fallaron`}\n`)
process.exit(fallos === 0 ? 0 : 1)
