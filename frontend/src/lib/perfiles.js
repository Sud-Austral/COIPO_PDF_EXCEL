/**
 * Perfiles por institución.
 *
 * Cada perfil traduce los encabezados que imprime el PDF a los campos canónicos
 * de campos.js. Las claves son el resultado de `norm()` sobre la etiqueta del
 * encabezado, probando de la más específica (con sus agrupaciones) a la más general.
 *
 * ESTADO DE VALIDACIÓN
 *   ccaf   ✔ validado contra Caja Los Andes 07/2026: reproduce exacto los totales de
 *            control del propio comprobante.
 *   afp    ✔ validado contra AFP PlanVital 07/2026.
 *   resto  ✘ SIN VALIDAR. Escritos a partir de la nomenclatura estándar de Previred.
 *            Falta una muestra real de cada institución. Mientras tanto, cualquier
 *            columna que no calce se reporta en la hoja "Revisar" en vez de perderse.
 */

import { norm } from './text.js'

/** Encabezados que aparecen en casi todos los comprobantes. */
const COMUNES = {
  rut: 'rut',
  'nombre afiliado': 'nombre',
  'nombre del afiliado': 'nombre',
  'nombre trabajador': 'nombre',
  'apellidos y nombres': 'nombre',
  'dias trab': 'dias',
  'dias trabajados': 'dias',
  'movimiento de personal cod': 'codMov',
  'movimiento de personal codigo': 'codMov',
  'fecha inicio': 'fechaDesde',
  'fecha desde': 'fechaDesde',
  'fecha termino': 'fechaHasta',
  'fecha hasta': 'fechaHasta',
  'cod tramo': 'tramo',
  'codigo tramo': 'tramo',
  'tramo asignacion familiar': 'tramo',
  'cantidad de cargas sim': 'cargasSim',
  'cantidad de cargas invl': 'cargasInv',
  'cantidad de cargas mat': 'cargasMat',
  'cargas simples': 'cargasSim',
  'cargas invalidas': 'cargasInv',
  'cargas maternales': 'cargasMat',
  'monto asig fam': 'asigFam',
  'asignacion familiar': 'asigFam',
  'pago a f retroactiva': 'asigFamRetro',
  'asignacion familiar retroactiva': 'asigFamRetro',
  'reintegro asig fam': 'reintCargas',
  'reintegro asignacion familiar': 'reintCargas',
  'rut ent pag subs': 'rutSubs',
  'rut entidad pagadora de subsidio': 'rutSubs',
}

/** Perfil de Caja de Compensación — el único validado con datos reales. */
const CCAF = {
  bloque: 'ccaf',
  etiqueta: 'Caja de Compensación',
  secciones: [
    {
      id: 'ccaf-cotizaciones',
      // Anclado a la fila completa: sin el $ este título es un PREFIJO del que usa el
      // comprobante de AFP ("…PREVISIONALES Y DEPOSITOS DE AHORRO VOLUNTARIO…").
      titulo: /^DETALLE DE PAGO DE COTIZACIONES PREVISIONALES$/im,
      anclas: ['RUT', 'Nombre Afiliado'],
      // Las dos columnas de imponible suman a propósito en el mismo campo: así se
      // reproduce `impo_ccaf` tanto para afiliados a isapre como a fonasa.
      acumulables: ['impCcaf'],
      mapa: {
        ...COMUNES,
        'afiliados a isapre': 'impCcaf',
        'no afiliados a isapre remuneracion': 'impCcaf',
        'no afiliados a isapre cotizacion 4 2': 'cotCcaf',
        'cotizacion 4 2': 'cotCcaf',
      },
    },
    {
      id: 'ccaf-prestaciones',
      titulo: /^DETALLE DE PAGO DE OTRAS PRESTACIONES$/im,
      anclas: ['RUT', 'Nombre Afiliado'],
      mapa: {
        ...COMUNES,
        'creditos personales': 'credPersonal',
        'convenios dentales': 'convDental',
        leasing: 'leasing',
        'seguros de vida': 'seguroVida',
        otros: 'otrosCcaf',
      },
    },
  ],
  // Rótulos del resumen de la portada -> qué comprobar. Ver portada.compararPortada.
  totales: {
    'cotizacion no afiliados a isapre': { campo: 'cotCcaf' },
    'asignacion familiar': { campo: 'asigFam' },
    'asignacion familiar retroactiva': { campo: 'asigFamRetro' },
    'reintegros de asignacion familiar': { campo: 'reintCargas' },
    'creditos personales': { campo: 'credPersonal' },
    'convenios dentales': { campo: 'convDental' },
    leasing: { campo: 'leasing' },
    'seguros de vida': { campo: 'seguroVida' },
    // Se extraía pero no se comparaba con nada: un control gratis que se perdía.
    otros: { campo: 'otrosCcaf' },
    'cotizacion rebajas': { suma: ['cotCcaf'], menos: ['asigFam', 'asigFamRetro'] },
    'total productos': { suma: ['credPersonal', 'convDental', 'leasing', 'seguroVida', 'otrosCcaf'] },
    'total a pagar a la caja de compensacion': {
      prefijo: true,
      suma: ['cotCcaf', 'credPersonal', 'convDental', 'leasing', 'seguroVida', 'otrosCcaf'],
      menos: ['asigFam', 'asigFamRetro'],
    },
    'n de afiliados informados': { conteo: 'rutUnicos' },
  },
  // Campos que salen al Excel y que la portada NO declara. Se dice cuáles y por qué:
  // un monto sin aval tiene que estar declarado, no descubrirse después.
  sinRespaldo: {
    impCcaf: 'la portada de la caja declara la cotización del 4,2 % pero no la base imponible sobre la que se calcula',
  },
}

