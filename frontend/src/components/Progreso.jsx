const TEXTO = {
  descomprimiendo: 'Descomprimiendo el ZIP…',
  leyendo: 'Leyendo los comprobantes…',
  consolidando: 'Consolidando por trabajador…',
  generando: 'Armando el Excel…',
}

export default function Progreso({ progreso, nombreZip }) {
  const fase = progreso?.fase ?? 'descomprimiendo'
  const { archivo, indice, total, pagina, paginas } = progreso ?? {}

  // Avance global: el archivo N va de (N-1)/total a N/total según sus páginas leídas.
  let porcentaje = null
  if (fase === 'leyendo' && total) {
    const dentro = paginas ? pagina / paginas : 0
    porcentaje = Math.min(99, Math.round(((indice - 1 + dentro) / total) * 100))
  } else if (fase === 'consolidando' || fase === 'generando') {
    porcentaje = 99
  }

  return (
    <section className="tarjeta progreso" aria-live="polite">
      <h2>{TEXTO[fase] ?? 'Procesando…'}</h2>
      <p className="nota">{nombreZip}</p>

      <div
        className="barra"
        role="progressbar"
        aria-valuenow={porcentaje ?? undefined}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={`relleno${porcentaje === null ? ' indeterminado' : ''}`} style={porcentaje === null ? undefined : { width: `${porcentaje}%` }} />
      </div>

      {fase === 'leyendo' && archivo && (
        <p className="detalle">
          Archivo {indice} de {total}: <strong>{archivo}</strong>
          {paginas ? ` · página ${pagina} de ${paginas}` : ''}
        </p>
      )}
    </section>
  )
}
