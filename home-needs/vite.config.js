
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'
import os from 'os'

const certFolder = path.join(os.homedir(), 'home-needs-certs')

const isLocalDevelopment = process.env.NODE_ENV !== 'production'

const httpsConfig = isLocalDevelopment
  ? {
      key: fs.readFileSync(path.join(certFolder, 'home-needs-key.pem')),
      cert: fs.readFileSync(path.join(certFolder, 'home-needs.pem'))
    }
  : undefined

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    ...(httpsConfig && { https: httpsConfig })
  }
})
