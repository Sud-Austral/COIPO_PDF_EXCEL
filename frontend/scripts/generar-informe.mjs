/**
 * Genera el informe para el área de remuneraciones: docs/comprobantes-previred.pdf
 *
 * Los números NO se escriben a mano. Se obtienen ejecutando el mismo pipeline que usa
 * la aplicación sobre los ZIP reales de INSUMO/, y se inyectan en la plantilla. Así el
 * documento no puede quedar desfasado en silencio, que es justo el problema que se
 * viene arrastrando.
 *
 * PRIVACIDAD: el informe sólo lleva conteos, nombres de columna y los totales que el
 * propio comprobante imprime en su portada. Ningún dato de una persona. Al final se
 * relee el PDF generado y se aborta si aparece algo que parezca un RUT.
 *
 *   npm run informe        (desde frontend/)
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import puppeteer from 'puppeteer-core'

import { procesarZip } from '../src/lib/pipeline.js'
import { ENCABEZADOS } from '../src/lib/previredLayout.js'
import { CAMPOS } from '../src/lib/campos.js'
import { PERFILES } from '../src/lib/perfiles.js'
import { buscarChrome } from './servidor.mjs'
import { plantilla } from './plantilla-informe.mjs'

// El script vive junto a los demás de frontend/scripts/ para poder resolver
// node_modules; la salida va a docs/, que es donde se busca un documento.
const AQUI = path.dirname(fileURLToPath(import.meta.url))
const RAIZ = path.resolve(AQUI, '../..')
const INSUMO = path.join(RAIZ, 'INSUMO')
const DOCS = path.join(RAIZ, 'docs')
const SALIDA_HTML = path.join(DOCS, 'comprobantes-previred.html')
const SALIDA_PDF = path.join(DOCS, 'comprobantes-previred.pdf')

// ─────────────────────────────────────────────────────────────────────────────

/** Reduce el resultado del pipeline a lo que necesita el informe. */
function construirModelo(zip, { documentos, filas, control }) {
  const utiles = documentos.filter((d) => !d.duplicadoDe && d.reconocido)

  const docs = utiles.map((d) => {
    const secciones = new Map()
    for (const c of d.columnas ?? []) {
      if (!secciones.has(c.seccion)) secciones.set(c.seccion, { columnas: 0, desde: c.desde, hasta: c.hasta })
      const s = secciones.get(c.seccion)
      s.columnas += 1
      s.desde = Math.min(s.desde, c.desde)
      s.hasta = Math.max(s.hasta, c.hasta)
    }
    const campos = [...new Set((d.columnas ?? []).map((c) => c.campo).filter(Boolean))]
    const grupos = [...new Set((d.columnas ?? []).flatMap((c) => (c.etiqueta.includes(' > ') ? [c.etiqueta.split(' > ')[0]] : [])))]
    const propios = control.filter((c) => c.archivo === d.archivo)
    return {
      archivo: d.archivo,
      institucion: d.institucion,
      bloque: d.bloque,
      paginas: d.paginas,
      lineas: d.registros.length,
      trabajadores: new Set(d.registros.map((r) => r._rut.cuerpo)).size,
      periodo: d.periodo?.texto ?? '',
      secciones: [...secciones].map(([id, s]) => ({ id: nombreSeccion(id), ...s })),
      grupos,
      campos: campos.map((c) => ({ campo: c, columna: CAMPOS[c]?.col ?? null })),
      conceptos: conceptosDe(campos),
      control: propios.map((c) => ({ rotulo: c.rotulo, monto: c.declarado, ok: c.ok })),
    }
  })

  // Cruce de poblaciones: quién aparece en qué comprobante.
  const porDoc = utiles.map((d) => new Set(d.registros.map((r) => r._rut.cuerpo)))
  const todos = new Set(porDoc.flatMap((s) => [...s]))
  const soloPrimero = [...porDoc[0] ?? []].filter((r) => !porDoc.slice(1).some((s) => s.has(r))).length
  const enAmbos = porDoc.length > 1 ? [...porDoc[0]].filter((r) => porDoc[1].has(r)).length : 0

  return {
    zip,
    periodo: docs[0]?.periodo ?? '',
    generado: fechaLegible(),
    documentos: docs,
    consolidado: {
      trabajadores: filas.length,
      enElZip: todos.size,
      soloPrimero,
      enAmbos,
      conCesantia: contarConDato(filas, 'Renta_impo_SC'),
      controles: control.length,
      controlesOk: control.filter((c) => c.ok).length,
    },
    cobertura: coberturaDeColumnas(filas, utiles),
  }
}

