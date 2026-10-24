# CLAUDE.md — COIPO_PDF_EXCEL (Consolidador Previred)

Guía para agentes. Uso y limitaciones en `README.md`; arquitectura en `frontend/README.md`; problema y solución en
`insumos/00-PROBLEMA.md` y `insumos/01-SOLUCION.md`.

## Qué es
App web 100 % cliente (React 19 + Vite 8) que recibe un ZIP de comprobantes PDF de cotizaciones y entrega un Excel
consolidado con las 108 columnas del archivo plano de Previred, una fila por RUT. No hay backend ni se sube ningún archivo.
Se publica en GitHub Pages.

## Estructura
- `frontend/src/lib/`: pipeline (`unzip` → `pdfPages` → `pdfRules`/`tableExtract` → `perfiles` → `consolidate` → `buildWorkbook`).
- `frontend/src/worker/pipeline.worker.js`: todo el procesamiento corre en un Web Worker.
- `frontend/src/components/`, `App.jsx`: interfaz. `frontend/scripts/`: arneses de verificación, informe y favicon.
- `frontend/test/*.test.mjs`, `frontend/fixtures/`: pruebas puras y resultados congelados.
- `INSUMO_GRAFICO/`: material gráfico del banner CONAF · UIA. `docs/`: informe PDF para el área de personal.
- `.github/workflows/deploy.yml`: lint, test, verify (humo), build y despliegue a Pages en cada push a `main`.

## Comandos (desde `frontend/`, existen en `package.json`)
`npm ci`, `npm run dev`, `npm run build`, `npm run lint` (oxlint), `npm run test`, `npm run verify`,
`npm run verify:browser` (requiere build y Chrome), `npm run verify:banner`, `npm run favicon`, `npm run informe`.
No ejecuté estos comandos al escribir este documento.

## Convenciones
- Español en interfaz, comentarios y mensajes. JS con módulos ES, sin TypeScript.
- Un documento sólo es VERIFICADO si se pudo comparar contra los totales de su portada y cuadró; «cero comparaciones» es SIN VERIFICAR.
- Nunca se inventan valores: lo que no calza va a la hoja *Revisar*.
- Agregar o corregir una institución = editar el diccionario de `frontend/src/lib/perfiles.js`.

## Trampas
- Las páginas del PDF vienen rotadas 90°: usar `viewport.transform` antes de agrupar filas.
- El worker de pdf.js se crea explícitamente (`GlobalWorkerOptions.workerPort`); no dejar que pdf.js lo cree solo.
- `INSUMO/` está en `.gitignore` y contiene datos reales de personas: nunca subirlo ni copiar RUT o nombres a documentos.
- `npm run verify` sale con 1 si faltan los ZIP o si el resultado se movió respecto de `fixtures/`; en CI corre con `PERMITIR_SIN_INSUMO=1` (sólo humo).
- El `base` de Vite sale del nombre del repo (`VITE_BASE` en el workflow).
- Perfiles Fonasa/IPS, Isapre, Mutual y AFC siguen sin validar (README).
- `cod_mov` del PDF no equivale al código Previred.

## No tocar
`frontend/fixtures/` sin entender por qué cambió el resultado; `.github/workflows/deploy.yml` sin necesidad; nada de `INSUMO/`.
`.claude/settings.local.json` está versionado con permisos amplios (`Bash(*)`, `PowerShell(*)`): conviene que el equipo lo revise.