/**
 * ✔ Validado contra INSUMO/planvital.zip (AFP PlanVital, 07/2026, 12 páginas).
 *
 * El comprobante de una AFP cubre DOS ámbitos —Fondo de Pensiones y Seguro de
 * Cesantía— y por eso trae dos columnas llamadas igual, "Remuneración Imponible".
 * Sólo el encabezado de agrupación las distingue, así que las claves llevan el grupo
 * por delante. El layout Previred también las separa: `impo_afp` y `Renta_impo_SC`.
 */
const AFP = {
  bloque: 'afp',
  etiqueta: 'AFP',
  regPrevi: 'AFP',
  secciones: [
    {
      id: 'afp-cotizaciones',
      titulo: /^DETALLE DE PAGO DE COTIZACIONES PREVISIONALES Y DEPOSITOS.*FONDO DE PENSIONES$/im,
      anclas: ['RUT'],
      mapa: {
        ...COMUNES,
        'identificacion del trabajador rut': 'rut',
        'identificacion del trabajador apellido paterno materno nombres': 'nombre',
        'apellido paterno materno nombres': 'nombre',
        'fondo de pensiones remuneracion imponible': 'impAfp',
        'fondo de pensiones cotizacion obligatoria': 'cotObliAfp',
        'fondo de pensiones sis': 'aporteSis',
        'fondo de pensiones cotizacion voluntaria apvi': 'cotizaApvi',
        'fondo de pensiones n contrato apvi': 'numContraApvi',
        'fondo de pensiones deposito convenido': 'cotDepConv',
        'fondo de pensiones dep en cta ahorro': 'ahorroAfp',
        'seguro cesantia remuneracion imponible': 'impSC',
        'seguro cesantia cotizacion afiliado': 'aporteTrabSC',
        'seguro cesantia cotizacion empleador': 'aporteEmpSC',
      },
    },
    {
      id: 'afp-trabajos-pesados',
      titulo: /^DETALLE DE PAGO DE COTIZACIONES PARA TRABAJOS PESADOS$/im,
      anclas: ['RUT'],
      mapa: {
        ...COMUNES,
        'identificacion del trabajador rut': 'rut',
        'identificacion del trabajador apellido paterno materno nombres': 'nombre',
        'apellido paterno materno nombres': 'nombre',
        // Esta página repite los encabezados de agrupación del fondo de pensiones,
        // así que las claves se parecen a las de la otra sección. NO son lo mismo: la
        // remuneración imponible de aquí es la base de la sobrecotización por trabajo
        // pesado, no la del fondo de pensiones. Que cada sección tenga su propio mapa
        // es justamente lo que permite distinguirlas.
        'fondo de pensiones remuneracion imponible': 'impTrabPesado',
        'fondo de pensiones puesto de trabajo': 'trabPesado',
        'fondo de pensiones cotiz': 'porcTrabPesado',
        'fondo de pensiones cotiz trab pesados': 'cotTrabPesado',
      },
    },
  ],
  totales: {
    'renta imponible': { campo: 'impAfp' },
    'cotizacion obligatoria': { campo: 'cotObliAfp' },
    'seguro invalidez y sobrevivencia sis': { campo: 'aporteSis' },
    'cotizacion voluntaria apvi': { campo: 'cotizaApvi' },
    'deposito convenido': { campo: 'cotDepConv' },
    'deposito en cuenta de ahorro': { campo: 'ahorroAfp' },
    'aportes de indemnizacion sustitutiva': { campo: 'aporteIndem' },
    'cotizacion por trabajos pesados': { campo: 'cotTrabPesado' },
    'apv colectivo trabajador': { campo: 'cotizaApvc' },
    'apv colectivo empleador': { campo: 'cotEmpApvc' },
    'cotizacion afiliados': { campo: 'aporteTrabSC' },
    'cotizacion empleador': { campo: 'aporteEmpSC' },
    // El rótulo real termina con el nombre de la AFP: "…FONDO DE PENSIONES AFP PlanVital".
    'total a pagar fondo de pensiones': {
      prefijo: true,
      suma: ['cotObliAfp', 'aporteSis', 'cotizaApvi', 'cotDepConv', 'ahorroAfp', 'aporteIndem', 'cotTrabPesado'],
    },
    'total a pagar al fondo de cesantia': { suma: ['aporteTrabSC', 'aporteEmpSC'] },
    'numero afiliados informados': { conteo: 'rutUnicos' },
    'numero afiliados informados fdo cesantia': { conteo: 'rutUnicos', donde: 'impSC' },
    // Aparece dos veces, una por recuadro: 406.998.661 en el del fondo de pensiones y
    // 381.278.579 en el del fondo de cesantía. El rótulo es idéntico en los dos.
    'total remuneraciones o gratificaciones': { alternativas: ['impAfp', 'impSC'] },
    'monto capitalizacion voluntaria': { informativo: 'no hay columna de afiliado voluntario en el detalle' },
    'monto ahorro voluntario': { informativo: 'no hay columna de afiliado voluntario en el detalle' },
    'numero afiliados apvc': { informativo: 'no se informa por trabajador en el detalle' },
    'numero afiliados voluntarios': { informativo: 'no se informa por trabajador en el detalle' },
  },
  sinRespaldo: {
    impTrabPesado: 'la base imponible de trabajos pesados no se declara en el resumen de la portada',
  },
}

