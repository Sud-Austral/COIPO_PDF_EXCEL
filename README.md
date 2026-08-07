# COIPO_PDF_EXCEL — Consolidador Previred

Herramienta web para el área de personal: se le entrega el **ZIP con los comprobantes PDF de
pago de cotizaciones** de un período y devuelve **una planilla Excel consolidada**, con el layout
de archivo plano de Previred (108 columnas) y **una fila por trabajador**.

**Todo el procesamiento ocurre en el navegador.** No hay servidor, no se sube ningún archivo y
no queda nada guardado: es una página estática que se publica en GitHub Pages.

```
ZIP ──► descomprimir ──► leer cada PDF ──► identificar la institución
                                              │
    Excel ◄── 3 hojas ◄── consolidar por RUT ◄┘
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
| **Resumen** | Un renglón por PDF (institución, folio, período, empleador, páginas, líneas) y la comparación de **cada total que declara el comprobante contra la suma de lo extraído**, con ✔ / ✘. |
| **Revisar** | Todo lo dudoso: PDF duplicados, instituciones no reconocidas, columnas del PDF que no se pudieron mapear, RUT con dígito verificador inválido y nombres incompletos. |

## Estado de los perfiles por institución

El parser deduce las columnas del encabezado del propio PDF, así que no depende de coordenadas
fijas. Sobre eso hay un perfil por institución que traduce cada rótulo a la columna Previred.

| Institución | Estado |
| --- | --- |
| Caja de compensación (CCAF) | **Validado** contra un comprobante real de Caja Los Andes, 07/2026, 94 páginas. Reproduce exactos los nueve totales de control del documento. |
| AFP · Fonasa/IPS · Isapre · Mutual · AFC | **Sin validar.** Escritos con la nomenclatura estándar de Previred, pero falta una muestra real de cada uno. Cualquier columna que no calce aparece listada en la hoja *Revisar*; nunca se descarta en silencio. |

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
npm run verify           # arnés sobre INSUMO/ (lógica, en Node)
npm run verify:browser   # arnés en Chrome real sobre dist/ (requiere npm run build)
```

`INSUMO/` está en `.gitignore`: contiene datos reales de personas y nunca debe subirse. Los dos
arneses avisan y salen con código 0 si la carpeta no existe.

Ver [`frontend/README.md`](frontend/README.md) para el detalle de la arquitectura.

## Despliegue

`.github/workflows/deploy.yml` compila y publica en cada push a `main`. Para dejarlo andando:

1. Crear el repositorio en GitHub y agregar el remoto.
2. **Settings → Pages → Source: GitHub Actions**.
3. Push a `main`.

El `base` de Vite se toma del nombre del repositorio (`VITE_BASE` en el workflow), así que si el
repo cambia de nombre no hay que tocar nada.
