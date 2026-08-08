/**
 * Servidor estático que imita el subpath de GitHub Pages, y localización de Chrome.
 *
 * Compartido por scripts/verify-browser.mjs y scripts/verify-banner.mjs: el mapa de
 * MIME tiene que estar en UN solo lugar, o el próximo tipo de archivo que se agregue
 * se servirá bien en un arnés y mal en el otro. (Fue el caso: cuando entró el banner
 * JPEG, TIPOS sólo cubría .html/.js/.mjs/.css/.svg y el .jpg salía como
 * application/octet-stream. Chrome lo sniffea y lo pinta igual, pero es una bomba
 * con temporizador.)
 */

import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'

export const BASE = '/COIPO_PDF_EXCEL/'

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

/**
 * Sirve `dist` bajo BASE en un puerto efímero de 127.0.0.1.
 * Devuelve la URL del sitio, el registro de peticiones y el cierre.
 */
export async function servirDist(dist) {
  const pedidos = []
  const servidor = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0])
    pedidos.push(url)
    if (!url.startsWith(BASE)) {
      res.writeHead(404).end('fuera del base')
      return
    }
    let archivo = path.join(dist, url.slice(BASE.length))
    if (url === BASE || url.endsWith('/')) archivo = path.join(dist, 'index.html')
    if (!fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) {
      res.writeHead(404).end('no existe')
      return
    }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(archivo)] ?? 'application/octet-stream' })
    fs.createReadStream(archivo).pipe(res)
  })
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r))
  const { port } = servidor.address()
  return { sitio: `http://127.0.0.1:${port}${BASE}`, pedidos, cerrar: () => servidor.close() }
}

const NAVEGADORES = [
  `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env['ProgramFiles(x86)']}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env['ProgramFiles(x86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
]

export const buscarChrome = () => NAVEGADORES.find((p) => p && fs.existsSync(p))
