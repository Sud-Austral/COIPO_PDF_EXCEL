const monto = (n) => Number(n ?? 0).toLocaleString('es-CL')

/**
 * Los totales que el propio comprobante declara, contra la suma de lo extraído.
 * Es la comprobación que dice si el archivo se leyó completo.
 */
export default function Control({ control, documentos }) {
  const fallan = (control ?? []).filter((c) => !c.ok)
  // Un documento sin ninguna comparación es lo que hay que ver PRIMERO: antes, cero
  // totales daban cero fallos y la pantalla decía "todo cuadra".
  const sinControl = (documentos ?? []).filter((d) => d.reconocido && !d.duplicadoDe && !d.cobertura?.comparados)

  if (!control?.length && !sinControl.length) return null

  return (
    <section className="tarjeta">
      <h2>
        Totales de control{' '}
        {sinControl.length > 0 ? (
          <span className="pastilla mal">{sinControl.length} PDF sin comprobar</span>
        ) : fallan.length === 0 ? (
          <span className="pastilla bien">todo cuadra</span>
        ) : (
          <span className="pastilla mal">{fallan.length} sin cuadrar</span>
        )}
      </h2>
      <p className="nota">
        Cada comprobante declara sus propios totales. Acá se comparan con la suma de lo que se leyó.
      </p>
      {sinControl.map((d) => (
        <p key={d.archivo} className="pastilla mal">
          {d.archivo}: no se pudo comparar contra nada de su portada.
        </p>
      ))}
      <div className="tabla-scroll">
        <table>
          <thead>
            <tr>
              <th>Concepto</th>
              <th className="num">Dice el comprobante</th>
              <th className="num">Suma de lo extraído</th>
              <th className="num">Diferencia</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {control.map((c, i) => (
              <tr key={`${c.archivo}-${c.rotulo}-${i}`}>
                <td>{c.rotulo}</td>
                <td className="num mono">{monto(c.declarado)}</td>
                <td className="num mono">{monto(c.extraido)}</td>
                <td className="num mono">{monto(c.extraido - c.declarado)}</td>
                <td className={`marca ${c.ok ? 'bien' : 'mal'}`}>{c.ok ? '✔' : '✘'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
