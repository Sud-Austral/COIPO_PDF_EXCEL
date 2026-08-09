# frontend — Consolidador Previred

React + Vite. Aplicación 100 % cliente: no hay backend, no se sube ningún archivo y no se
guarda nada. Ver el [README de la raíz](../README.md) para el uso y las limitaciones conocidas.

## Comandos

```bash
npm ci
npm run dev              # servidor de desarrollo
npm run build            # genera dist/
npm run lint             # oxlint
npm run test             # tests puros (sin PDF): tablas, detección, geometría
npm run verify           # arnés de datos, en Node, sobre todos los INSUMO/*.zip
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
| `lib/pdfRules.js` | El **rayado** de la tabla: los rectángulos que el PDF dibuja para cada celda. |
| `lib/tableExtract.js` | Encuentra la tabla y deduce las columnas, del rayado o (si no hay) del texto. |
| `lib/verificacion.js` | Los tres estados de un documento y los avisos de todo lo que se descartó. |
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
- **La tabla viene DIBUJADA, no sólo escrita.** Cada celda es un rectángulo en la lista de
  operadores de la página (791 en una página de AFP, 880 en una de CCAF). De ahí salen los
  bordes exactos de cada columna y de cada encabezado de agrupación: una celda de grupo que
  contiene a la de una columna es su ancestro, sin ambigüedad. Ojo con dos cosas al leerlos:
  el bbox está en `argsArray[i][2]` de `constructPath`, y `Util.applyTransform` **muta el punto
  y devuelve `undefined`** en pdf.js v6.
- **Por qué importa.** Un comprobante de AFP trae DOS columnas "Remuneración Imponible" —la del
  fondo de pensiones y la del seguro de cesantía— y sólo el encabezado de agrupación las
  distingue. Deduciendo los grupos del texto no se puede: sus rótulos van centrados y cubren
  cantidades de columnas distintas, así que el punto medio entre dos rótulos cae dentro del
  grupo equivocado por tres puntos. Con eso, las dos columnas quedaban con la misma clave y sus
  montos se sumaban en silencio.
- **El método por texto sigue ahí** como respaldo para páginas sin rayado (`camino: 'heuristico'`),
  con sus límites conocidos: reparte los grupos por punto medio y asigna cada celda a la columna
  *más cercana*, no a la que la contiene.
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

### La regla de fondo: cero comparaciones también es un fallo

Un comprobante entero de AFP se clasificó como AFC durante meses. No generó **ninguna**
comparación contra su portada, y como la pantalla contaba *totales fallidos* —cero de cero— decía
«todos los totales del comprobante cuadran» mientras `impo_afp` salía en 0 para los 3.610
trabajadores. De ahí los **tres estados** de `lib/verificacion.js`:

| Estado | Qué significa |
| --- | --- |
| ✔ verificado | se comprobó contra su propia portada y todo calzó |
| ⚠ sin verificar | **no hay con qué comprobarlo**, o quedó algo sin cotejar |
| ✘ no cuadra | se comprobó y no calza |

`verificado` exige todas estas: institución detectada con margen suficiente; **al menos una**
comparación; todas ✔; todo campo con monto respaldado por algún total (o declarado en
`sinRespaldo` del perfil, con su motivo); y ninguna página sin leer ni sin sección.

### Los arneses

`npm run test` corre sin PDF, así que es lo que verifica en CI: coherencia entre las tablas de
configuración (todo campo apunta a una columna que existe, todo rótulo a un campo que existe),
detección de institución sobre portadas transcritas, y extracción de tablas sobre páginas
sintéticas —incluido el caso de las dos columnas homónimas—.

`npm run verify` comprueba el **resultado** sobre los datos reales. Recorre todos los
`INSUMO/*.zip` y exige que la suma de lo extraído sea idéntica a **cada total que el propio
comprobante declara** en su portada, que ningún documento quede sin verificar, y que nada se haya
movido respecto de `fixtures/`. Después genera el `.xlsx`, lo vuelve a abrir y revisa lo que quedó
adentro. **Sale con código 1 si algo falla**; con `PERMITIR_SIN_INSUMO=1` tolera la ausencia de
datos (lo que usa CI), pero entonces no verifica nada y lo dice.

### Los fixtures

`fixtures/<zip>.json` guarda agregados y estructura —sumas por columna, filas de control,
cobertura, qué clave calzó con qué campo—. **Ningún dato de fila**: ni RUT, ni nombres, ni montos
individuales. Se regenera a propósito con `npm run verify -- --actualizar`.

`fixtures/congelado.json` es distinto: son las invariantes del comprobante de Caja Los Andes, el
único perfil que estaba validado contra datos reales antes de esta reescritura. **No lo toca
ningún flag.** Se escribió antes de cambiar una línea de `src/lib/` y sirvió para reescribir la
detección, el mapeo y la geometría entera comprobando que las 20 sumas por campo, los 9 totales de
control y las 4.584 líneas del CCAF no se movieran ni un peso. Si una de esas cambia, o
encontraste un bug real o rompiste algo: averigua cuál de las dos antes de actualizarla.

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
