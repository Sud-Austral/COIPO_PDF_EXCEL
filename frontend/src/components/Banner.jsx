import banner from '../assets/banner-conaf-uia.jpg'

// Cabecera institucional. No lleva encabezados a propósito: el <h1> de la app tiene
// que seguir siendo el primero del documento (scripts/verify-browser.mjs lo asume),
// y el nombre de la organización ya viaja en el alt de la imagen.
//
// width/height son las dimensiones ORIGINALES del JPEG: el navegador deriva de ahí
// aspect-ratio 3032/177 y reserva el alto antes de decodificar, así que no hay salto
// de contenido y la caja conserva su altura aunque la imagen no cargue.
export default function Banner() {
  return (
    <header className="banner">
      <img
        src={banner}
        alt="CONAF — Unidad de Información y Análisis"
        width={3032}
        height={177}
        fetchPriority="high"
        decoding="async"
      />
    </header>
  )
}
