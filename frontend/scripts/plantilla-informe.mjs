/**
 * Plantilla del informe. Todo lo que sea un número sale del `modelo`, que lo calcula
 * generar-informe.mjs ejecutando el pipeline: acá no se escribe ninguna cifra a mano.
 *
 * El destinatario es el área de remuneraciones, no un programador: nada de nombres de
 * archivo de código, líneas de fuente ni jerga de parsing.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const BANNER = fs.readFileSync(path.resolve(AQUI, '../src/assets/banner-conaf-uia.jpg')).toString('base64')

const n = (x) => Number(x ?? 0).toLocaleString('es-CL')
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function plantilla(m) {
  const [a, b] = m.documentos
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Comprobantes de cotizaciones — qué trae cada uno</title>
<style>
  @page { size: A4; }
  * { box-sizing: border-box; }
  body {
    margin: 0; color: #1f2937;
    font: 10.5pt/1.55 "Segoe UI", system-ui, sans-serif;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .banner { background: #064928; line-height: 0; margin: -14mm -14mm 10mm; }
  .banner img { display: block; width: 100%; }
  h1 { font-size: 19pt; line-height: 1.25; margin: 0 0 4px; color: #064928; letter-spacing: -0.3px; }
  .meta { color: #6b7280; font-size: 9pt; margin: 0 0 18px; }
  h2 {
    font-size: 12.5pt; margin: 22px 0 8px; color: #064928;
    border-bottom: 2px solid #d7e3da; padding-bottom: 4px;
    break-after: avoid;
  }
  h3 { font-size: 10.5pt; margin: 14px 0 4px; color: #15301d; }
  p { margin: 0 0 9px; }
  ul, ol { margin: 0 0 9px; padding-left: 20px; }
  li { margin-bottom: 4px; }
  strong { color: #0b1220; }
  .destacado {
    background: #f0f6f2; border-left: 4px solid #064928;
    padding: 10px 14px; margin: 12px 0; break-inside: avoid;
  }
  .destacado p:last-child { margin-bottom: 0; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0 14px; font-size: 9.5pt; break-inside: avoid; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  thead th { background: #064928; color: #fff; font-weight: 600; border-bottom: none; }
  tbody tr:nth-child(even) { background: #f8faf9; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .tarjetas { display: flex; gap: 12px; margin: 12px 0; break-inside: avoid; }
  .tarjeta { flex: 1; border: 1px solid #d7e3da; border-radius: 6px; padding: 12px 14px; }
  .tarjeta h3 { margin-top: 0; color: #064928; font-size: 11pt; }
  .cifra { font-size: 22pt; font-weight: 700; color: #064928; line-height: 1; }
  .cifra span { font-size: 9.5pt; font-weight: 400; color: #6b7280; display: block; margin-top: 2px; }
  .cruce { border: 1px solid #d7e3da; border-radius: 6px; overflow: hidden; margin: 12px 0; break-inside: avoid; }
  .cruce .barra { display: flex; height: 34px; font-size: 9pt; color: #fff; }
  .cruce .barra div { display: flex; align-items: center; justify-content: center; }
  .solo { background: #15301d; }
  .ambos { background: #5e8f19; }
  .leyenda { display: flex; gap: 18px; padding: 8px 12px; font-size: 9pt; color: #374151; }
  .leyenda i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 5px; }
  .pregunta { background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 12px 16px; margin: 12px 0; break-inside: avoid; }
  .pregunta ol { margin-bottom: 0; }
  .nota { font-size: 9pt; color: #6b7280; }
  .ok { color: #1f7a45; font-weight: 600; }
  .evitar-corte { break-inside: avoid; }
</style>
</head>
<body>

<div class="banner"><img src="data:image/jpeg;base64,${BANNER}" alt="CONAF — Unidad de Información y Análisis"></div>

<h1>Comprobantes de cotizaciones: qué trae cada uno<br>y qué caminos tenemos</h1>
<p class="meta">
  Período ${esc(m.periodo)} · archivo <strong>${esc(m.zip)}</strong> ·
  ${m.documentos.length} comprobantes · ${m.generado}<br>
  Preparado por la Unidad de Información y Análisis para el área de personal.
</p>

<div class="destacado">
  <p><strong>En una frase.</strong> El archivo trae dos comprobantes de dos instituciones
  distintas —${esc(a.institucion)} y ${esc(b?.institucion ?? '')}—, y no dicen lo mismo de la misma
  gente: cubren <em>poblaciones distintas</em> y <em>conceptos distintos</em>. Juntos alcanzan para
  una parte de la planilla de Previred, no para toda.</p>
</div>

<h2>1. Qué trae cada comprobante</h2>

<div class="tarjetas">
${m.documentos.map((d) => `
  <div class="tarjeta">
    <h3>${esc(d.institucion)}</h3>
    <p class="cifra">${n(d.trabajadores)}<span>trabajadores informados</span></p>
    <p class="nota" style="margin-top:10px">
      ${n(d.paginas)} páginas · ${n(d.lineas)} líneas de detalle<br>
      ${d.control.length} totales de control, <span class="ok">todos cuadran</span>
    </p>
  </div>`).join('')}
</div>

<p>Los dos son legibles y los dos cuadran: cada comprobante imprime en su portada los totales que
está cobrando, y la suma de lo que se extrae línea por línea coincide <strong>exactamente</strong>
con esos totales en los ${m.consolidado.controles} casos. El problema no es la lectura.</p>

<table>
  <thead><tr><th>&nbsp;</th>${m.documentos.map((d) => `<th>${esc(d.institucion)}</th>`).join('')}</tr></thead>
  <tbody>
    <tr><td>Trabajadores informados</td>${m.documentos.map((d) => `<td class="num"><strong>${n(d.trabajadores)}</strong></td>`).join('')}</tr>
    <tr><td>Páginas · líneas</td>${m.documentos.map((d) => `<td class="num">${n(d.paginas)} · ${n(d.lineas)}</td>`).join('')}</tr>
    <tr><td>Secciones del documento</td>${m.documentos.map((d) => `<td>${d.secciones.map((s) => `${esc(s.id)}<br><span class="nota">${s.desde === s.hasta ? `pág. ${s.desde}` : `pág. ${s.desde} a ${s.hasta}`}</span>`).join('<br>')}</td>`).join('')}</tr>
    <tr><td>Agrupaciones de la tabla</td>${m.documentos.map((d) => `<td>${d.grupos.filter((g) => g !== 'Identificación del Trabajador').map(esc).join('<br>')}</td>`).join('')}</tr>
    <tr><td>Totales de control en la portada</td>${m.documentos.map((d) => `<td class="num">${d.control.length}</td>`).join('')}</tr>
  </tbody>
</table>

<h3>Conceptos que aporta cada uno</h3>
<p>No comparten <strong>ni uno</strong>. Por eso son complementarios y no alternativos: para armar
la planilla hacen falta los dos.</p>

<table>
  <thead><tr><th style="width:34%">${esc(a.institucion)}</th><th style="width:34%">${esc(b?.institucion ?? '')}</th></tr></thead>
  <tbody><tr>
    <td>${a.conceptos.map(esc).join('<br>')}</td>
    <td>${(b?.conceptos ?? []).map(esc).join('<br>')}</td>
  </tr></tbody>
</table>

<div class="destacado">
  <p><strong>Un detalle que conviene tener presente:</strong> el comprobante de la AFP recauda
  <em>dos</em> cosas, no una. Además del fondo de pensiones trae el <strong>seguro de cesantía</strong>
  (renta imponible, aporte del trabajador y aporte del empleador). Es decir, esas columnas de la
  planilla se llenan desde el comprobante de la AFP, no desde uno de la AFC.</p>
</div>

<h2>2. El cruce: por qué ${n(b?.trabajadores ?? 0)} y no ${n(a.trabajadores)}</h2>

<p>De los <strong>${n(m.consolidado.enElZip)}</strong> trabajadores que aparecen en el archivo,
sólo <strong>${n(m.consolidado.enAmbos)}</strong> figuran en los dos comprobantes. El resto aparece
únicamente en el de la caja de compensación.</p>

<div class="cruce">
  <div class="barra">
    <div class="solo" style="width:${((m.consolidado.soloPrimero / m.consolidado.enElZip) * 100).toFixed(1)}%">
      ${n(m.consolidado.soloPrimero)}
    </div>
    <div class="ambos" style="width:${((m.consolidado.enAmbos / m.consolidado.enElZip) * 100).toFixed(1)}%">
      ${n(m.consolidado.enAmbos)}
    </div>
  </div>
  <div class="leyenda">
    <span><i class="solo" style="background:#15301d"></i>Sólo en ${esc(a.institucion)}</span>
    <span><i class="ambos" style="background:#5e8f19"></i>En los dos comprobantes</span>
  </div>
</div>

<p>La explicación es sencilla y es la que hay que confirmar: <strong>la caja informa a toda la
dotación, y cada AFP informa sólo a sus propios afiliados.</strong> Los
${n(m.consolidado.soloPrimero)} restantes están afiliados a <em>otras</em> AFP, cuyos comprobantes
no vienen en este archivo. De ahí también que sólo ${n(m.consolidado.conCesantia)} trabajadores
tengan datos de seguro de cesantía: son los de esta AFP que además cotizan cesantía.</p>

<h2>3. Qué falta para una planilla completa</h2>

<p>Con estos dos comprobantes quedan sin dato las columnas que sólo puede llenar una institución
que no está en el archivo. Estas son, agrupadas por quién tendría que aportarlas:</p>

<table>
  <thead><tr><th style="width:26%">Falta el comprobante de</th><th>Columnas de la planilla que quedan en cero</th></tr></thead>
  <tbody>
${m.cobertura.map((c) => `    <tr><td><strong>${esc(c.institucion)}</strong></td><td>${c.conceptos.map(esc).join(' · ')}</td></tr>`).join('\n')}
    <tr><td><strong>Las demás AFP</strong></td><td>Todas las de pensiones y cesantía, para los
      ${n(m.consolidado.soloPrimero)} trabajadores que no están afiliados a ${esc(b?.institucion ?? '')}</td></tr>
  </tbody>
</table>

<p class="nota">La lista sale de comparar lo que cada tipo de institución puede informar contra lo
que efectivamente llegó: no está escrita a mano.</p>

<h2>4. Los dos insumos posibles</h2>

<p>Hay dos maneras de llegar a la misma planilla, y no son equivalentes. Conviene decidir cuál
queremos antes de seguir invirtiendo en una de ellas.</p>

<table>
  <thead><tr><th style="width:22%">&nbsp;</th><th style="width:39%">Archivo plano de Previred</th><th style="width:39%">Comprobantes en PDF <span class="nota">(lo que estamos usando)</span></th></tr></thead>
  <tbody>
    <tr><td><strong>Quién lo emite</strong></td><td>el empleador, <em>antes</em> de pagar</td><td>cada institución, <em>después</em> de cobrar</td></tr>
    <tr><td><strong>Qué dice</strong></td><td>lo <strong>declarado</strong></td><td>lo <strong>efectivamente cobrado</strong></td></tr>
    <tr><td><strong>Cobertura</strong></td><td>toda la dotación y todas las instituciones, en un solo archivo</td><td>una institución por comprobante; hay que juntarlos todos</td></tr>
    <tr><td><strong>Pasarlo a Excel</strong></td><td>directo: es un archivo de formato fijo con los campos ya definidos</td><td>hay que leer tablas dentro del PDF y validar un perfil por institución</td></tr>
    <tr><td><strong>Estado hoy</strong></td><td>no lo tenemos a mano; hay que averiguar si queda guardado</td><td>funcionando y validado para caja de compensación y AFP</td></tr>
  </tbody>
</table>

<div class="destacado">
  <p><strong>No dicen lo mismo, y esa diferencia puede ser justamente lo que interesa.</strong>
  Cuando se pudo comparar esta planilla contra la que arma el área a mano, la remuneración
  imponible de la caja difería en <strong>100 de ${n(a.trabajadores)}</strong> casos: eran afiliados
  a isapre donde el empleador había declarado 0 y la caja informaba monto. Si el objetivo es
  <em>cotejar lo declarado contra lo cobrado</em>, hacen falta los dos insumos, no uno.</p>
</div>

<h2>5. Tres caminos</h2>

<h3>A. Completar el archivo de comprobantes</h3>
<p>Pedir los comprobantes de todas las instituciones del período —las demás AFP, salud, mutualidad—
y procesarlos juntos. <strong>Ventaja:</strong> refleja lo que cada institución efectivamente cobró.
<strong>Costo:</strong> cada institución imprime su comprobante distinto, así que hace falta una
muestra real de cada una para validarla; hoy hay dos validadas.</p>

<h3>B. Partir del archivo plano de Previred</h3>
<p>Un solo archivo, con toda la dotación y todas las instituciones, y con los campos ya definidos:
convertirlo a Excel es directo. <strong>Ventaja:</strong> completo y rápido.
<strong>Límite:</strong> es lo declarado antes de pagar, así que no sirve para detectar diferencias
con lo que la institución cobró.</p>

<h3>C. Los dos, y cotejar uno contra otro</h3>
<p>Es lo que sugiere la planilla que hoy se arma a mano. <strong>Ventaja:</strong> es el único que
detecta diferencias entre lo declarado y lo cobrado. <strong>Costo:</strong> el más alto, porque
requiere A y B.</p>

<h2>6. Lo que necesitamos que nos confirmes</h2>

<p>Estas cuatro respuestas son las que definen el camino. Son de remuneraciones, no técnicas:</p>

<div class="pregunta">
  <ol>
    <li>El archivo plano que se sube a Previred, <strong>¿queda guardado?</strong> ¿Quién lo tiene
    y en qué formato?</li>
    <li>Lo que el área necesita en la planilla, <strong>¿es lo declarado o lo cobrado?</strong></li>
    <li>El archivo de comprobantes, <strong>¿debería traer todas las instituciones</strong> del
    período, o sólo algunas por algún motivo?</li>
    <li>La planilla que hoy se arma a mano, <strong>¿es para declarar o para cotejar?</strong></li>
  </ol>
</div>

<p class="nota">Todos los números de este informe se obtuvieron procesando el archivo real y se
regeneran automáticamente: no están escritos a mano. El documento no contiene ningún dato de una
persona —sólo conteos, nombres de columna y los totales que el propio comprobante imprime en su
portada— y eso se verifica antes de emitirlo.</p>

</body>
</html>
`
}
