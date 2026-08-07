const numero = (n) => Number(n ?? 0).toLocaleString('es-CL')

function estadoDe(d) {
  if (d.error) return { texto: `Error: ${d.error}`, clase: 'mal' }
  if (d.duplicadoDe) return { texto: `Duplicado de ${d.duplicadoDe}`, clase: 'ojo' }
  if (!d.reconocido) return { texto: 'Institución no reconocida', clase: 'mal' }
  return { texto: 'Procesado', clase: 'bien' }
}

export default function TablaDocumentos({ documentos }) {
  if (!documentos?.length) return null
  return (
    <section className="tarjeta">
      <h2>PDF encontrados en el ZIP</h2>
      <div className="tabla-scroll">
        <table>
          <thead>
            <tr>
              <th>Archivo</th>
              <th>Institución</th>
              <th>Folio</th>
              <th>Período</th>
              <th className="num">Págs.</th>
              <th className="num">Líneas</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {documentos.map((d) => {
              const estado = estadoDe(d)
              return (
                <tr key={d.archivo}>
                  <td className="mono">{d.archivo}</td>
                  <td>{d.institucion}</td>
                  <td className="mono">{d.folio}</td>
                  <td>{d.periodo}</td>
                  <td className="num">{numero(d.paginas)}</td>
                  <td className="num">{numero(d.lineas)}</td>
                  <td className={`estado ${estado.clase}`}>{estado.texto}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
