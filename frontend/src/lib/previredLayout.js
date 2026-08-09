/**
 * Layout de la planilla consolidada: las 108 columnas de la hoja "TXT LOS ANDES"
 * de INSUMO/previred.xlsx, en el mismo orden (A..DD).
 *
 * Las columnas A, B y C son auxiliares de la planilla del área de personal
 * (rut sin dígito verificador, nombre de la caja y correlativo). De la D en
 * adelante van los 105 campos del archivo plano de Previred.
 *
 * `tipo` decide el valor por defecto y el formato en Excel:
 *   'num'   -> 0     (entero, se muestra sin separador para calzar con el TXT)
 *   'texto' -> ''
 *   'lit'   -> valor fijo indicado en `def`
 */

const N = (nombre) => ({ nombre, tipo: 'num', def: 0 })
const T = (nombre) => ({ nombre, tipo: 'texto', def: '' })
const L = (nombre, def) => ({ nombre, tipo: 'lit', def })

export const COLUMNAS = [
  T('rut'), //                A  auxiliar: rut sin dv
  T(''), //                   B  auxiliar: nombre de la caja
  N('Linea'), //              C  auxiliar: correlativo
  T('rut'), //                D
  T('dv'),
  T('ape_pat'),
  T('ape_mat'),
  T('nombres'),
  T('sexo'),
  L('nacion', '0'),
  L('tipo_pago', '1'),
  T('remu_desde'),
  T('remu_hasta'),
  T('reg_previ'),
  T('tipo_trab'),
  N('dias_trab'),
  L('tipo_linea', '00'),
  T('cod_mov'), //            R  ver nota en README: no equivale al código Previred
  T('Fecha_Desde'),
  T('Fecha_Hasta'),
  T('Tramo_Fam'),
  N('num_car_sim'),
  N('num_car_mat'),
  N('num_car_inv'),
  N('asig_fam'),
  N('asig_fam_ret'),
  N('reint_cargas'),
  L('sub_trab_jov', 'N'),
  N('nom_AFP'), //            AC código de AFP
  N('impo_afp'),
  N('cot_obli_afp'),
  N('aporte_sis'),
  N('ahorro_afp'),
  N('sust_afp'),
  N('tasa_pac_afp'),
  N('aporte_indem'),
  N('num_per_sust'),
  T('per_desde_sust'),
  T('per_hasta_sust'),
  T('trab_pesado'),
  N('porc_trab_pesado'),
  N('cot_trab_pesado'),
  N('inst_apvi'),
  T('num_contra_apvi'),
  N('forma_pago_apvi'),
  N('cotiza_apvi'),
  N('cot_dep_conv'),
  N('inst_apvc'),
  T('num_contra_apvc'),
  N('forma_pago_apvc'),
  N('cotiza_apvc'),
  N('cot_emp_apvc'),
  N('rut_afi_volun'),
  T('dv_afi_volun'),
  T('ape_pat_volun'),
  T('ape_mat_volun'),
  T('nombre_volun'),
  N('cod_mov_per_volun'),
  T('fec_desde_volun'),
  T('fec_hasta_volun'),
  N('cod_afp_volun'),
  N('monto_cap_volun'),
  N('monto_aho_vol'),
  N('num_per_cotiza'),
  N('cod_ex_caja'),
  N('tasa_ex_caja'),
  N('renta_imp_fonasa'),
  N('cot_INP'),
  N('Renta_imp_des'),
  L('cod_ex_caja_des', '0000'),
  N('tasa_ex_caja_des'),
  N('cot_desahucio'),
  N('cotiza_fonasa'),
  N('cot_acc_trab_inp'),
  N('boni_ley'),
  N('desc_cargas_fam_inp'),
  N('seguro_compl_salud'),
  N('cod_inst_salud'), //     BZ 7 = Fonasa
  T('num_FUN_poliza'),
  N('impo_isapre'),
  L('moneda_plan', '1'),
  N('cot_pactada'),
  N('cot_obli_isa'),
  N('cot_ad_vol'),
  N('tipo_poliza'),
  N('cod_CCAF'), //           CH 1 = Los Andes, 2 = La Araucana, 3 = Los Héroes
  N('impo_ccaf'),
  N('Cred_per_CCAF'),
  N('Desc_Dental'),
  N('desc_leassing'),
  N('desc_seg_vida'),
  N('otros_desc_ccaf'),
  N('cot_CCAF'),
  N('Desc_Car_fam'),
  N('renta_imp_mes_ant'),
  L('tipo_jornada', '1'),
  N('expectativa_vida'),
  N('rentabilidad_protegida'),
  N('cod_mutual'),
  N('impo_mutual'),
  N('cotiza_mutual'),
  N('sucur_mutual'),
  N('Renta_impo_SC'),
  N('Aporte_trab_SC'),
  N('aporte_emp_SC'),
  N('rut_pag_subs'),
  T('dv_pag_subs'),
  N('centro_costo'), //       DD
]

