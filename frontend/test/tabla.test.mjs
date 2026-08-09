/**
 * Extracción de tablas sobre páginas sintéticas. Sin PDF: corre en CI.
 *
 * El caso central es el que rompió todo: DOS columnas con el mismo rótulo hoja
 * ("Remuneración Imponible"), distinguibles sólo por su encabezado de agrupación.
 * Con el reparto por punto medio, el grupo de la izquierda —que cubre menos columnas—
 * se tragaba la primera y las dos quedaban con la misma clave genérica.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import { localizarTabla, leerFilas } from '../src/lib/tableExtract.js'
import { agruparEnFilas } from '../src/lib/pdfPages.js'

/** Construye una fila visual a partir de [texto, x0, x1]. */
const fila = (y, celdas) =>
  agruparEnFilas(celdas.map(([texto, x0, x1]) => ({ texto, x0, x1, xc: (x0 + x1) / 2, y })))[0]

/**
 * Reproduce la geometría real de la página 2 de un comprobante de AFP: los grupos
 * cubren cantidades de columnas muy distintas (2 contra 4) y sus rótulos van
 * centrados, así que el punto medio entre ellos cae DENTRO del segundo grupo.
 */
const FILAS = [
  fila(98, [
    ['Identificación del Trabajador', 83, 158], // centrado sobre [18, 223]
    ['Fondo de Pensiones', 344, 399], // centrado sobre [223, 519]
    ['Seguro Cesantía', 562, 608], // centrado sobre [519, 651]
  ]),
  fila(108, [
    ['RUT', 32, 45],
    ['Nombre', 93, 190],
    ['Remuneración', 229, 268],
    ['Cotización', 279, 307],
    ['Remuneración', 524, 563],
    ['Cotización', 575, 603],
  ]),
  fila(114, [
    ['Imponible', 235, 261],
    ['Obligatoria', 279, 308],
    ['Imponible', 531, 557],
    ['Afiliado', 579, 599],
  ]),
  fila(126, [
    ['9.068.054-4', 20, 58],
    ['PEREZ JUAN', 62, 190],
    ['1.000.000', 240, 272],
    ['100.000', 285, 313],
    ['900.000', 535, 567],
    ['5.400', 585, 607],
  ]),
]

/** El rayado que traen estos PDF: una celda dibujada por columna y por grupo. */
const BANDAS = [
  { y0: 90, y1: 100, celdas: [{ x0: 18, x1: 223 }, { x0: 223, x1: 519 }, { x0: 519, x1: 651 }] },
  {
    y0: 100,
    y1: 122,
    celdas: [
      { x0: 18, x1: 59 }, { x0: 59, x1: 223 }, { x0: 223, x1: 273 },
      { x0: 273, x1: 314 }, { x0: 519, x1: 569 }, { x0: 569, x1: 610 },
    ],
  },
  {
    y0: 122,
    y1: 130,
    celdas: [
      { x0: 18, x1: 59 }, { x0: 59, x1: 223 }, { x0: 223, x1: 273 },
      { x0: 273, x1: 314 }, { x0: 519, x1: 569 }, { x0: 569, x1: 610 },
    ],
  },
]

test('con rayado, dos columnas homónimas quedan bajo su grupo correcto', () => {
  const tabla = localizarTabla(FILAS, ['RUT'], BANDAS)
  assert.ok(tabla, 'no se localizó la tabla')
  assert.equal(tabla.camino, 'rayado')

  const imponibles = tabla.columnas.filter((c) => c.hoja === 'Remuneración Imponible')
  assert.equal(imponibles.length, 2, 'deberían detectarse dos columnas con el mismo rótulo hoja')
  assert.deepEqual(
    imponibles.map((c) => c.ancestros),
    [['Fondo de Pensiones'], ['Seguro Cesantía']],
    'cada "Remuneración Imponible" tiene que colgar de su propio grupo',
  )
  // Y por tanto sus claves más específicas son DISTINTAS: eso es lo que permite
  // mandarlas a impo_afp y a Renta_impo_SC en vez de sumarlas en un solo campo.
  assert.notEqual(imponibles[0].claves[0], imponibles[1].claves[0])
  assert.equal(imponibles[0].claves[0], 'fondo de pensiones remuneracion imponible')
  assert.equal(imponibles[1].claves[0], 'seguro cesantia remuneracion imponible')
})

test('sin rayado, el reparto por punto medio se equivoca (por eso existe el rayado)', () => {
  const tabla = localizarTabla(FILAS, ['RUT'], null)
  assert.equal(tabla.camino, 'heuristico')
  const imponibles = tabla.columnas.filter((c) => c.hoja.startsWith('Remuneración'))
  // Se documenta el fallo a propósito: si alguien "arregla" el heurístico y este test
  // empieza a pasar, hay que revisarlo, no borrarlo.
  assert.equal(
    imponibles[0].ancestros[0],
    'Identificación del Trabajador',
    'el heurístico atribuye la columna del fondo de pensiones al grupo del trabajador',
  )
})

test('cada celda de datos cae en su columna por contención', () => {
  const tabla = localizarTabla(FILAS, ['RUT'], BANDAS)
  const { registros, fuera, colisiones } = leerFilas(tabla)
  assert.equal(registros.length, 1)
  assert.equal(fuera, 0, 'ninguna celda debería quedar fuera de una columna')
  assert.equal(colisiones, 0, 'ninguna columna debería recibir dos celdas')
  assert.deepEqual(registros[0].valores, ['9.068.054-4', 'PEREZ JUAN', '1.000.000', '100.000', '900.000', '5.400'])
})

test('una página sin fila de datos con RUT no se lee como tabla', () => {
  assert.equal(localizarTabla(FILAS.slice(0, 3), ['RUT'], BANDAS), null)
})
