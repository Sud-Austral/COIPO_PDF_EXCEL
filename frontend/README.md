# frontend — Consolidador Previred

React + Vite. Aplicación 100 % cliente: no hay backend, no se sube ningún archivo y no se
guarda nada. Ver el [README de la raíz](../README.md) para el uso y las limitaciones conocidas.

## Comandos

```bash
npm ci
npm run dev              # servidor de desarrollo
npm run build            # genera dist/
npm run lint             # oxlint
npm run verify           # arnés de datos, en Node, sobre INSUMO/
npm run verify:browser   # arnés en Chrome real sobre dist/ (correr build antes)
npm run verify:banner    # arnés del banner: mide píxeles sobre las capturas
npm run favicon          # regenera el favicon recortando el isotipo del banner
```

## Cómo está armado

```
ZIP ─fflate─► PDFs ─pdf.js─► celdas con coordenadas visuales
                                 │
                            tableExtract  columnas deducidas del encabezado
                                 │
                            perfiles      rótulo del PDF → campo canónico
                                 │
                            consolidate   merge por RUT → fila de 108 columnas
                                 │
                            buildWorkbook ExcelJS → .xlsx
```

Todo corre dentro de `src/worker/pipeline.worker.js` para no congelar la interfaz. El worker de
pdf.js se crea **explícitamente** (`GlobalWorkerOptions.workerPort`): si se le deja crearlo a
pdf.js y falla, cae en su *fake worker*, que corre dentro de nuestro worker y filtra sus
`postMessage` a la ventana principal mezclados con los nuestros.

| Archivo | Responsabilidad |
| --- | --- |
| `lib/unzip.js` | Descomprime en memoria; ignora `__MACOSX/`, `._*` y `.DS_Store`. |
| `lib/pdfPages.js` | pdf.js → celdas `{x0, x1, xc, y, texto}` en coordenadas **visuales**. |
| `lib/tableExtract.js` | Encuentra la tabla y deduce las columnas del encabezado del PDF. |
| `lib/portada.js` | Empleador, folio, período y **totales de control** de la primera página. |
| `lib/perfiles.js` | Reconoce la institución y traduce sus rótulos a campos canónicos. |
| `lib/campos.js` | Vocabulario intermedio: cada campo con su regla de agregación y su columna. |
| `lib/previredLayout.js` | Las 108 columnas, en orden, con tipo y valor por defecto. |
| `lib/consolidate.js` | Merge por RUT y armado de la fila final. |
| `lib/pipeline.js` | Orquesta, detecta duplicados y compara contra los totales de control. |
| `lib/buildWorkbook.js` | Las tres hojas del `.xlsx`. |

### Detalles que no son obvios

- **Las páginas vienen rotadas 90°.** En coordenadas del PDF cada trabajador es una *columna*.
  Hay que aplicar `viewport.transform` (que ya incorpora `page.rotate`) antes de agrupar filas.
- **Todas las celdas están centradas** respecto de su columna, incluidos el RUT y el nombre. Por
  eso alcanza con asignar cada celda a la columna cuyo centro esté más cerca; no hay coordenadas
  fijas en el código.
- **Los encabezados de grupo van centrados sobre sus columnas** y no siempre se solapan con las
  de los extremos: "Movimiento de Personal" no cubre horizontalmente a "Cod.". Por eso cada
  encabezado recibe un *dominio* que llega hasta el punto medio con su vecino.
- **El pie legal contiene `Ord. N° 3673/0181`**, que calza con un `\d{2}/\d{4}` suelto. El
  período se busca por rótulo, nunca por patrón libre.
- **El cuadro "Antecedentes Generales" cae en las mismas filas visuales** que el resumen de
  montos, así que el monto es el *primer* número de la fila, no el último.
- **Un comprobante repetido se procesa una sola vez** (se identifica por folio): si no, los
  montos se sumarían dos o tres veces sin que nadie lo note.

## Agregar o corregir un perfil

En `lib/perfiles.js`, el `mapa` de cada sección va de **rótulo normalizado** (`norm()`: sin
tildes, minúsculas, sin puntuación) a campo canónico de `lib/campos.js`. Se prueban tres claves,
de la más específica a la más general:

1. todos los encabezados de agrupación + la hoja,
2. el último encabezado de agrupación + la hoja,
3. la hoja sola.

Así `"Cod."` bajo `"Movimiento de Personal"` calza con `'movimiento de personal cod'`, y
`"Nombre Afiliado"` calza con `'nombre afiliado'` aunque arriba tenga otros rótulos.

Si un campo canónico nuevo debe escribirse en el Excel, agregarlo a `CAMPOS` en `lib/campos.js`
con su `agg` (`suma`, `max`, `primero`, `minFecha`, `maxFecha`, `nombreLargo`) y la columna
destino del layout.

## Verificación

`npm run verify` no comprueba que el código compile: comprueba el **resultado**. Lee el ZIP real
y exige que la suma de lo extraído sea idéntica a **cada total que el propio comprobante
declara** en su portada, y que los RUT únicos coincidan con el "N° de Afiliados Informados".
Después genera el `.xlsx`, lo vuelve a abrir y verifica lo que quedó adentro.

`npm run verify:browser` hace lo mismo en Chrome de verdad, sobre `dist/` servido bajo el mismo
subpath de GitHub Pages: carga la página, sube el ZIP, espera el resultado, descarga el Excel, lo
revisa, comprueba que no haya errores ni recursos 404 y deja `captura-light.png` y
`captura-dark.png` para mirarlas.

Ambos salen con código 0 avisando si no existe `INSUMO/` (está en `.gitignore`) o si no hay
Chrome instalado.

`npm run verify:banner` es un arnés **aparte**, y aparte por un motivo concreto: los otros dos
exigen `INSUMO/` antes que nada, así que en cualquier máquina sin esa carpeta —incluido el
runner de CI— salen con 0 sin llegar a tomar una sola captura. El banner no necesita datos
reales, o sea que éste sí corre siempre, y por eso es el único de los tres que está en
`deploy.yml`.

Lo que comprueba, sobre `dist/` servido bajo el subpath de Pages:

| Qué | Cómo |
| --- | --- |
| El asset llegó al artefacto | `dist/assets/banner-conaf-uia-<hash>.jpg` existe, sus bytes son idénticos al fuente y algún chunk lo referencia |
| El alto pintado | `max(ancho / 17.1299, 68)` ±1 px a 1920, 1366, 1165, 768 y 390, en tema claro y oscuro |
| El filete de identidad | barrido de la fila `y=2` buscando los RGB del azul y del rojo, y dónde empieza |
| Los bordes | sin línea clara de 1 px arriba ni abajo |
| Sin la imagen | se bloquea la petición: tiene que verse `#064928`, no blanco, y la caja conservar su alto |
| Con scroll | el banner no quedó fijo |
| El favicon | `favicon.png` y `apple-touch-icon.png` en `dist/`, referenciados con la base resuelta |

**Mide sobre el PNG capturado, no consultando el DOM**: comprueba lo que se pintó, no lo que el
CSS declaró. Para decodificar los PNG sin agregar dependencias, los carga como `data:` URI en una
pestaña en blanco y los vuelca a un `<canvas>`. Además deja `captura-banner-390-marca-x4.png`,
la zona de la marca ampliada ×4 por vecino más cercano: eso **hay que mirarlo**, porque la
legibilidad del logotipo a 390 px no se deduce de ningún número.
