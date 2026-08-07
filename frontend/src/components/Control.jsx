const monto = (n) => Number(n ?? 0).toLocaleString('es-CL')

/**
 * Los totales que el propio comprobante declara, contra la suma de lo extraído.
 * Es la comprobación que dice si el archivo se leyó completo.
 */
export default function Control({ control }) {
  if (!control?.length) return null
  const fallan = control.filter((c) => !c.ok)

  return (
    <section className="tarjeta">
      <h2>
        Totales de control{' '}
        {fallan.length === 0 ? (
          <span className="pastilla bien">todo cuadra</span>
        ) : (
          <span className="pastilla mal">{fallan.length} sin cuadrar</span>
        )}
      </h2>
      <p className="nota">
        Cada comprobante declara sus propios totales. Acá se comparan con la suma de lo que se leyó.
      </p>
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
