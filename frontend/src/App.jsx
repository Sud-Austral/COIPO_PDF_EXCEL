import { useCallback, useEffect, useRef, useState } from 'react'

import './App.css'
import Banner from './components/Banner.jsx'
import DropZone from './components/DropZone.jsx'
import Progreso from './components/Progreso.jsx'
import TablaDocumentos from './components/TablaDocumentos.jsx'
import Control from './components/Control.jsx'
import Avisos from './components/Avisos.jsx'

const INICIAL = { fase: 'inicio', progreso: null, resultado: null, error: null, nombreZip: '' }

/** Cuántos documentos quedaron verificados, y con cuántas comparaciones. */
function resumenVerificacion({ documentos, control }) {
  const utiles = (documentos ?? []).filter((d) => !d.duplicadoDe)
  const ok = utiles.filter((d) => d.estado === 'verificado').length
  if (ok === utiles.length) {
    return `${utiles.length} documento(s) verificado(s) contra ${control.length} totales de su propia portada`
  }
  return `${ok} de ${utiles.length} documento(s) verificado(s) — revisa el detalle`
}

export default function App() {
  const [estado, setEstado] = useState(INICIAL)
  const workerRef = useRef(null)
  const urlRef = useRef(null)

  useEffect(
    () => () => {
      workerRef.current?.terminate()
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    },
    [],
  )

  const procesar = useCallback(async (archivo) => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current)
      urlRef.current = null
    }
    workerRef.current?.terminate()

    setEstado({ fase: 'procesando', progreso: { fase: 'descomprimiendo' }, resultado: null, error: null, nombreZip: archivo.name })

    const worker = new Worker(new URL('./worker/pipeline.worker.js', import.meta.url), { type: 'module' })
    workerRef.current = worker

    // Sólo se atienden los mensajes propios: pdf.js también puede emitir mensajes
    // desde dentro del worker y no deben confundirse con el resultado.
    worker.onmessage = ({ data }) => {
      if (data?.tipo === 'progreso') {
        setEstado((e) => ({ ...e, progreso: data }))
        return
      }
      if (data?.tipo === 'error') {
        setEstado((e) => ({ ...e, fase: 'error', error: data.mensaje, progreso: null }))
        worker.terminate()
        return
      }
      if (data?.tipo !== 'listo') return

      const blob = new Blob([data.xlsx], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      urlRef.current = URL.createObjectURL(blob)
      setEstado((e) => ({
        ...e,
        fase: 'listo',
        progreso: null,
        resultado: { ...data, url: urlRef.current, tamano: blob.size },
      }))
      worker.terminate()
    }
    worker.onerror = (err) => {
      setEstado((e) => ({ ...e, fase: 'error', error: err.message || 'Falló el procesamiento', progreso: null }))
    }

    const buffer = await archivo.arrayBuffer()
    worker.postMessage({ zip: buffer }, [buffer])
  }, [])

  const reiniciar = useCallback(() => {
    workerRef.current?.terminate()
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    urlRef.current = null
    setEstado(INICIAL)
  }, [])

  // OJO: el estado NO puede volver a ser "cuántos controles fallan". Un documento sin
  // ningún control da cero fallos, y así fue como la pantalla dijo "todos los totales
  // cuadran" mientras un comprobante entero estaba mal clasificado.
  const verificado = estado.resultado?.estado === 'verificado'

  return (
    <>
      <Banner />

      <div className="app">
        <div className="intro">
          <h1>Consolidador Previred</h1>
          <p className="bajada">
            Convierte el ZIP con los comprobantes de pago de cotizaciones en una sola planilla Excel
            con el layout de 108 columnas, una fila por trabajador.
          </p>
          <p className="privacidad">
            Todo el procesamiento ocurre en tu navegador. Ningún archivo se sube a ningún servidor ni queda guardado.
          </p>
        </div>

        {estado.fase === 'inicio' && <DropZone onArchivo={procesar} />}

        {estado.fase === 'procesando' && <Progreso progreso={estado.progreso} nombreZip={estado.nombreZip} />}

        {estado.fase === 'error' && (
          <section className="tarjeta error">
            <h2>No se pudo procesar el archivo</h2>
            <p>{estado.error}</p>
            <button type="button" className="boton" onClick={reiniciar}>
              Intentar con otro ZIP
            </button>
          </section>
        )}

        {estado.fase === 'listo' && estado.resultado && (
          <>
            <section className="tarjeta resultado">
              <div className="cifra">
                <strong>{estado.resultado.trabajadores.toLocaleString('es-CL')}</strong>
                <span>trabajadores consolidados</span>
              </div>
              <div className="acciones">
                <a
                  className={`boton ${verificado ? 'primario' : ''}`}
                  href={estado.resultado.url}
                  download={estado.resultado.archivo}
                >
                  Descargar Excel
                </a>
                <button type="button" className="boton" onClick={reiniciar}>
                  Procesar otro ZIP
                </button>
              </div>
              <p className="nota">
                {estado.resultado.archivo} · {(estado.resultado.tamano / 1024 / 1024).toFixed(1)} MB ·{' '}
                {resumenVerificacion(estado.resultado)}
              </p>
            </section>

            {!verificado && (
              <section className="tarjeta error">
                <h2>Esta planilla NO está verificada</h2>
                <ul className="motivos">
                  {estado.resultado.documentos
                    .filter((d) => d.estado && d.estado !== 'verificado')
                    .map((d) => (
                      <li key={d.archivo}>
                        <strong>{d.archivo}</strong> — {d.institucion} — {d.estado.toUpperCase()}
                        <ul>
                          {d.motivos.map((m, i) => (
                            <li key={i}>{m}</li>
                          ))}
                        </ul>
                      </li>
                    ))}
                </ul>
                <p className="nota">
                  El archivo se generó igual y se puede descargar, pero conviene revisar la hoja{' '}
                  <strong>Revisar</strong> antes de usarlo.
                </p>
              </section>
            )}

            <TablaDocumentos documentos={estado.resultado.documentos} />
            <Control control={estado.resultado.control} documentos={estado.resultado.documentos} />
            <Avisos avisos={estado.resultado.avisos} />
          </>
        )}

        <footer>
          <p>
            El Excel trae cuatro hojas: <strong>TXT CONSOLIDADO</strong> con las 108 columnas,{' '}
            <strong>Resumen</strong> con el estado de cada comprobante y sus totales de control,{' '}
            <strong>Columnas</strong> con qué encabezado del PDF alimentó cada campo, y{' '}
            <strong>Revisar</strong> con todo lo que quedó dudoso.
          </p>
        </footer>
      </div>
    </>
  )
}