/** ✘ Sin validar: falta una muestra de comprobante de Fonasa / IPS. */
const FONASA = {
  bloque: 'fonasa',
  etiqueta: 'Fonasa',
  codInstSalud: 7,
  secciones: [
    {
      id: 'fonasa-detalle',
      titulo: /^DETALLE DE PAGO/im,
      anclas: ['RUT'],
      mapa: {
        ...COMUNES,
        'renta imponible': 'impFonasa',
        'remuneracion imponible': 'impFonasa',
        'cotizacion salud': 'cotFonasa',
        'cotizacion fonasa': 'cotFonasa',
        'cotizacion 7': 'cotFonasa',
        'cotizacion inp': 'cotInp',
        desahucio: 'cotDesahucio',
      },
    },
  ],
}

/** ✘ Sin validar: falta una muestra de comprobante de Isapre. */
const ISAPRE = {
  bloque: 'isapre',
  etiqueta: 'Isapre',
  secciones: [
    {
      id: 'isapre-detalle',
      titulo: /^DETALLE DE PAGO/im,
      anclas: ['RUT'],
      mapa: {
        ...COMUNES,
        'renta imponible': 'impIsapre',
        'remuneracion imponible': 'impIsapre',
        'cotizacion pactada': 'cotPactada',
        'cotizacion obligatoria': 'cotObliIsapre',
        'cotizacion legal': 'cotObliIsapre',
        'cotizacion adicional voluntaria': 'cotAdicVol',
        'n fun': 'numFun',
        'numero fun': 'numFun',
        fun: 'numFun',
      },
    },
  ],
}