/** Nombre legible de la sección, sin el identificador interno. */
function nombreSeccion(id) {
  return {
    'ccaf-cotizaciones': 'Cotizaciones previsionales',
    'ccaf-prestaciones': 'Otras prestaciones',
    'afp-cotizaciones': 'Cotizaciones previsionales y ahorro',
    'afp-trabajos-pesados': 'Cotizaciones por trabajos pesados',
  }[id] ?? id
}

/** Traducción de campo canónico a un concepto que se entienda en remuneraciones. */
const CONCEPTOS = {
  impCcaf: 'Remuneración imponible para la caja',
  cotCcaf: 'Cotización 4,2 %',
  asigFam: 'Asignación familiar',
  asigFamRetro: 'Asignación familiar retroactiva',
  reintCargas: 'Reintegros de asignación familiar',
  cargasSim: 'Cargas simples', cargasInv: 'Cargas inválidas', cargasMat: 'Cargas maternales',
  tramo: 'Tramo de asignación familiar',
  credPersonal: 'Créditos personales', convDental: 'Convenios dentales',
  leasing: 'Leasing', seguroVida: 'Seguros de vida', otrosCcaf: 'Otros descuentos de la caja',
  impAfp: 'Remuneración imponible para el fondo de pensiones',
  cotObliAfp: 'Cotización obligatoria', aporteSis: 'Seguro de invalidez y sobrevivencia (SIS)',
  cotizaApvi: 'Ahorro previsional voluntario (APVI)', numContraApvi: 'N° de contrato APVI',
  cotDepConv: 'Depósito convenido', ahorroAfp: 'Depósito en cuenta de ahorro',
  impSC: 'Remuneración imponible para el seguro de cesantía',
  aporteTrabSC: 'Aporte del trabajador al seguro de cesantía',
  aporteEmpSC: 'Aporte del empleador al seguro de cesantía',
  trabPesado: 'Puesto de trabajo pesado', porcTrabPesado: 'Porcentaje de trabajo pesado',
  cotTrabPesado: 'Cotización por trabajo pesado', impTrabPesado: 'Imponible de trabajo pesado',
  impFonasa: 'Remuneración imponible para salud',
  cotFonasa: 'Cotización de salud (7 %)',
  cotInp: 'Cotización ex-INP', cotDesahucio: 'Desahucio',
  impIsapre: 'Remuneración imponible para la isapre',
  cotPactada: 'Cotización pactada con la isapre',
  cotObliIsapre: 'Cotización legal de salud',
  cotAdicVol: 'Cotización adicional voluntaria de salud',
  numFun: 'N° de FUN / póliza de la isapre',
  impMutual: 'Remuneración imponible para la mutualidad',
  cotMutual: 'Cotización de la ley 16.744 (accidentes del trabajo)',
  dias: 'Días trabajados', codMov: 'Código de movimiento de personal',
  fechaDesde: 'Fecha desde', fechaHasta: 'Fecha hasta',
  rut: 'RUT', nombre: 'Nombre', rutSubs: 'Entidad pagadora de subsidio',
}
const IDENTIFICACION = new Set(['rut', 'nombre', 'dias', 'codMov', 'fechaDesde', 'fechaHasta', 'rutSubs'])

function conceptosDe(campos) {
  return campos.filter((c) => !IDENTIFICACION.has(c)).map((c) => CONCEPTOS[c] ?? c)
}

function contarConDato(filas, columna) {
  const i = ENCABEZADOS.indexOf(columna)
  return i < 0 ? 0 : filas.filter((f) => Number(f[i]) > 0).length
}

/**
 * Qué columnas de la planilla quedan sin dato, y qué institución las llenaría.
 * Se deduce de los perfiles: cada perfil sabe a qué campos mapea, y cada campo su columna.
 */
function coberturaDeColumnas(filas, utiles) {
  const columnaDelPerfil = new Map() // columna -> [instituciones que podrían llenarla]
  for (const perfil of Object.values(PERFILES)) {
    const etiqueta = perfil.etiqueta
    for (const seccion of perfil.secciones) {
      for (const campo of Object.values(seccion.mapa)) {
        const col = CAMPOS[campo]?.col
        if (!col) continue
        if (!columnaDelPerfil.has(col)) columnaDelPerfil.set(col, new Set())
        columnaDelPerfil.get(col).add(etiqueta)
      }
    }
  }
  const presentes = new Set(utiles.map((d) => d.perfil?.etiqueta).filter(Boolean))

  const vacias = []
  for (const [col, insts] of columnaDelPerfil) {
    const i = ENCABEZADOS.indexOf(col)
    if (i < 0) continue
    const conDato = filas.some((f) => f[i] !== 0 && f[i] !== '' && f[i] != null)
    if (conDato) continue
    // Si una institución que SÍ está en el archivo puede llenar esta columna, que esté
    // en cero no se explica por un comprobante ausente: simplemente no hubo monto.
    // (Le pasa a "reintegros de asignación familiar", que todas las instituciones
    //  informan y que en este período es 0 en todas.)
    if ([...insts].some((x) => presentes.has(x))) continue
    const faltantes = [...insts].filter((x) => !presentes.has(x))
    if (faltantes.length) vacias.push({ columna: col, concepto: conceptoDeColumna(col), instituciones: faltantes })
  }
  // Se agrupa por institución faltante, que es como lo va a leer quien pida los comprobantes.
  const porInstitucion = new Map()
  for (const v of vacias) {
    for (const inst of v.instituciones) {
      if (!porInstitucion.has(inst)) porInstitucion.set(inst, [])
      porInstitucion.get(inst).push(v.concepto)
    }
  }
  return [...porInstitucion].map(([institucion, conceptos]) => ({ institucion, conceptos: [...new Set(conceptos)] }))
}

