const numero = (n) => Number(n ?? 0).toLocaleString('es-CL')

/**
 * "Procesado" no era un estado útil: un PDF entero mal clasificado, sin un solo total
 * comprobado, también estaba "procesado". Ahora se muestra si está VERIFICADO —es
 * decir, comprobado contra su propia portada— y si no, por qué no.
 */
function estadoDe(d) {
  if (d.error) return { texto: `Error: ${d.error}`, clase: 'mal' }
  if (d.duplicadoDe) return { texto: `Duplicado de ${d.duplicadoDe}`, clase: 'ojo' }
  if (!d.reconocido) return { texto: 'Institución no reconocida', clase: 'mal' }
  if (d.estado === 'no cuadra') return { texto: 'No cuadra', clase: 'mal' }
  if (d.estado === 'sin verificar') return { texto: 'SIN VERIFICAR', clase: 'ojo' }
  return { texto: `Verificado (${d.cobertura?.comparados ?? 0} totales)`, clase: 'bien' }
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
                  <td className={`estado ${estado.clase}`}>
                    {estado.texto}
                    {d.motivos?.length > 0 && (
                      <ul className="motivos">
                        {d.motivos.map((m, i) => (
                          <li key={i}>{m}</li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
