import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const frontendRoot = path.dirname(fileURLToPath(import.meta.url))
const apiTarget = process.env.VITE_API_URL
  ? process.env.VITE_API_URL.replace(/\/api\/?$/, '')
  : 'http://127.0.0.1:5001';

function copyLegacyFrontendFiles() {
  return {
    name: 'copy-legacy-frontend-files',
    apply: 'build',
    closeBundle() {
      const outputDir = path.join(frontendRoot, 'dist')
      for (const directory of ['assets', 'scripts', 'styles']) {
        const sourceDir = path.join(frontendRoot, directory)
        if (existsSync(sourceDir)) {
          cpSync(sourceDir, path.join(outputDir, directory), { recursive: true })
        }
      }

      const aliases = new Map()
      const copyPages = (directory) => {
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
          const sourcePath = path.join(directory, entry.name)
          if (entry.isDirectory()) {
            copyPages(sourcePath)
          } else if (/\.html$/i.test(entry.name)) {
            const existing = aliases.get(entry.name)
            if (existing) {
              throw new Error(`Duplicate frontend page name "${entry.name}": ${existing} and ${sourcePath}`)
            }
            aliases.set(entry.name, sourcePath)
          }
        }
      }

      copyPages(path.join(frontendRoot, 'pages'))
      for (const [name, sourcePath] of aliases) {
        const targetPath = path.join(outputDir, name)
        mkdirSync(path.dirname(targetPath), { recursive: true })
        copyFileSync(sourcePath, targetPath)
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), copyLegacyFrontendFiles()],
  server: {
    port: 3000,
    proxy: {
      '^/.*\\.html$': {
        target: 'http://127.0.0.1:5001',
        changeOrigin: true,
      },
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      }
    }
  }
})
