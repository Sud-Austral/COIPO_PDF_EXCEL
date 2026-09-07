# Solucion, leida del codigo

El codigo es la solucion. Se describen capacidades con la cita del lugar donde
estan implementadas.

## Que hace el sistema

Permite entregar un archivo comprimido con comprobantes y obtener a cambio una
planilla consolidada. En el camino descomprime el archivo y descarta lo que no
sirve [frontend/src/lib/unzip.js], recorre las paginas de cada documento
[frontend/src/lib/pdfPages.js], detecta a que institucion corresponde cada uno
segun reglas por perfil [frontend/src/lib/perfiles.js], reconstruye la tabla a
partir del rayado del documento [frontend/src/lib/pdfRules.js],
[frontend/src/lib/tableExtract.js], interpreta los textos, numeros y fechas
[frontend/src/lib/text.js], lee la portada donde el comprobante declara sus
totales [frontend/src/lib/portada.js], agrupa por identificador tributario
[frontend/src/lib/consolidate.js], [frontend/src/lib/rut.js] y arma el libro de
salida [frontend/src/lib/buildWorkbook.js]. Todo el recorrido esta encadenado
en un unico flujo [frontend/src/lib/pipeline.js]. [INFERIDO]

En pantalla permite arrastrar el archivo [frontend/src/components/DropZone.jsx],
seguir el avance [frontend/src/components/Progreso.jsx], revisar el listado de
documentos detectados [frontend/src/components/TablaDocumentos.jsx], ver los
avisos de lo que no cuadro [frontend/src/components/Avisos.jsx] y accionar la
descarga [frontend/src/components/Control.jsx]. [INFERIDO]

## Roles: quien ve que

- No hay roles en el codigo, y la razon es estructural: el unico manifiesto
  detectado es el de la interfaz [frontend/package.json] y la unica variable de
  entorno detectada es de construccion [frontend/vite.config.js:8]. No hay
  servicio, no hay base de datos y no hay sesion donde apoyar un rol.
  [INFERIDO]
- El texto del proyecto afirma que el procesamiento ocurre integramente en el
  navegador y que no se sube ningun archivo [README.md]. Eso es coherente con
  que el trabajo pesado corra en un hilo del propio navegador
  [frontend/src/worker/pipeline.worker.js] y con que se publique como sitio
  estatico [.github/workflows/deploy.yml]. Confirmar que ninguna copia sale del
  equipo excede lo que muestra la evidencia: [VERIFICAR]
- Quien puede abrir el sitio: [PENDIENTE]

## De donde salen los datos

- La fuente es el archivo que la persona entrega en pantalla
  [frontend/src/components/DropZone.jsx], [frontend/src/lib/unzip.js]. Quien es
  dueno de esos comprobantes y de donde los obtiene: [PENDIENTE] [INFERIDO]
- La forma de la planilla de salida no la decide el sistema: esta fijada en una
  disposicion de columnas escrita como constante
  [frontend/src/lib/previredLayout.js] y en un catalogo de campos
  [frontend/src/lib/campos.js]. Quien es dueno de ese formato y quien avisa
  cuando cambia: [PENDIENTE] [INFERIDO]
- Hay documentacion de referencia sobre los comprobantes guardada en el
  repositorio [docs/comprobantes-previred.pdf],
  [docs/comprobantes-previred.html]. Quien la produjo: [PENDIENTE]
- Hay datos congelados que sirven de referencia fija para las comprobaciones
  [frontend/fixtures/congelado.json], [frontend/fixtures/planvital.zip.json],
  y una version posterior de uno de ellos
  [frontend/fixtures/planvital.zip.json.nuevo]. [INFERIDO]

## Reglas que el sistema impone por si mismo

- Un documento solo se da por verificado si la comparacion entre lo declarado
  en su portada y lo sumado a partir de lo leido se pudo hacer y cuadro; un
  documento sin ninguna comparacion queda marcado como no verificado
  [frontend/src/lib/verificacion.js], [frontend/src/lib/portada.js],
  [README.md]. [INFERIDO]
