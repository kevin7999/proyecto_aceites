import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true, // Habilitar acceso externo en Docker
    watch: {
      usePolling: true, // Para asegurar que HMR funcione en contenedores Docker
    }
  }
})
