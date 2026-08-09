# COIPO_PDF_EXCEL — Consolidador Previred

Herramienta web para el área de personal: se le entrega el **ZIP con los comprobantes PDF de
pago de cotizaciones** de un período y devuelve **una planilla Excel consolidada**, con el layout
de archivo plano de Previred (108 columnas) y **una fila por trabajador**.

**Todo el procesamiento ocurre en el navegador.** No hay servidor, no se sube ningún archivo y
no queda nada guardado: es una página estática que se publica en GitHub Pages.

```
ZIP ──► descomprimir ──► leer cada PDF ──► identificar la institución
                                              │
    Excel ◄── 4 hojas ◄── consolidar por RUT ◄┘
```

## Uso

1. Abrir el sitio.
2. Arrastrar el `.zip` (o elegirlo con el botón).
3. Revisar en pantalla los PDF detectados y los totales de control.
4. Descargar el `.xlsx`.

## Qué trae el Excel

| Hoja | Contenido |
| --- | --- |
| **TXT CONSOLIDADO** | Las 108 columnas en el orden de la planilla actual (`rut`, caja, `Linea`, `rut`, `dv`, `ape_pat` … `centro_costo`), una fila por RUT, con filtro y fila de encabezado fija. |
| **Resumen** | Un renglón por PDF con su **estado de verificación** y, si no está verificado, por qué; más la comparación de **cada total que declara el comprobante contra la suma de lo extraído**, con ✔ / ✘. |
| **Columnas** | Una fila por columna detectada en cada PDF: el encabezado que se leyó, la clave con que calzó y el campo al que fue a parar. Sirve para ver de un vistazo si algo se mapeó al lugar equivocado. |
| **Revisar** | Todo lo dudoso: documentos sin verificar, columnas sin mapear, celdas fuera de su columna, filas descartadas, totales de la portada sin cotejar, RUT inválidos y nombres incompletos. |

## Verificación: qué significa que la planilla esté bien

Cada comprobante **declara sus propios totales** en la portada, y la herramienta los compara
contra la suma de lo que leyó. Un documento sólo se da por **verificado** si esa comparación se
pudo hacer y cuadró — no basta con que no falle nada:

> Un comprobante de AFP se clasificó como AFC y no produjo **ni una sola** comparación. Como la
> pantalla contaba totales *fallidos*, cero de cero daba «todos los totales cuadran», y la columna
> de remuneración imponible de la AFP salía en 0 para los 3.610 trabajadores sin que nadie lo
> notara. Hoy un documento sin ninguna comparación se marca **SIN VERIFICAR** en rojo.

El Excel se genera igual cuando algo no está verificado —el área puede necesitarlo— pero el estado
va escrito en pantalla y en la hoja *Resumen*.

## Estado de los perfiles por institución

Las columnas se deducen del **rayado del propio PDF**: estos comprobantes traen la tabla dibujada,
un rectángulo por celda, así que los bordes de cada columna y de cada encabezado de agrupación son
un dato leído del archivo y no una inferencia. Sobre eso hay un perfil por institución que traduce
cada rótulo a la columna Previred.

| Institución | Estado |
| --- | --- |
| Caja de compensación (CCAF) | **Validado** contra Caja Los Andes 07/2026, 94 páginas. Reproduce exactos los 13 totales de control del documento. |
| AFP | **Validado** contra AFP PlanVital 07/2026, 12 páginas. Reproduce exactos sus 15 totales, incluidos los dos imponibles (fondo de pensiones y seguro de cesantía) y el total a pagar. |
| Fonasa/IPS · Isapre · Mutual · AFC | **Sin validar.** Escritos con la nomenclatura estándar de Previred, pero falta una muestra real de cada uno. Cualquier columna que no calce aparece en la hoja *Revisar*; nunca se descarta en silencio. |

Para validarlos hace falta un ZIP real con la mezcla de instituciones. Agregar o corregir un
perfil es editar el diccionario de rótulos en [`frontend/src/lib/perfiles.js`](frontend/src/lib/perfiles.js).

## Limitaciones conocidas

Son propiedades de los datos de origen, no defectos del parser:

- **`cod_mov` no equivale al código Previred.** El PDF usa la codificación de la caja
  (1 Contrataciones, 2 Retiros, 3 Subsidios, 4 Permiso sin goce, 5 Remuneraciones…). En la
  muestra, el código `1` del PDF corresponde a los códigos Previred 7, 11, 3, 2, 5 y 4 según el
  caso: no hay forma de reconstruirlo. Se copia tal cual y se advierte en la hoja *Resumen*.
- **Los nombres pueden venir más cortos.** La institución informa su propia versión del nombre;
  en la muestra, 68 de 3.610 son más cortos que la ficha del empleador. Cuando el corte deja la
  última palabra en una preposición o artículo se emite un aviso.
- **Los montos son los del comprobante**, que puede diferir de lo declarado antes por el
  empleador. En la muestra, `impo_ccaf` difiere en 100 de 3.610 casos: son afiliados a isapre
  donde el empleador declaró 0 y la caja informa monto.
- **Columnas sin fuente en el ZIP quedan en 0 o vacías.** No se inventan valores.
- Un comprobante repetido dentro del mismo ZIP se procesa **una sola vez** (se identifica por
  folio), para no duplicar los montos.

## Desarrollo

```bash
cd frontend
npm ci
npm run dev              # http://localhost:5173
npm run build            # genera dist/
npm run test             # tests puros, sin PDF: es lo que verifica en CI
npm run verify           # arnés sobre todos los INSUMO/*.zip (lógica, en Node)
npm run verify:browser   # arnés en Chrome real sobre dist/ (requiere npm run build)
npm run verify:banner    # arnés del banner: mide píxeles sobre capturas de Chrome
```

`INSUMO/` está en `.gitignore`: contiene datos reales de personas y nunca debe subirse. `verify`
**sale con código 1** si no encuentra los ZIP, si algún documento queda sin verificar o si el
resultado se movió respecto de `frontend/fixtures/`; con `PERMITIR_SIN_INSUMO=1` tolera la
ausencia de datos y lo dice, que es como corre en CI. `test` y `verify:banner` no dependen de esos
datos, así que corren siempre.

Ver [`frontend/README.md`](frontend/README.md) para el detalle de la arquitectura.

## Identidad

La cabecera es el banner institucional CONAF · UIA, y el favicon es el isotipo recortado de ese
mismo archivo. Todo el material gráfico —el asset original, lo que se derivó de él, las medidas
verificadas píxel a píxel y las capturas de referencia— vive en
[`INSUMO_GRAFICO/`](INSUMO_GRAFICO/README.md). El verde institucional **no** reemplazó al azul de
la interfaz: convive con él, y el porqué está escrito en un comentario de
[`frontend/src/App.css`](frontend/src/App.css).

## Despliegue

`.github/workflows/deploy.yml` compila y publica en cada push a `main`. Para dejarlo andando:

1. Crear el repositorio en GitHub y agregar el remoto.
2. **Settings → Pages → Source: GitHub Actions**.
3. Push a `main`.

El `base` de Vite se toma del nombre del repositorio (`VITE_BASE` en el workflow), así que si el
repo cambia de nombre no hay que tocar nada.