- La planilla se genera igual cuando algo no esta verificado, y el estado
  queda escrito en la salida [frontend/src/lib/buildWorkbook.js],
  [README.md]. [INFERIDO]
- Las columnas se deciden por geometria del documento, con tolerancias y
  minimos explicitos [frontend/src/lib/pdfRules.js],
  [frontend/src/lib/tableExtract.js]. Con que criterio se fijaron esas
  tolerancias: [PENDIENTE]
- Los identificadores tributarios se reconocen por patron
  [frontend/src/lib/rut.js] y los invalidos se derivan a la hoja de revision
  [frontend/src/lib/buildWorkbook.js], [README.md]. [INFERIDO]
- Hay perfiles distintos por institucion, con sus reglas propias
  [frontend/src/lib/perfiles.js]. Cuantas instituciones estan cubiertas y
  cuales faltan: [PENDIENTE]

## Que NO hace

Solo ausencias que el analizador enumero de forma exhaustiva.

- No hay servicio propio: el unico manifiesto detectado es el de la interfaz
  [frontend/package.json], y no se detecto ningun endpoint ni ninguna tabla en
  todo el repositorio. [INFERIDO]
- No hay ninguna variable de entorno de conexion ni de credencial: la unica
  detectada gobierna la ruta base de la construccion
  [frontend/vite.config.js:8]. [INFERIDO]
- No hay ningun almacenamiento propio de lo procesado que el analizador haya
  detectado; el resultado sale como archivo descargado
  [frontend/src/lib/buildWorkbook.js]. Que no quede rastro en el equipo excede
  lo comprobable desde aca: [VERIFICAR]

## Iteraciones

- El proyecto conserva su propio aparato de comprobacion, que crecio en
  capas: una comprobacion sobre archivos [frontend/scripts/verify.mjs], otra
  que abre un navegador de verdad [frontend/scripts/verify-browser.mjs], una
  del banner [frontend/scripts/verify-banner.mjs] y un generador de informe con
  su plantilla [frontend/scripts/generar-informe.mjs],
  [frontend/scripts/plantilla-informe.mjs]. [INFERIDO]
- Hay pruebas separadas por lo que verifican: deteccion de institucion
  [frontend/test/deteccion.test.mjs], reconstruccion de una tabla
  [frontend/test/tabla.test.mjs], de varias [frontend/test/tablas.test.mjs] y
  lectura de texto [frontend/test/texto.test.mjs]. [INFERIDO]
- Hay una version anterior de un dato congelado conservada junto a la actual
  [frontend/fixtures/planvital.zip.json],
  [frontend/fixtures/planvital.zip.json.nuevo], lo que sugiere un cambio de
  contrato en curso. [INFERIDO]
- Hay capturas de pantalla en dos temas y en varios anchos guardadas en el
  repositorio [frontend/captura-dark.png], [frontend/captura-light.png],
  [INSUMO_GRAFICO/verificacion/captura-banner-390-light.png], usadas como
  evidencia de la verificacion grafica
  [INSUMO_GRAFICO/implementacion_banner.md]. [INFERIDO]

## Donde el analizador no ve

- El analizador no extrajo el contenido de ningun archivo, de modo que no se
  pudo comprobar que instituciones cubre efectivamente el catalogo de perfiles
  [frontend/src/lib/perfiles.js] ni que columnas define la disposicion de
  salida [frontend/src/lib/previredLayout.js].
- La interfaz no declara rutas de navegacion: es una sola pantalla
  [frontend/src/App.jsx]. Si eso es asi por diseno o por alcance:
  [PENDIENTE]
- No se leyo el documento de referencia sobre los comprobantes
  [docs/comprobantes-previred.html]: lo que ahi este descrito no esta recogido
  aca.
