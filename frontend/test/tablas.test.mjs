/**
 * Coherencia de las tablas de configuración. No necesita PDF ni datos reales, así que
 * es lo que sí puede correr en CI.
 *
 * Todo lo que se comprueba aquí es una relación entre dos tablas escritas a mano, que
 * es exactamente donde se rompen las cosas sin que nadie lo note: un perfil que apunta
 * a un campo canónico que ya no existe, o un campo cuya columna destino se renombró.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import { CAMPOS } from '../src/lib/campos.js'
import { PERFILES } from '../src/lib/perfiles.js'
import { ENCABEZADOS, COD_CCAF, indiceDe, filaVacia } from '../src/lib/previredLayout.js'

test('cada CAMPOS[x].col existe en el layout Previred', () => {
  for (const [nombre, def] of Object.entries(CAMPOS)) {
    if (!def.col) continue
    assert.doesNotThrow(() => indiceDe(def.col), `campo "${nombre}" apunta a la columna inexistente "${def.col}"`)
  }
})

test('cada valor de cada mapa de perfil es un campo canónico conocido', () => {
  for (const [nombrePerfil, perfil] of Object.entries(PERFILES)) {
    for (const seccion of perfil.secciones) {
      for (const [rotulo, campo] of Object.entries(seccion.mapa)) {
        assert.ok(CAMPOS[campo], `${nombrePerfil}: el rótulo "${rotulo}" apunta al campo inexistente "${campo}"`)
      }
    }
  }
})

test('cada campo de cada mapa `totales` es un campo canónico conocido', () => {
  for (const [nombrePerfil, perfil] of Object.entries(PERFILES)) {
    for (const [rotulo, def] of Object.entries(perfil.totales ?? {})) {
      if (def.informativo || def.ambiguo) continue
      for (const campo of def.suma ?? (def.campo ? [def.campo] : [])) {
        assert.ok(CAMPOS[campo], `${nombrePerfil}: el total "${rotulo}" apunta al campo inexistente "${campo}"`)
      }
      if (def.donde) assert.ok(CAMPOS[def.donde], `${nombrePerfil}: total "${rotulo}" filtra por campo inexistente`)
    }
  }
})

test('las claves de los mapas están normalizadas (minúsculas, sin tildes ni puntuación)', () => {
  const NORMAL = /^[a-z0-9]+( [a-z0-9]+)*$/
  for (const [nombrePerfil, perfil] of Object.entries(PERFILES)) {
    for (const seccion of perfil.secciones) {
      for (const rotulo of Object.keys(seccion.mapa)) {
        // Las claves se buscan con el resultado de norm(): una clave con mayúscula,
        // tilde o punto no puede calzar NUNCA, y el fallo sería mudo.
        assert.match(rotulo, NORMAL, `${nombrePerfil}: la clave "${rotulo}" nunca podrá calzar`)
      }
    }
  }
})

test('los perfiles declaran `acumulables` sólo con campos numéricos', () => {
  for (const [nombrePerfil, perfil] of Object.entries(PERFILES)) {
    for (const campo of perfil.acumulables ?? []) {
      assert.ok(CAMPOS[campo], `${nombrePerfil}: acumulable "${campo}" no es un campo canónico`)
      assert.ok(
        CAMPOS[campo].agg === 'suma' || CAMPOS[campo].agg === 'max',
        `${nombrePerfil}: acumulable "${campo}" no es numérico, sumarlo no tiene sentido`,
      )
    }
  }
})

test('el layout tiene 108 columnas y filaVacia() calza', () => {
  assert.equal(ENCABEZADOS.length, 108)
  assert.equal(filaVacia().length, 108)
})

test('los códigos de institución no se repiten', () => {
  const vistos = new Map()
  for (const [nombre, cod] of Object.entries(COD_CCAF)) {
    assert.ok(!vistos.has(cod), `COD_CCAF: el código ${cod} está en "${vistos.get(cod)}" y en "${nombre}"`)
    vistos.set(cod, nombre)
  }
})

test('cada perfil tiene al menos una sección con anclas y mapa', () => {
  for (const [nombre, perfil] of Object.entries(PERFILES)) {
    assert.ok(perfil.secciones.length > 0, `${nombre} no tiene secciones`)
    for (const s of perfil.secciones) {
      assert.ok(s.titulo instanceof RegExp, `${nombre}: título no es RegExp`)
      assert.ok(Array.isArray(s.anclas) && s.anclas.length > 0, `${nombre}: sección sin anclas`)
      assert.ok(Object.keys(s.mapa).length > 0, `${nombre}: sección con mapa vacío`)
    }
  }
})
