/**
 * Genera el favicon institucional recortando el isotipo CONAF del propio banner.
 *
 * Se corre A MANO cuando cambia el asset, no en CI:
 *   node scripts/gen-favicon.mjs
 *
 * Por qué un script y no dos PNG sueltos: la caja de recorte se midió píxel a píxel
 * sobre el JPEG y es lo único que hace falta recordar. Escrita aquí, no hay que
 * volver a deducirla nunca.
 *
 * MEDIDAS (barrido de píxeles claros sobre banner-conaf-uia.jpg, 3032 × 177):
 *   - marca CONAF completa (árbol + logotipo "conaf"): x 105..266, y 51..135
 *   - copa del árbol:  x 105..189, y 51..99
 *   - tronco:          x 134..157, y 100..125
 *   - palabra "conaf": empieza en x ≈ 155, y 100..135 (la "f" baja hasta y=135)
 *
 * El árbol y la palabra SE SOLAPAN en horizontal, así que ningún recorte rectangular
 * los separa: por eso se tapa la palabra con el verde de fondo ANTES de reducir
 * (taparla después dejaría el borde de las letras mezclado con el blanco).
 *
 * Se descartaron, mirando los tres a 32 px ampliados ×8:
 *   - sólo la copa            → una mancha blanca, no se lee como árbol
 *   - la marca completa       → 1,9:1 dentro de un cuadrado: el árbol queda diminuto
 *   - el isotipo UIA          → ilegible a 32 px
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'

import { buscarChrome } from './servidor.mjs'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const RAIZ = path.resolve(AQUI, '..')
const FUENTE = path.join(RAIZ, 'src/assets/banner-conaf-uia.jpg')
const PUBLICO = path.join(RAIZ, 'public')

const VERDE = '#064928'
const RECORTE = { x: 105, y: 51, w: 86, h: 76 } // copa + tronco
const TAPA = { x: 153, y: 97, w: 38, h: 30 } // la palabra "conaf", en coordenadas del asset
const TAMANOS = [
  { archivo: 'favicon.png', px: 32, margen: 2 },
  { archivo: 'apple-touch-icon.png', px: 180, margen: 18 },
]

const chrome = buscarChrome()
if (!chrome) {
  console.log('⚠ No se encontró Chrome ni Edge instalados.')
  process.exit(0)
}

const navegador = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ['--no-sandbox', '--force-color-profile=srgb'],
})
try {
  const pagina = await navegador.newPage()
  await pagina.goto('about:blank')
  const uri = `data:image/jpeg;base64,${fs.readFileSync(FUENTE).toString('base64')}`

  const png = await pagina.evaluate(
    async (uri, recorte, tapa, fondo, tamanos) => {
      const img = new Image()
      img.src = uri
      await img.decode()

      const bruto = document.createElement('canvas')
      bruto.width = recorte.w
      bruto.height = recorte.h
      const gb = bruto.getContext('2d')
      gb.drawImage(img, recorte.x, recorte.y, recorte.w, recorte.h, 0, 0, recorte.w, recorte.h)
      gb.fillStyle = fondo
      gb.fillRect(tapa.x - recorte.x, tapa.y - recorte.y, tapa.w, tapa.h)

      return tamanos.map((t) => {
        const lienzo = document.createElement('canvas')
        lienzo.width = t.px
        lienzo.height = t.px
        const g = lienzo.getContext('2d')
        g.fillStyle = fondo
        g.fillRect(0, 0, t.px, t.px)
        const util = t.px - 2 * t.margen
        const k = Math.min(util / recorte.w, util / recorte.h)
        const w = recorte.w * k
        const h = recorte.h * k
        g.imageSmoothingQuality = 'high'
        g.drawImage(bruto, 0, 0, recorte.w, recorte.h, (t.px - w) / 2, (t.px - h) / 2, w, h)
        return lienzo.toDataURL('image/png')
      })
    },
    uri,
    RECORTE,
    TAPA,
    VERDE,
    TAMANOS,
  )

  TAMANOS.forEach((t, i) => {
    const destino = path.join(PUBLICO, t.archivo)
    fs.writeFileSync(destino, Buffer.from(png[i].split(',')[1], 'base64'))
    console.log(`✔ ${path.relative(RAIZ, destino)} — ${t.px}×${t.px}`)
  })
} finally {
  await navegador.close()
}