/** ✘ Sin validar: falta una muestra de comprobante de mutual. */
const MUTUAL = {
  bloque: 'mutual',
  etiqueta: 'Mutual',
  secciones: [
    {
      id: 'mutual-detalle',
      titulo: /^DETALLE DE PAGO/im,
      anclas: ['RUT'],
      mapa: {
        ...COMUNES,
        'renta imponible': 'impMutual',
        'remuneracion imponible': 'impMutual',
        'cotizacion mutual': 'cotMutual',
        'cotizacion ley 16744': 'cotMutual',
        'cotizacion accidentes del trabajo': 'cotMutual',
      },
    },
  ],
}

/** ✘ Sin validar: falta una muestra de comprobante de AFC (seguro de cesantía). */
const AFC = {
  bloque: 'afc',
  etiqueta: 'AFC',
  secciones: [
    {
      id: 'afc-detalle',
      titulo: /^DETALLE DE PAGO/im,
      anclas: ['RUT'],
      mapa: {
        ...COMUNES,
        'renta imponible': 'impSC',
        'remuneracion imponible': 'impSC',
        'aporte trabajador': 'aporteTrabSC',
        'aporte empleador': 'aporteEmpSC',
        'aporte del empleador': 'aporteEmpSC',
      },
    },
  ],
}

/**
 * RECONOCIMIENTO DE LA INSTITUCIÓN, POR PUNTAJE
 *
 * Antes esto era una lista de regex y ganaba la PRIMERA que calzara. Eso hizo que los
 * comprobantes de AFP se clasificaran como AFC durante meses: el título de un
 * comprobante de AFP dice "FONDO DE PENSIONES, SEGURO DE CESANTIA, APVI, APVC…"
 * —porque una AFP recauda también el seguro de cesantía— y la alternativa
 * `seguro de cesantía` de la regla de AFC lo capturaba antes de llegar a la de AFP.
 * Con el perfil equivocado, `impo_afp` quedó en 0 para los 3.610 trabajadores.
 *
 * Dos cambios de fondo:
 *
 * 1. ÁMBITO. Las señales no valen lo mismo según DÓNDE aparecen. La estructura de la
 *    portada es constante: fila 0 el título, fila 1 el folio, fila 2 el NOMBRE DE LA
 *    INSTITUCIÓN, fila 3 el código de barras. El título es la fuente ruidosa; la línea
 *    de la institución es la fiable. Por eso hay tres ámbitos: 'institucion', 'titulo'
 *    y 'portada' (todo el texto).
 *
 * 2. PUNTAJE Y REGLAS NEGATIVAS, en vez de primer-match. Gana el mayor puntaje, y si
 *    la ventaja sobre el segundo es menor que MARGEN_MINIMO se considera ambiguo y el
 *    documento queda sin verificar en vez de resolverse a la callada.
 */

const MARGEN_MINIMO = 4

/** Rótulos de la portada que NO son el nombre de la institución. */
const ES_ROTULO = /^(per[íi]odo|n[úu]mero de folio|folio|rut|identificaci[oó]n|direcci[oó]n|nombre o raz[oó]n|tel[eé]fono|comuna)/i
/** El código de barras: bloques alfanuméricos separados por guiones. */
const ES_CODIGO_BARRAS = /^[A-Za-z0-9]{6,}(\s*-\s*[A-Za-z0-9]{2,})+$/

/**
 * Las líneas donde puede estar el nombre de la institución: cortas, dentro de las
 * primeras filas, que no sean un rótulo de formulario ni el código de barras.
 */
export function lineasInstitucion(texto) {
  const lineas = String(texto ?? '').split('\n').map((l) => l.trim()).filter(Boolean)
  const candidatas = []
  for (const linea of lineas.slice(1, 7)) {
    if (linea.length > 60 || ES_ROTULO.test(linea) || ES_CODIGO_BARRAS.test(linea)) continue
    candidatas.push(linea)
    if (candidatas.length === 3) break
  }
  return candidatas.join('\n')
}

