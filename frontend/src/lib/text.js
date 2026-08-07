/**
 * Utilidades de normalización de texto, números, fechas y RUT chilenos.
 * Sin dependencias: se usa igual desde el navegador y desde Node (scripts/verify.mjs).
 */

/** Quita tildes, pasa a minúsculas y reduce todo lo no alfanumérico a un solo espacio. */
export function norm(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Colapsa espacios repetidos conservando mayúsculas y tildes. */
export function squish(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim()
}

const NUM_RE = /^-?\$?\s*\d{1,3}(\.\d{3})*(,\d+)?$|^-?\$?\s*\d+(,\d+)?$/

/** ¿El texto es un monto/entero con separador de miles chileno? */
export function isNumeric(s) {
  return NUM_RE.test(String(s ?? '').trim())
}

/**
 * Convierte "1.234.567" | "$ 57.975.516" | "18,84" a Number.
 * Devuelve null si no parece un número (así distinguimos "0" de "sin dato").
 */
export function toNumber(s) {
  const t = String(s ?? '').trim()
  if (!t || !NUM_RE.test(t)) return null
  const n = Number(t.replace(/[$\s.]/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

const DATE_RE = /^(\d{2})\/(\d{2})\/(\d{4})$/

/** "01/07/2026" -> 20260701, para poder comparar min/max sin objetos Date. */
export function dateKey(s) {
  const m = DATE_RE.exec(String(s ?? '').trim())
  if (!m) return null
  return Number(m[3]) * 10000 + Number(m[2]) * 100 + Number(m[1])
}

/** "Periodo de Remuneraciones: 07/2026" -> { mes: 7, anio: 2026, previred: '72026' } */
export function parsePeriodo(s) {
  const m = /(\d{2})\/(\d{4})/.exec(String(s ?? ''))
  if (!m) return null
  const mes = Number(m[1])
  const anio = Number(m[2])
  return { mes, anio, texto: `${m[1]}/${m[2]}`, previred: `${mes}${anio}` }
}
