import { useMemo, useState } from 'react'

const TOPE = 8

export default function Avisos({ avisos }) {
  const [abierto, setAbierto] = useState(null)

  const grupos = useMemo(() => {
    const m = new Map()
    for (const a of avisos ?? []) {
      if (!m.has(a.tipo)) m.set(a.tipo, [])
      m.get(a.tipo).push(a)
    }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length)
  }, [avisos])

  if (!avisos?.length) {
    return (
      <section className="tarjeta">
        <h2>
          Revisar <span className="pastilla bien">sin observaciones</span>
        </h2>
        <p className="nota">Todo el contenido de los PDF se leyó y se mapeó a alguna columna.</p>
      </section>
    )
  }

  return (
    <section className="tarjeta">
      <h2>
        Revisar <span className="pastilla ojo">{avisos.length}</span>
      </h2>
      <p className="nota">
        Estas observaciones también van en la hoja <strong>Revisar</strong> del Excel.
      </p>
      <ul className="avisos">
        {grupos.map(([tipo, lista]) => (
          <li key={tipo}>
            <button
              type="button"
              className="grupo"
              aria-expanded={abierto === tipo}
              onClick={() => setAbierto(abierto === tipo ? null : tipo)}
            >
              <span className="cuenta">{lista.length}</span>
              {tipo}
              <span className="flecha">{abierto === tipo ? '▾' : '▸'}</span>
            </button>
            {abierto === tipo && (
              <ul className="detalles">
                {lista.slice(0, TOPE).map((a, i) => (
                  <li key={i}>
                    {a.archivo && <span className="mono">{a.archivo}: </span>}
                    {a.detalle}
                  </li>
                ))}
                {lista.length > TOPE && (
                  <li className="nota">…y {lista.length - TOPE} más en la hoja Revisar del Excel.</li>
                )}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