function conceptoDeColumna(col) {
  for (const [campo, def] of Object.entries(CAMPOS)) if (def.col === col) return CONCEPTOS[campo] ?? col
  return col
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
function fechaLegible() {
  const d = new Date()
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`
}

async function imprimirPdf(html, pdf) {
  const chrome = buscarChrome()
  if (!chrome) {
    console.log('✘ No se encontró Chrome ni Edge; no se puede imprimir el PDF.')
    process.exit(1)
  }
  const navegador = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox'] })
  try {
    const pagina = await navegador.newPage()
    await pagina.goto(`file://${html.replace(/\\/g, '/')}`, { waitUntil: 'networkidle0' })
    await pagina.pdf({
      path: pdf,
      format: 'A4',
      printBackground: true,
      margin: { top: '14mm', bottom: '16mm', left: '14mm', right: '14mm' },
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate:
        '<div style="width:100%;font:9px system-ui;color:#6b7280;padding:0 14mm;display:flex;justify-content:space-between">' +
        '<span>CONAF · Unidad de Información y Análisis</span>' +
        '<span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span></div>',
    })
  } finally {
    await navegador.close()
  }
}

/**
 * El informe va a salir del computador por correo, así que antes de darlo por bueno se
 * relee el PDF y se comprueba que no se haya colado ningún dato de una persona.
 */
async function auditarPrivacidad(pdf, { documentos }) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(pdf)) }).promise
  let texto = ''
  for (let i = 1; i <= doc.numPages; i += 1) {
    const c = await (await doc.getPage(i)).getTextContent()
    texto += `${c.items.map((x) => x.str).join(' ')}\n`
  }

  const ruts = texto.match(/\b\d{1,3}(?:\.\d{3})+-[\dkK]\b/g) ?? []
  const nombres = new Set()
  for (const d of documentos) {
    for (const reg of (d.registros ?? []).slice(0, 400)) {
      const primera = String(reg.nombre ?? '').split(/\s+/)[0]
      if (primera && primera.length > 4 && texto.includes(primera)) nombres.add(primera)
    }
  }

  console.log('\nAUDITORÍA DE PRIVACIDAD DEL PDF')
  console.log(`  ${ruts.length === 0 ? '✔' : '✘'} sin RUT (${ruts.length} coincidencias${ruts.length ? `: ${ruts.slice(0, 3)}` : ''})`)
  console.log(`  ${nombres.size === 0 ? '✔' : '✘'} sin apellidos de la muestra (${nombres.size}${nombres.size ? `: ${[...nombres].slice(0, 3)}` : ''})`)
  console.log(`  · ${doc.numPages} página(s), ${texto.length.toLocaleString('es-CL')} caracteres`)
  if (ruts.length || nombres.size) {
    console.log('\n✘ El informe contiene datos de personas. No se entrega.')
    process.exit(1)
  }
  console.log('\n✔ INFORME OK\n')
}

// ─────────────────────────────────────────────────────────────────────────────

const zips = fs.existsSync(INSUMO)
  ? fs.readdirSync(INSUMO).filter((f) => f.toLowerCase().endsWith('.zip')).sort()
  : []
if (zips.length === 0) {
  console.log(`✘ No hay ningún .zip en ${INSUMO}. El informe se arma con los datos reales.`)
  process.exit(1)
}

fs.mkdirSync(DOCS, { recursive: true })
console.log(`Leyendo ${zips.join(', ')} …`)
const resultado = await procesarZip(pdfjs, new Uint8Array(fs.readFileSync(path.join(INSUMO, zips[0]))))

fs.writeFileSync(SALIDA_HTML, plantilla(construirModelo(zips[0], resultado)))
console.log(`✔ ${path.relative(RAIZ, SALIDA_HTML)}`)

await imprimirPdf(SALIDA_HTML, SALIDA_PDF)
console.log(`✔ ${path.relative(RAIZ, SALIDA_PDF)}`)

await auditarPrivacidad(SALIDA_PDF, resultado)
