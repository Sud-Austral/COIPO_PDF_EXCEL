/**
 * Perfiles por institución.
 *
 * Cada perfil traduce los encabezados que imprime el PDF a los campos canónicos
 * de campos.js. Las claves son el resultado de `norm()` sobre la etiqueta del
 * encabezado, probando de la más específica (con sus agrupaciones) a la más general.
 *
 * ESTADO DE VALIDACIÓN
 *   ccaf   ✔ validado contra INSUMO/pdfProvired.zip (Caja Los Andes, 07/2026):
 *            reproduce exacto los totales de control del propio comprobante.
 *   resto  ✘ SIN VALIDAR. Escritos a partir de la nomenclatura estándar de Previred.
 *            Falta una muestra real de cada institución. Mientras tanto, cualquier
 *            columna que no calce se reporta en la hoja "Revisar" en vez de perderse.
 */

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
      titulo: /DETALLE DE PAGO DE COTIZACIONES PREVISIONALES/i,
      anclas: ['RUT', 'Nombre Afiliado'],
      mapa: {
        ...COMUNES,
        // Las dos columnas de imponible suman en el mismo campo: así se reproduce
        // el `impo_ccaf` del archivo plano tanto para afiliados a isapre como a fonasa.
        'afiliados a isapre': 'impCcaf',
        'no afiliados a isapre remuneracion': 'impCcaf',
        'no afiliados a isapre cotizacion 4 2': 'cotCcaf',
        'cotizacion 4 2': 'cotCcaf',
      },
    },
    {
      titulo: /DETALLE DE PAGO DE OTRAS PRESTACIONES/i,
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
}

/** ✘ Sin validar: falta una muestra de comprobante de AFP. */
const AFP = {
  bloque: 'afp',
  etiqueta: 'AFP',
  regPrevi: 'AFP',
  secciones: [
    {
      titulo: /DETALLE DE PAGO/i,
      anclas: ['RUT'],
      mapa: {
        ...COMUNES,
        'renta imponible': 'impAfp',
        'remuneracion imponible': 'impAfp',
        'cotizacion obligatoria': 'cotObliAfp',
        'cotizacion obligatoria afp': 'cotObliAfp',
        'seguro de invalidez y sobrevivencia': 'aporteSis',
        'aporte sis': 'aporteSis',
        sis: 'aporteSis',
        'ahorro voluntario': 'ahorroAfp',
        'cuenta de ahorro voluntario': 'ahorroAfp',
        'cotizacion trabajo pesado': 'cotTrabPesado',
        'aporte indemnizacion': 'aporteIndem',
        'ahorro previsional voluntario': 'cotizaApvi',
        apv: 'cotizaApvi',
        apvc: 'cotizaApvc',
      },
    },
  ],
}

/** ✘ Sin validar: falta una muestra de comprobante de Fonasa / IPS. */
const FONASA = {
  bloque: 'fonasa',
  etiqueta: 'Fonasa',
  codInstSalud: 7,
  secciones: [
    {
      titulo: /DETALLE DE PAGO/i,
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
      titulo: /DETALLE DE PAGO/i,
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
      titulo: /DETALLE DE PAGO/i,
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
      titulo: /DETALLE DE PAGO/i,
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
 * Reconocimiento de la institución a partir del texto de la primera página.
 * El orden importa: lo más específico primero.
 */
const RECONOCEDORES = [
  { re: /caja\s+de\s+compensaci[oó]n\s+(.+)/i, perfil: CCAF },
  { re: /\bC\.?C\.?A\.?F\.?\b/i, perfil: CCAF },
  { re: /administradora\s+de\s+fondos\s+de\s+cesant[ií]a|\bA\.?F\.?C\.?\b|seguro\s+de\s+cesant[ií]a/i, perfil: AFC },
  { re: /\bA\.?F\.?P\.?[\s.]/i, perfil: AFP },
  { re: /\bisapre\b|colmena|consalud|cruz\s*blanca|banm[eé]dica|vida\s*tres|nueva\s*masvida|esencial/i, perfil: ISAPRE },
  { re: /\bfonasa\b|fondo\s+nacional\s+de\s+salud|instituto\s+de\s+previsi[oó]n\s+social|\bI\.?P\.?S\.?\b/i, perfil: FONASA },
  { re: /mutual|asociaci[oó]n\s+chilena\s+de\s+seguridad|\bachs\b|instituto\s+de\s+seguridad\s+(del\s+trabajo|laboral)|\bist\b|\bisl\b/i, perfil: MUTUAL },
]

/**
 * @param {string} textoPagina1 texto de la portada del PDF
 * @returns {{perfil:object, institucion:string}|null}
 */
export function detectarPerfil(textoPagina1) {
  const texto = String(textoPagina1 ?? '')
  for (const { re, perfil } of RECONOCEDORES) {
    const m = re.exec(texto)
    if (m) return { perfil, institucion: nombreInstitucion(texto, perfil) }
  }
  return null
}

/** Extrae el nombre exacto de la institución para mostrarlo y para el código de caja. */
function nombreInstitucion(texto, perfil) {
  if (perfil.bloque === 'ccaf') {
    const m = /caja\s+de\s+compensaci[oó]n\s+([^\n]+)/i.exec(texto)
    if (m) return `Caja de Compensación ${m[1].trim()}`
  }
  const m = /\b(A\.?F\.?P\.?\s+[A-Za-zÁÉÍÓÚÑáéíóúñ]+)/.exec(texto)
  if (perfil.bloque === 'afp' && m) return m[1].trim()
  return perfil.etiqueta
}

/** Busca la sección del perfil que corresponde al título de una página. */
export function seccionPara(perfil, textoPagina) {
  return perfil.secciones.find((s) => s.titulo.test(textoPagina)) ?? null
}

/**
 * Traduce las columnas detectadas en la página a campos canónicos.
 * @returns {Array<string|null>} campo canónico por índice de columna (null = sin mapear)
 */
export function mapearColumnas(columnas, mapa) {
  return columnas.map((col) => {
    for (const clave of col.claves) {
      if (mapa[clave]) return mapa[clave]
    }
    return null
  })
}

export const PERFILES = { CCAF, AFP, FONASA, ISAPRE, MUTUAL, AFC }