const REGLAS = [
  // --- CCAF ---
  { perfil: CCAF, ambito: 'institucion', peso: 10, re: /caja\s+de\s+compensaci[oó]n/i },
  { perfil: CCAF, ambito: 'portada', peso: 6, re: /\bC\.?C\.?A\.?F\.?\b/i },
  { perfil: CCAF, ambito: 'portada', peso: 2, re: /asignaci[oó]n\s+familiar/i },

  // --- AFP ---
  { perfil: AFP, ambito: 'institucion', peso: 10, re: /\bA\.?F\.?P\.?\b/i },
  { perfil: AFP, ambito: 'portada', peso: 4, re: /fondo\s+de\s+pensiones/i },
  { perfil: AFP, ambito: 'portada', peso: 3, re: /seguro\s+invalidez\s+y\s+sobrevivencia|\bSIS\b/ },
  { perfil: AFP, ambito: 'portada', peso: 2, re: /cotizaci[oó]n\s+obligatoria/i },

  // --- AFC ---
  { perfil: AFC, ambito: 'institucion', peso: 10, re: /administradora\s+de\s+fondos\s+de\s+cesant[ií]a/i },
  { perfil: AFC, ambito: 'institucion', peso: 6, re: /\bA\.?F\.?C\.?\b/i },
  // Deliberadamente DÉBIL: un comprobante de AFP también dice esto, en su título.
  { perfil: AFC, ambito: 'portada', peso: 1, re: /seguro\s+de\s+cesant[ií]a/i },
  // Regla NEGATIVA: si la institución se llama AFP, esto no es una AFC.
  { perfil: AFC, ambito: 'institucion', peso: -8, re: /\bA\.?F\.?P\.?\b/i },

  // --- Isapre ---
  // "Isapre" a secas NO puede valer sobre toda la portada: el comprobante de la caja
  // de compensación tiene una columna "Afiliados a Isapre" y con eso empataba casi
  // con el CCAF. En la línea de la institución sí es concluyente.
  { perfil: ISAPRE, ambito: 'institucion', peso: 10, re: /\bisapre\b/i },
  { perfil: ISAPRE, ambito: 'portada', peso: 2, re: /\bisapre\b/i },
  { perfil: ISAPRE, ambito: 'institucion', peso: 8, re: /\b(colmena|consalud|cruz\s*blanca|banm[eé]dica|vida\s*tres|nueva\s*masvida)\b/i },
  // "Esencial" es el código 28, pero suelta es una palabra corriente del español:
  // sólo cuenta pegada a "isapre". Antes iba sin \b y capturaba cualquier documento
  // que dijera "es esencial".
  { perfil: ISAPRE, ambito: 'institucion', peso: 8, re: /\bisapre\s+esencial\b/i },

  // --- Fonasa / IPS ---
  { perfil: FONASA, ambito: 'portada', peso: 10, re: /\bfonasa\b|fondo\s+nacional\s+de\s+salud/i },
  { perfil: FONASA, ambito: 'institucion', peso: 8, re: /instituto\s+de\s+previsi[oó]n\s+social|\bI\.?P\.?S\.?\b/i },

  // --- Mutual ---
  { perfil: MUTUAL, ambito: 'institucion', peso: 10, re: /mutual|asociaci[oó]n\s+chilena\s+de\s+seguridad|instituto\s+de\s+seguridad\s+(del\s+trabajo|laboral)/i },
  // Siglas cortas y frecuentes: sólo valen en la línea de la institución.
  { perfil: MUTUAL, ambito: 'institucion', peso: 6, re: /\b(achs|ist|isl)\b/i },
]

/**
 * @param {string} textoPagina1 texto de la portada, una línea por fila visual
 * @returns {{perfil:object, institucion:string, bloque:string, puntaje:number,
 *            segundo:{bloque:string,puntaje:number}|null, ambigua:boolean,
 *            evidencia:Array}|null}
 */
