/**
 * Detección de la institución a partir de la portada.
 *
 * EL PRIMER CASO DE ESTE ARCHIVO ES EL BUG QUE MOTIVÓ TODO ESTO. El comprobante de
 * AFP PlanVital tiene "SEGURO DE CESANTIA" en su propio título —porque una AFP cobra
 * también el seguro de cesantía— y la regla de AFC lo capturaba antes de que se llegara
 * a evaluar la de AFP. Resultado: el PDF entero se mapeaba con el perfil equivocado,
 * `impo_afp` quedaba en 0 para los 3.610 trabajadores, y nada lo detectaba.
 *
 * Si alguien vuelve a poner la regla de AFC antes que la de AFP, este archivo falla.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import { detectarPerfil } from '../src/lib/perfiles.js'

/** Portada de AFP PlanVital, transcrita del PDF real (INSUMO/planvital.zip). */
const PORTADA_AFP = [
  'COMPROBANTE DE PAGO DE COTIZACIONES PREVISIONALES Y DEPOSITOS DE AHORRO VOLUNTARIO',
  'FONDO DE PENSIONES, SEGURO DE CESANTIA, APVI, APVC Y AFILIADO VOLUNTARIO',
  'Período de Remuneraciones: 07/2026',
  'AFP PlanVital',
  'CORPORACION NACIONAL FORESTAL',
  'Renta Imponible',
  'Cotización Obligatoria',
  'Seguro Invalidez y Sobrevivencia (SIS)',
  'TOTAL A PAGAR FONDO DE PENSIONES AFP PlanVital',
].join('\n')

/** Portada de una CCAF, transcrita del PDF real (Caja Los Andes). */
const PORTADA_CCAF = [
  'COMPROBANTE DE PAGO DE COTIZACIONES PREVISIONALES',
  'Período de Remuneraciones: 07/2026',
  'Caja de Compensación Los Andes',
  'CORPORACION NACIONAL FORESTAL',
  'COTIZACIÓN NO AFILIADOS A ISAPRE',
  'ASIGNACIÓN FAMILIAR',
].join('\n')

/** Portada de una AFC de verdad (no hay muestra real: es nomenclatura estándar). */
const PORTADA_AFC = [
  'COMPROBANTE DE PAGO DE COTIZACIONES DEL SEGURO DE CESANTIA',
  'Período de Remuneraciones: 07/2026',
  'AFC Chile II S.A.',
  'Administradora de Fondos de Cesantía',
  'Aporte Trabajador',
  'Aporte Empleador',
].join('\n')

test('un comprobante de AFP cuyo título menciona el seguro de cesantía se detecta como AFP', () => {
  const d = detectarPerfil(PORTADA_AFP)
  assert.ok(d, 'no se reconoció ninguna institución')
  assert.equal(d.perfil.bloque, 'afp', `se detectó "${d.perfil.bloque}" en vez de "afp"`)
})

test('el nombre de la AFP se extrae para poder poner el código en nom_AFP', () => {
  const d = detectarPerfil(PORTADA_AFP)
  assert.match(d.institucion, /planvital/i, `institución detectada: "${d.institucion}"`)
})

test('un comprobante de caja de compensación se detecta como CCAF, con su nombre', () => {
  const d = detectarPerfil(PORTADA_CCAF)
  assert.equal(d.perfil.bloque, 'ccaf')
  assert.match(d.institucion, /los andes/i)
})

test('un comprobante de AFC de verdad se detecta como AFC', () => {
  const d = detectarPerfil(PORTADA_AFC)
  assert.equal(d.perfil.bloque, 'afc', `se detectó "${d.perfil.bloque}" en vez de "afc"`)
})

test('una portada irreconocible devuelve null en vez de adivinar', () => {
  assert.equal(detectarPerfil('BOLETA DE HONORARIOS ELECTRÓNICA\nSERVICIO DE IMPUESTOS INTERNOS'), null)
})

test('"esencial" suelto en un texto no convierte el documento en isapre', () => {
  // La regex de isapre incluía `esencial` sin \b: cualquier documento con esa palabra
  // en la portada caía en el perfil equivocado.
  const texto = 'COMPROBANTE DE PAGO\nCaja de Compensación Los Andes\nes esencial revisar los datos'
  assert.equal(detectarPerfil(texto).perfil.bloque, 'ccaf')
})
