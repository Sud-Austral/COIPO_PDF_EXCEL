import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import './App.css'
import Banner from './components/Banner.jsx'
import DropZone from './components/DropZone.jsx'
import Progreso from './components/Progreso.jsx'
import TablaDocumentos from './components/TablaDocumentos.jsx'
import Control from './components/Control.jsx'
import Avisos from './components/Avisos.jsx'

const INICIAL = { fase: 'inicio', progreso: null, resultado: null, error: null, nombreZip: '' }

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

  const problemas = useMemo(
    () => (estado.resultado?.control ?? []).filter((c) => !c.ok).length,
    [estado.resultado],
  )

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
                <a className="boton primario" href={estado.resultado.url} download={estado.resultado.archivo}>
                  Descargar Excel
                </a>
                <button type="button" className="boton" onClick={reiniciar}>
                  Procesar otro ZIP
                </button>
              </div>
              <p className="nota">
                {estado.resultado.archivo} · {(estado.resultado.tamano / 1024 / 1024).toFixed(1)} MB ·
                {problemas === 0
                  ? ' todos los totales del comprobante cuadran'
                  : ` ${problemas} total(es) no cuadran, revisa la hoja Resumen`}
              </p>
            </section>

            <TablaDocumentos documentos={estado.resultado.documentos} />
            <Control control={estado.resultado.control} />
            <Avisos avisos={estado.resultado.avisos} />
          </>
        )}

        <footer>
          <p>
            El Excel trae tres hojas: <strong>TXT CONSOLIDADO</strong> con las 108 columnas,{' '}
            <strong>Resumen</strong> con los totales de control de cada comprobante y{' '}
            <strong>Revisar</strong> con todo lo que quedó dudoso.
          </p>
        </footer>
      </div>
    </>
  )
}