/** Encabezados en orden, tal como aparecen en la hoja TXT LOS ANDES. */
export const ENCABEZADOS = COLUMNAS.map((c) => c.nombre)

/** Índices auxiliares (columnas A, B y C) que no forman parte del TXT de Previred. */
export const IDX_RUT_AUX = 0
export const IDX_CAJA_AUX = 1
export const IDX_LINEA_AUX = 2

/**
 * Índice de la primera aparición de cada nombre de campo, para poder escribir
 * por nombre. Los nombres duplicados ('rut') se resuelven aquí a mano.
 */
const INDICE = new Map()
COLUMNAS.forEach((c, i) => {
  if (c.nombre && !INDICE.has(c.nombre)) INDICE.set(c.nombre, i)
})
INDICE.set('rut', 3) // columna D, la del layout Previred (la A es la auxiliar)

export function indiceDe(campo) {
  const i = INDICE.get(campo)
  if (i === undefined) throw new Error(`Campo desconocido en el layout Previred: ${campo}`)
  return i
}

/** Fila nueva con todos los valores por defecto del layout. */
export function filaVacia() {
  return COLUMNAS.map((c) => (c.tipo === 'num' ? 0 : c.def))
}

/**
 * Códigos de caja de compensación según Previred (Tabla de Equivalencia N°18).
 *
 * ⚠️ `gabriela mistral: 5` NO está en la tabla vigente, que sólo lista
 * 00 Sin CCAF · 01 Los Andes · 02 La Araucana · 03 Los Héroes · 04 18 de Septiembre.
 * Se conserva porque no hace daño (nunca calzará) pero conviene confirmarlo contra la
 * tabla oficial antes de darlo por bueno. Los Andes = 1, que es el caso validado.
 */
export const COD_CCAF = {
  'los andes': 1,
  'la araucana': 2,
  'los heroes': 3,
  '18 de septiembre': 4,
  'gabriela mistral': 5,
}

/**
 * Códigos de AFP según Previred (Tabla de Equivalencia N°10).
 *
 * ⚠️ SIN CONFIRMAR contra la tabla oficial vigente salvo PlanVital = 29, que es el
 * único que se puede cotejar con la muestra disponible. Antes de confiar en el resto,
 * verificarlos en las Tablas de Equivalencia de Previred.
 *
 * La columna `nom_AFP` del layout es numérica, así que Cuprum se escribe 3 y no "03".
 * En el archivo plano de Previred es un campo de 2 posiciones con cero a la izquierda;
 * para decidirlo hace falta un TXT real, que hoy no está en INSUMO/.
 */
export const COD_AFP = {
  cuprum: 3,
  habitat: 5,
  provida: 8,
  planvital: 29,
  'plan vital': 29,
  capital: 33,
  modelo: 34,
  uno: 35,
}
