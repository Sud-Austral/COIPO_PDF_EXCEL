/** Normalización de texto, números y RUT. Sin PDF: corre en CI. */

import test from 'node:test'
import assert from 'node:assert/strict'

import { norm, squish, isNumeric, toNumber, dateKey, parsePeriodo } from '../src/lib/text.js'
import { looksLikeRut, parseRut, dvCalculado, partirNombre } from '../src/lib/rut.js'

test('norm quita tildes, puntuación y mayúsculas', () => {
  assert.equal(norm('Remuneración Imponible'), 'remuneracion imponible')
  assert.equal(norm('Cotización 4,2%'), 'cotizacion 4 2')
  assert.equal(norm('N° Contrato APVI'), 'n contrato apvi')
  assert.equal(norm('Apellido Paterno, Materno, Nombres'), 'apellido paterno materno nombres')
  // "RUT:" y "RUT" colapsan al mismo texto: por eso localizarTabla no puede usar
  // sólo el ancla "rut" para decidir que una fila es el encabezado de la tabla.
  assert.equal(norm('RUT:'), 'rut')
  assert.equal(norm(null), '')
})

test('squish conserva mayúsculas y tildes', () => {
  assert.equal(squish('  CORPORACION   NACIONAL  FORESTAL '), 'CORPORACION NACIONAL FORESTAL')
})

test('toNumber entiende el formato chileno y distingue 0 de "sin dato"', () => {
  assert.equal(toNumber('406.998.661'), 406998661)
  assert.equal(toNumber('$ 57.975.516'), 57975516)
  assert.equal(toNumber('18,84'), 18.84)
  assert.equal(toNumber('0'), 0)
  assert.equal(toNumber(''), null)
  assert.equal(toNumber('—'), null)
  // Dos celdas que caen en la misma columna se concatenan; el resultado NO es un
  // número, y hoy eso hace que el monto se descarte en silencio.
  assert.equal(toNumber('45.811 1.234.567'), null)
})

test('isNumeric no confunde un RUT con un monto', () => {
  assert.equal(isNumeric('1.234.567'), true)
  assert.equal(isNumeric('9.068.054-4'), false)
  assert.equal(isNumeric('Remuneración'), false)
})

test('dateKey y parsePeriodo', () => {
  assert.equal(dateKey('01/07/2026'), 20260701)
  assert.equal(dateKey('no es fecha'), null)
  assert.deepEqual(parsePeriodo('Período de Remuneraciones: 07/2026'), {
    mes: 7, anio: 2026, texto: '07/2026', previred: '72026',
  })
})

test('RUT: detección, dígito verificador y parseo', () => {
  assert.equal(looksLikeRut('9.068.054-4'), true)
  assert.equal(looksLikeRut('12.786.960-K'), true)
  assert.equal(looksLikeRut('9068054-4'), false) // sin puntos no es el formato de Previred
  assert.equal(looksLikeRut('1.234.567'), false)

  assert.equal(dvCalculado('9068054'), '4')
  assert.equal(dvCalculado('61313000'), '4')

  const r = parseRut('9.068.054-4')
  assert.deepEqual(r, { cuerpo: '9068054', dv: '4', valido: true, texto: '9.068.054-4' })
  assert.equal(parseRut('9.068.054-9').valido, false)
  assert.equal(parseRut('no'), null)
})

test('partirNombre reparte en paterno / materno / nombres', () => {
  assert.deepEqual(partirNombre('ABARCA ARIAS NANCY DEL PILAR'), {
    ape_pat: 'ABARCA', ape_mat: 'ARIAS', nombres: 'NANCY DEL PILAR',
  })
  assert.deepEqual(partirNombre('PEREZ JUAN'), { ape_pat: 'PEREZ', ape_mat: '', nombres: 'JUAN' })
  assert.deepEqual(partirNombre(''), { ape_pat: '', ape_mat: '', nombres: '' })
})
