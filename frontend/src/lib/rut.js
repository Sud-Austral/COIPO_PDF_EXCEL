/** Manejo de RUT chileno: detección, normalización y dígito verificador. */

/** Un RUT tal como lo imprime Previred: 9.068.054-4 / 12.786.960-K */
const RUT_RE = /^\d{1,3}(?:\.\d{3})*-[\dkK]$/

export function looksLikeRut(s) {
  return RUT_RE.test(String(s ?? '').trim())
}

/**
 * "9.068.054-4" -> { cuerpo: '9068054', dv: '4', valido: true }
 * Devuelve null si no es un RUT reconocible.
 */
export function parseRut(s) {
  const t = String(s ?? '').trim()
  if (!RUT_RE.test(t)) return null
  const [cuerpoRaw, dvRaw] = t.split('-')
  const cuerpo = cuerpoRaw.replace(/\./g, '')
  const dv = dvRaw.toUpperCase()
  return { cuerpo, dv, valido: dv === dvCalculado(cuerpo), texto: t }
}

/** Dígito verificador por módulo 11. */
export function dvCalculado(cuerpo) {
  let suma = 0
  let factor = 2
  for (let i = String(cuerpo).length - 1; i >= 0; i -= 1) {
    suma += Number(String(cuerpo)[i]) * factor
    factor = factor === 7 ? 2 : factor + 1
  }
  const resto = 11 - (suma % 11)
  if (resto === 11) return '0'
  if (resto === 10) return 'K'
  return String(resto)
}

/**
 * Separa "ABARCA ARIAS NANCY DEL PILAR" en los tres campos del layout Previred.
 * El PDF entrega un solo string, así que se asume 1er token = paterno,
 * 2º = materno y el resto = nombres. Es la convención de Previred, pero no es
 * infalible (apellidos compuestos); por eso `truncado` se reporta en la hoja Revisar.
 */
export function partirNombre(nombre) {
  const partes = String(nombre ?? '').trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return { ape_pat: '', ape_mat: '', nombres: '' }
  if (partes.length === 1) return { ape_pat: partes[0], ape_mat: '', nombres: '' }
  if (partes.length === 2) return { ape_pat: partes[0], ape_mat: '', nombres: partes[1] }
  return { ape_pat: partes[0], ape_mat: partes[1], nombres: partes.slice(2).join(' ') }
}
