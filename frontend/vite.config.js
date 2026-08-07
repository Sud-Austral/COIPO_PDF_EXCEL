import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages sirve el sitio en https://<usuario>.github.io/COIPO_PDF_EXCEL/.
  // Si el repositorio cambia de nombre, hay que ajustar esto o los assets dan 404.
  base: process.env.VITE_BASE ?? '/COIPO_PDF_EXCEL/',
  plugins: [react()],
  worker: {
    format: 'es',
  },
  build: {
    // El bundle incluye pdf.js y ExcelJS; el aviso por defecto (500 kB) sería sólo ruido.
    chunkSizeWarningLimit: 1500,
  },
})
