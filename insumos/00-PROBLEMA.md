# Problema, reconstruido desde el codigo

Nadie del area usuaria participo en este documento. Se deduce el problema
desde lo construido, y cada paso va marcado. Este repositorio es de los pocos
en que el propio texto del proyecto describe el problema
[README.md]; aun asi, lo que dice ese texto es una afirmacion del proyecto
sobre si mismo, no una confirmacion del area.

## Que se deduce que estaba roto

- El sistema toma un conjunto comprimido de comprobantes en formato de
  documento portatil, los descomprime [frontend/src/lib/unzip.js], lee cada
  uno [frontend/src/lib/parseDocumento.js], reconoce a que institucion
  corresponde [frontend/src/lib/perfiles.js] y produce una unica planilla
  consolidada [frontend/src/lib/buildWorkbook.js]. Luego probablemente habia un
  problema con transcribir a mano esos comprobantes a una planilla. [INFERIDO]
- La planilla de salida sigue una disposicion de columnas fija y numerada
  [frontend/src/lib/previredLayout.js], y consolida por identificador
  tributario [frontend/src/lib/consolidate.js], [frontend/src/lib/rut.js].
  Luego probablemente el destino de ese trabajo era un formato de archivo
  exigido por un tercero y no una planilla libre. [INFERIDO]
- Existe un modulo entero dedicado a comprobar que lo leido cuadra con los
  totales que el propio comprobante declara
  [frontend/src/lib/verificacion.js], y el texto del proyecto relata un caso en
  que una columna quedo en cero sin que nadie lo notara [README.md]. Luego
  probablemente el problema no era solo el tiempo de transcribir, sino los
  errores silenciosos al hacerlo. [INFERIDO]
- Las columnas no vienen rotuladas de forma estable: se deducen del rayado del
  propio documento [frontend/src/lib/pdfRules.js],
  [frontend/src/lib/tableExtract.js]. Luego probablemente cada institucion
  entrega su comprobante con una forma distinta. [INFERIDO]
- El problema de negocio concreto, con su costo y su plazo: [PENDIENTE]

## Quien sufre el problema

- El codigo no impone ningun rol. La enumeracion completa de variables de
  entorno detectadas tiene una sola entrada, y es de construccion
  [frontend/vite.config.js:8]; el unico manifiesto detectado es el de la
  interfaz [frontend/package.json]. Es decir, no hay control de acceso porque
  no hay servicio donde ponerlo. [INFERIDO]
- El texto del proyecto nombra un area destinataria [README.md]. Que esa area
  sea efectivamente la usuaria, y quien la representa: [PENDIENTE]
- Cuantas personas hacen hoy este trabajo: [PENDIENTE]
- Quien recibe la planilla resultante despues: [PENDIENTE]

## Como lo resolvian antes

- La entrada del sistema es un archivo comprimido de comprobantes
  [frontend/src/lib/unzip.js], [frontend/src/components/DropZone.jsx], y la
  salida es una planilla [frontend/src/lib/buildWorkbook.js] cuya disposicion
  replica un formato preexistente [frontend/src/lib/previredLayout.js]. Que la
  salida imite un formato que ya existia sugiere que esa planilla se llenaba
  antes a mano a partir de los mismos comprobantes. [INFERIDO]
- Hay una hoja de salida dedicada a lo dudoso —documentos sin verificar,
  columnas sin mapear, filas descartadas— [frontend/src/lib/buildWorkbook.js],
  [README.md]. Que se haya construido esa hoja sugiere que la revision manual
  no desaparece, solo se acota. [INFERIDO]
- Quien mantenia la planilla, cuanto tardaba y con que periodicidad:
  [PENDIENTE]

## Volumen

- Indicios, no cifras. El procesamiento se saca a un hilo aparte del navegador
  [frontend/src/worker/pipeline.worker.js] y hay una pantalla de avance
  [frontend/src/components/Progreso.jsx]. Que alguien haya escrito un hilo
  aparte y una barra de avance sugiere que una tanda tarda lo suficiente como
  para bloquear la pantalla. Es un orden de magnitud, no una cifra. [INFERIDO]
- Hay topes explicitos en el listado de avisos [frontend/src/components/Avisos.jsx]
  y en la busqueda de encabezados [frontend/src/lib/tableExtract.js]. Son
  decisiones de diseno, no medidas de carga. [INFERIDO]
- Cuantos comprobantes trae un periodo tipico y cuantos trabajadores agrupa:
  [PENDIENTE]

## Que pasa si no se hace nada

[PENDIENTE], sin excepcion. El codigo no lo responde y no se deduce de que el
sistema exista.

## Quien decide que esta terminado

[PENDIENTE], sin excepcion. Hay comandos de comprobacion automatica
[frontend/scripts/verify.mjs], [frontend/scripts/verify-browser.mjs] y un
generador de informe [frontend/scripts/generar-informe.mjs], pero ninguno
nombra a la persona o la instancia que acepta el trabajo. [INFERIDO]

## Datos personales: aca esta el punto mas delicado

- El sistema trata explicitamente el identificador tributario nacional: hay un
  modulo dedicado a reconocerlo [frontend/src/lib/rut.js], indices reservados
  para el en la disposicion de columnas
  [frontend/src/lib/previredLayout.js] y la consolidacion se hace agrupando por
  el [frontend/src/lib/consolidate.js]. [VERIFICAR] que el tratamiento de ese
  identificador y de los datos de remuneracion asociados sea el que
  corresponde; no lo cierra este documento.
- El repositorio contiene comprobantes de una institucion concreta
  [INSUMO/planvital/planvital.pdf], [INSUMO/planvital/CtrlPdf.pdf], el archivo
  comprimido del que salieron [INSUMO/planvital.zip], y dos planillas
  consolidadas de un periodo fechado
  [frontend/consolidado-previred-072026.xlsx],
  [frontend/.verify-browser/consolidado-previred-072026.xlsx]. Ninguno de esos
  archivos vive en tests/ ni en fixtures/. [VERIFICAR] con urgencia si
  contienen datos de personas reales.
- Hay ademas datos de prueba congelados que si viven en una carpeta de
  fixtures [frontend/fixtures/congelado.json],
  [frontend/fixtures/planvital.zip.json], lo que aumenta la probabilidad de que
  sean de prueba, pero no los vuelve sinteticos. [VERIFICAR]
- La evidencia del repositorio lo marca como no privado. [VERIFICAR] si
  corresponde que este material sea de acceso publico.
