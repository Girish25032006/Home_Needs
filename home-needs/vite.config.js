
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'
import os from 'os'

const certFolder = path.join(os.homedir(), 'home-needs-certs')

export default defineConfig(({ command }) => ({
  plugins: [react()],

  server: {
    host: '0.0.0.0',
    port: 5173,

    ...(command === 'serve'
      ? {
          https: {
            key: fs.readFileSync(
              path.join(certFolder, 'home-needs-key.pem')
            ),
            cert: fs.readFileSync(
              path.join(certFolder, 'home-needs.pem')
            )
          }
        }
      : {})
  }
}))
