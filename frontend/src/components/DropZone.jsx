import { useCallback, useRef, useState } from 'react'

export default function DropZone({ onArchivo }) {
  const [encima, setEncima] = useState(false)
  const [rechazo, setRechazo] = useState('')
  const inputRef = useRef(null)

  const aceptar = useCallback(
    (archivo) => {
      if (!archivo) return
      if (!/\.zip$/i.test(archivo.name)) {
        setRechazo(`"${archivo.name}" no es un archivo .zip`)
        return
      }
      setRechazo('')
      onArchivo(archivo)
    },
    [onArchivo],
  )

  return (
    <section
      className={`dropzone${encima ? ' encima' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setEncima(true)
      }}
      onDragLeave={() => setEncima(false)}
      onDrop={(e) => {
        e.preventDefault()
        setEncima(false)
        aceptar(e.dataTransfer.files?.[0])
      }}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="icono">
        <path
          d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <p className="titulo">Arrastra aquí el ZIP con los comprobantes</p>
      <p className="sub">o</p>
      <button type="button" className="boton primario" onClick={() => inputRef.current?.click()}>
        Elegir archivo .zip
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".zip,application/zip"
        hidden
        onChange={(e) => {
          aceptar(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      {rechazo && <p className="rechazo">{rechazo}</p>}
      <p className="ayuda">
        El ZIP puede traer varios PDF de distintas instituciones (AFP, Fonasa, Isapre, caja de
        compensación, mutual, AFC). Se consolidan todos en la misma planilla.
      </p>
    </section>
  )
}
