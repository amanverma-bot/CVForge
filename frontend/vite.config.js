import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
const hosts = ['.trycloudflare.com', 'localhost', '127.0.0.1']
export default defineConfig({ plugins: [react()], server: { port: 5173, host: '0.0.0.0', allowedHosts: hosts }, preview: { port: 5173, host: '0.0.0.0', allowedHosts: hosts } })