export function detectarPerfil(textoPagina1) {
  const portada = String(textoPagina1 ?? '')
  if (!portada.trim()) return null
  const lineas = portada.split('\n')
  const ambitos = {
    portada,
    titulo: lineas[0] ?? '',
    institucion: lineasInstitucion(portada),
  }

  const puntajes = new Map()
  const evidencia = new Map()
  for (const regla of REGLAS) {
    const m = regla.re.exec(ambitos[regla.ambito])
    if (!m) continue
    const b = regla.perfil.bloque
    puntajes.set(b, (puntajes.get(b) ?? 0) + regla.peso)
    if (!evidencia.has(b)) evidencia.set(b, [])
    evidencia.get(b).push({ ambito: regla.ambito, peso: regla.peso, texto: m[0].trim() })
  }
  if (puntajes.size === 0) return null

  const orden = [...puntajes.entries()].sort((a, b) => b[1] - a[1])
  const [bloque, puntaje] = orden[0]
  if (puntaje <= 0) return null
  const segundo = orden[1] ? { bloque: orden[1][0], puntaje: orden[1][1] } : null

  const perfil = Object.values(PERFILES).find((p) => p.bloque === bloque)
  return {
    perfil,
    bloque,
    institucion: nombreInstitucion(ambitos, perfil),
    puntaje,
    segundo,
    ambigua: !!segundo && puntaje - segundo.puntaje < MARGEN_MINIMO,
    evidencia: evidencia.get(bloque) ?? [],
  }
}

/** Extrae el nombre exacto de la institución, para mostrarlo y para el código. */
function nombreInstitucion(ambitos, perfil) {
  if (perfil.bloque === 'ccaf') {
    const m = /caja\s+de\s+compensaci[oó]n\s+([^\n]+)/i.exec(ambitos.institucion) ??
      /caja\s+de\s+compensaci[oó]n\s+([^\n]+)/i.exec(ambitos.portada)
    if (m) return `Caja de Compensación ${m[1].trim()}`
  }
  if (perfil.bloque === 'afp') {
    const m = /\b(A\.?F\.?P\.?\s+[A-Za-zÁÉÍÓÚÑáéíóúñ]+)/.exec(ambitos.institucion) ??
      /\b(A\.?F\.?P\.?\s+[A-Za-zÁÉÍÓÚÑáéíóúñ]+)/.exec(ambitos.portada)
    if (m) return m[1].trim()
  }
  return perfil.etiqueta
}

/**
 * Busca la sección del perfil que corresponde al título de una página.
 *
 * Los títulos se solapan entre perfiles y entre secciones del mismo perfil: el del
 * CCAF es un PREFIJO del título del AFP, y `/DETALLE DE PAGO/` calza con todos. Si más
 * de una sección calza gana la de coincidencia más larga —la más específica— y se
 * avisa, porque un empate significa que los títulos están mal escritos.
 */
export function seccionPara(perfil, textoPagina, onAmbigua) {
  const calzan = perfil.secciones
    .map((s) => ({ s, m: s.titulo.exec(textoPagina) }))
    .filter((x) => x.m)
    .sort((a, b) => b.m[0].length - a.m[0].length)
  if (calzan.length === 0) return null
  if (calzan.length > 1 && onAmbigua) onAmbigua(calzan.map((x) => x.s.id).join(' / '))
  return calzan[0].s
}

/**
 * Traduce las columnas detectadas en la página a campos canónicos.
 *
 * Devuelve también QUÉ clave calzó y de qué nivel, no sólo el campo: si una columna
 * con encabezado de agrupación termina calzando por la clave genérica, el perfil no
 * está distinguiendo dos columnas que el PDF sí distingue, y eso hay que poder verlo.
 *
 * @returns {Array<{campo:string|null, clave:string|null, nivel:string|null, etiqueta:string}>}
 */
export function mapearColumnas(columnas, mapa) {
  return columnas.map((col) => {
    const soloHoja = norm(col.hoja)
    for (const clave of col.claves) {
      if (!mapa[clave]) continue
      return {
        campo: mapa[clave],
        clave,
        nivel: clave === soloHoja ? 'hoja' : 'ancestro',
        etiqueta: col.etiqueta,
      }
    }
    return { campo: null, clave: null, nivel: null, etiqueta: col.etiqueta }
  })
}

export const PERFILES = { CCAF, AFP, FONASA, ISAPRE, MUTUAL, AFC }
