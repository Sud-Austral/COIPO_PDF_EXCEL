/**
 * Campos canónicos: el vocabulario intermedio entre lo que dice cada PDF y las
 * 108 columnas del layout Previred.
 *
 * Los perfiles de cada institución traducen sus encabezados a estos nombres; la
 * consolidación sabe cómo agregar cada uno cuando un mismo RUT aparece varias veces.
 *
 *   agg  'suma'    montos: se suman todas las líneas del trabajador
 *        'max'     días trabajados y cargas: se toma el mayor
 *        'primero' primer valor no vacío
 *        'minFecha' / 'maxFecha'
 *        'nombreLargo' se queda con la versión más larga (el PDF trunca nombres)
 *   col  columna del layout Previred donde se escribe (null = no se escribe)
 */

export const CAMPOS = {
  // --- identificación (común a todas las instituciones) ---
  rut: { agg: 'primero', col: null },
  nombre: { agg: 'nombreLargo', col: null },

  // --- datos laborales / cargas familiares ---
  dias: { agg: 'max', col: 'dias_trab' },
  codMov: { agg: 'primero', col: 'cod_mov' },
  fechaDesde: { agg: 'minFecha', col: 'Fecha_Desde' },
  fechaHasta: { agg: 'maxFecha', col: 'Fecha_Hasta' },
  tramo: { agg: 'primero', col: 'Tramo_Fam' },
  cargasSim: { agg: 'max', col: 'num_car_sim' },
  cargasMat: { agg: 'max', col: 'num_car_mat' },
  cargasInv: { agg: 'max', col: 'num_car_inv' },
  asigFam: { agg: 'suma', col: 'asig_fam' },
  asigFamRetro: { agg: 'suma', col: 'asig_fam_ret' },
  reintCargas: { agg: 'suma', col: 'reint_cargas' },
  rutSubs: { agg: 'primero', col: null }, // se parte en rut_pag_subs + dv_pag_subs

  // --- caja de compensación (CCAF) — validado contra la muestra ---
  impCcaf: { agg: 'suma', col: 'impo_ccaf' },
  cotCcaf: { agg: 'suma', col: 'cot_CCAF' },
  credPersonal: { agg: 'suma', col: 'Cred_per_CCAF' },
  convDental: { agg: 'suma', col: 'Desc_Dental' },
  leasing: { agg: 'suma', col: 'desc_leassing' },
  seguroVida: { agg: 'suma', col: 'desc_seg_vida' },
  otrosCcaf: { agg: 'suma', col: 'otros_desc_ccaf' },
  descCargasCcaf: { agg: 'suma', col: 'Desc_Car_fam' },

  // --- AFP (sin validar: falta una muestra real) ---
  impAfp: { agg: 'suma', col: 'impo_afp' },
  cotObliAfp: { agg: 'suma', col: 'cot_obli_afp' },
  aporteSis: { agg: 'suma', col: 'aporte_sis' },
  ahorroAfp: { agg: 'suma', col: 'ahorro_afp' },
  cotTrabPesado: { agg: 'suma', col: 'cot_trab_pesado' },
  aporteIndem: { agg: 'suma', col: 'aporte_indem' },
  cotizaApvi: { agg: 'suma', col: 'cotiza_apvi' },
  cotizaApvc: { agg: 'suma', col: 'cotiza_apvc' },
  cotEmpApvc: { agg: 'suma', col: 'cot_emp_apvc' },

  // --- Fonasa / IPS (sin validar) ---
  impFonasa: { agg: 'suma', col: 'renta_imp_fonasa' },
  cotFonasa: { agg: 'suma', col: 'cotiza_fonasa' },
  cotInp: { agg: 'suma', col: 'cot_INP' },
  cotDesahucio: { agg: 'suma', col: 'cot_desahucio' },

  // --- Isapre (sin validar) ---
  impIsapre: { agg: 'suma', col: 'impo_isapre' },
  cotPactada: { agg: 'suma', col: 'cot_pactada' },
  cotObliIsapre: { agg: 'suma', col: 'cot_obli_isa' },
  cotAdicVol: { agg: 'suma', col: 'cot_ad_vol' },
  numFun: { agg: 'primero', col: 'num_FUN_poliza' },

  // --- Mutual (sin validar) ---
  impMutual: { agg: 'suma', col: 'impo_mutual' },
  cotMutual: { agg: 'suma', col: 'cotiza_mutual' },

  // --- Seguro de cesantía / AFC (sin validar) ---
  impSC: { agg: 'suma', col: 'Renta_impo_SC' },
  aporteTrabSC: { agg: 'suma', col: 'Aporte_trab_SC' },
  aporteEmpSC: { agg: 'suma', col: 'aporte_emp_SC' },
}

/** Campos cuyo valor es un monto/entero (se suman o comparan como número). */
export function esNumerico(campo) {
  const c = CAMPOS[campo]
  return !!c && (c.agg === 'suma' || c.agg === 'max')
}
